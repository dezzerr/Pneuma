"""Offline Faster-Whisper worker. PCM16LE on stdin, JSON lines on stdout."""

import argparse
from collections import deque
import json
from pathlib import Path
import sys
from threading import Condition, Thread

import numpy as np
import onnxruntime
from faster_whisper import WhisperModel

SAMPLE_RATE = 16_000
FRAME_SAMPLES = SAMPLE_RATE // 10
START_RMS = 0.008
CONTINUE_RMS = 0.004
SILENCE_SAMPLES = 7 * FRAME_SAMPLES
MIN_SAMPLES = 5_600
MAX_SAMPLES = 15 * SAMPLE_RATE
PARTIAL_INTERVAL = 14 * FRAME_SAMPLES
PARTIAL_WINDOW = 6 * SAMPLE_RATE

# The original Pneuma's prompt and decoding options.
BIBLE_PROMPT = (
    "Genesis Exodus Leviticus Numbers Deuteronomy Joshua Judges Ruth "
    "Samuel Kings Chronicles Ezra Nehemiah Esther Job Psalms Proverbs "
    "Ecclesiastes Song of Solomon Isaiah Jeremiah Lamentations Ezekiel "
    "Daniel Hosea Joel Amos Obadiah Jonah Micah Nahum Habakkuk "
    "Zephaniah Haggai Zechariah Malachi Matthew Mark Luke John Acts "
    "Romans Corinthians Galatians Ephesians Philippians Colossians "
    "Thessalonians Timothy Titus Philemon Hebrews James Peter Jude "
    "Revelation chapter verse chapters verses first second third "
    "first Corinthians second Thessalonians first Timothy second Peter"
)


def send(kind, **payload):
    print(json.dumps({"type": kind, **payload}), flush=True)


class Listener:
    def __init__(self, model, partials):
        self.model = model
        self.partials = partials
        self.preroll = deque(maxlen=3)
        self.chunks = []
        self.samples = self.silence = self.since_partial = self.position = 0
        self.revision = 0
        self.condition = Condition()
        self.finals = deque()
        self.partial = None
        self.closing = False
        self.failed = False

    def push(self, pcm):
        samples = np.frombuffer(pcm, dtype="<i2").astype(np.float32) / 32768
        self.position += samples.size
        rms = float(np.sqrt(np.mean(samples**2)))
        threshold = CONTINUE_RMS if self.chunks else START_RMS
        if rms >= threshold:
            if not self.chunks:
                self.chunks.extend(self.preroll)
                self.samples = sum(chunk.size for chunk in self.preroll)
                self.preroll.clear()
            self.silence = 0
        elif self.chunks:
            self.silence += samples.size
        else:
            self.preroll.append(samples)
            return

        self.chunks.append(samples)
        self.samples += samples.size
        self.since_partial += samples.size
        if self.silence >= SILENCE_SAMPLES or self.samples >= MAX_SAMPLES:
            self.finalize()
        elif self.partials and self.since_partial >= PARTIAL_INTERVAL:
            self.since_partial = 0
            with self.condition:
                if not self.finals:
                    self.partial = (self.revision, np.concatenate(self.chunks)[-PARTIAL_WINDOW:])
                    self.condition.notify()

    def finalize(self):
        if not self.chunks:
            return
        with self.condition:
            self.revision += 1
            self.partial = None
            if self.samples >= MIN_SAMPLES:
                if len(self.finals) >= 4:
                    raise RuntimeError("Faster-Whisper could not keep up with live audio.")
                self.finals.append((np.concatenate(self.chunks), self.position - self.samples, self.position))
            self.condition.notify()
        self.chunks.clear()
        self.preroll.clear()
        self.samples = self.silence = self.since_partial = 0

    def decode(self, audio):
        segments, _ = self.model.transcribe(
            audio,
            language="en",
            beam_size=1,
            vad_filter=True,
            condition_on_previous_text=False,
            initial_prompt=BIBLE_PROMPT,
        )
        return " ".join(part.text.strip() for part in segments).strip()

    def run(self):
        try:
            while True:
                with self.condition:
                    self.condition.wait_for(lambda: self.finals or self.partial or self.closing)
                    if self.finals:
                        final = True
                        audio, start, end = self.finals.popleft()
                    elif self.closing:
                        return
                    else:
                        final = False
                        revision, audio = self.partial
                        self.partial = None

                text = self.decode(audio)
                if final:
                    if text:
                        send("segment", segment={
                            "text": text, "startMs": start / 16, "endMs": end / 16,
                            "utteranceEnd": True, "language": "en",
                        })
                    else:
                        send("interim", text="")
                else:
                    with self.condition:
                        if revision == self.revision and text:
                            send("interim", text=text)
        except Exception as error:
            self.failed = True
            send("error", message=str(error))


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("model", type=Path)
    parser.add_argument("--finals-only", action="store_true", help="Decode a replay without wall-clock pacing.")
    args = parser.parse_args()

    onnxruntime.disable_telemetry_events()
    model = WhisperModel(str(args.model), device="cpu", compute_type="int8", cpu_threads=3, local_files_only=True)
    listener = Listener(model, partials=not args.finals_only)
    worker = Thread(target=listener.run, daemon=True)
    worker.start()
    send("ready")
    while pcm := sys.stdin.buffer.read(2 * FRAME_SAMPLES):
        if listener.failed:
            return 1
        listener.push(pcm)
    listener.finalize()
    with listener.condition:
        listener.closing = True
        listener.condition.notify()
    worker.join()
    return int(listener.failed)


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        send("error", message=str(exc))
        sys.exit(1)
