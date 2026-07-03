// AudioWorklet: downsamples mic audio to 16 kHz mono Int16 PCM and posts
// ~100ms buffers back to the main thread for streaming to the Pneuma sidecar.
//
// The browser AudioContext may run at 44.1/48 kHz; we resample to the fixed
// 16 kHz contract expected by Whisper using linear interpolation.

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 1600; // 100ms @ 16kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || sampleRate;
    this.ratio = this.inputRate / TARGET_RATE;
    this.fraction = 0; // running fractional read position between quanta
    this.out = new Int16Array(FRAME_SAMPLES);
    this.outIdx = 0;
    this.last = 0; // last input sample, for interpolation continuity
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channel = input[0];
    if (!channel || channel.length === 0) return true;

    let pos = this.fraction;
    while (pos < channel.length) {
      const i = Math.floor(pos);
      const frac = pos - i;
      const a = i > 0 ? channel[i - 1] : this.last;
      const b = channel[i];
      const sample = a + (b - a) * frac;

      // Float [-1,1] -> Int16
      const clamped = Math.max(-1, Math.min(1, sample));
      this.out[this.outIdx++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;

      if (this.outIdx >= FRAME_SAMPLES) {
        // Transfer a copy so the buffer can be reused.
        const frame = this.out.slice(0);
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.outIdx = 0;
      }
      pos += this.ratio;
    }

    this.last = channel[channel.length - 1];
    this.fraction = pos - channel.length;
    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
