// AudioWorklet: downsamples mic audio to 16 kHz mono Int16 PCM and posts
// ~100ms buffers back to the main thread for streaming to the Pneuma sidecar.
//
// The browser AudioContext may run at 44.1/48 kHz. We downsample to Whisper's
// fixed 16 kHz contract using a streaming box filter. Averaging each source
// window suppresses high-frequency aliasing that linear point sampling can
// introduce, particularly with 48 kHz Windows audio devices.

const TARGET_RATE = 16000;
const FRAME_SAMPLES = 1600; // 100ms @ 16kHz

class PCMProcessor extends AudioWorkletProcessor {
  constructor(options) {
    super();
    this.inputRate = (options && options.processorOptions && options.processorOptions.inputSampleRate) || sampleRate;
    this.phase = 0;
    this.sum = 0;
    this.count = 0;
    this.out = new Int16Array(FRAME_SAMPLES);
    this.outIdx = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const frameLength = input[0] ? input[0].length : 0;
    if (frameLength === 0) return true;

    // Some USB mixers expose two channels but put the microphone on channel 2.
    // Select the channel with the most signal for this render quantum instead
    // of blindly reading channel 1.
    let channel = input[0];
    let bestEnergy = -1;
    for (const candidate of input) {
      if (!candidate || candidate.length === 0) continue;
      let energy = 0;
      for (let i = 0; i < candidate.length; i++) energy += candidate[i] * candidate[i];
      if (energy > bestEnergy) {
        bestEnergy = energy;
        channel = candidate;
      }
    }

    for (let i = 0; i < channel.length; i++) {
      this.sum += channel[i];
      this.count += 1;
      this.phase += TARGET_RATE;

      if (this.phase < this.inputRate) continue;
      this.phase -= this.inputRate;

      const sample = this.count > 0 ? this.sum / this.count : 0;
      const clamped = Math.max(-1, Math.min(1, sample));
      this.out[this.outIdx++] = clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff;
      this.sum = 0;
      this.count = 0;

      if (this.outIdx >= FRAME_SAMPLES) {
        // Transfer ownership instead of copying on the audio render thread.
        const frame = this.out;
        this.port.postMessage(frame.buffer, [frame.buffer]);
        this.out = new Int16Array(FRAME_SAMPLES);
        this.outIdx = 0;
      }
    }

    return true;
  }
}

registerProcessor("pcm-processor", PCMProcessor);
