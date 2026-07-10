// Captures microphone audio for a selected device and fans it out to:
//   1. an AnalyserNode for the VU meter (RMS level callback), and
//   2. an AudioWorklet that emits 16 kHz Int16 PCM frames for the sidecar.
//
// One getUserMedia stream feeds both paths.

const WORKLET_URL = "/worklets/pcm-processor.js";

export interface AudioPipelineHandlers {
  onLevel?: (level: number) => void; // 0..100
  onPcm?: (buffer: ArrayBuffer) => void; // Int16 PCM @ 16kHz
  onError?: (err: unknown) => void;
}

export class AudioPipeline {
  private stream: MediaStream | null = null;
  private ctx: AudioContext | null = null;
  private analyser: AnalyserNode | null = null;
  private worklet: AudioWorkletNode | null = null;
  private raf: number | null = null;
  private handlers: AudioPipelineHandlers;

  constructor(handlers: AudioPipelineHandlers = {}) {
    this.handlers = handlers;
  }

  async start(deviceId: string | null): Promise<void> {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: deviceId ? { deviceId: { exact: deviceId } } : true,
      });
      this.stream = stream;

      const ctx = new AudioContext();
      this.ctx = ctx;
      const source = ctx.createMediaStreamSource(stream);

      // VU metering path
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 1024;
      this.analyser = analyser;
      source.connect(analyser);
      this.startMeter();

      // PCM streaming path (AudioWorklet)
      try {
        await ctx.audioWorklet.addModule(WORKLET_URL);
        const worklet = new AudioWorkletNode(ctx, "pcm-processor", {
          processorOptions: { inputSampleRate: ctx.sampleRate },
        });
        worklet.port.onmessage = (ev) => {
          this.handlers.onPcm?.(ev.data as ArrayBuffer);
        };
        this.worklet = worklet;
        source.connect(worklet);
        // Worklet has no audible output; do not connect to destination.
      } catch (err) {
        // VU still works even if the worklet fails to load.
        console.error("[AudioPipeline] Worklet load failed:", err);
        this.handlers.onError?.(err);
      }
    } catch (err) {
      console.error("[AudioPipeline] Capture failed:", err);
      this.handlers.onError?.(err);
      this.stop();
    }
  }

  private startMeter(): void {
    const analyser = this.analyser;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      const rms = Math.sqrt(sum / data.length);
      this.handlers.onLevel?.(Math.min(100, rms * 250));
      this.raf = requestAnimationFrame(tick);
    };
    tick();
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
      this.worklet = null;
    }
    this.analyser?.disconnect();
    this.analyser = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.handlers.onLevel?.(0);
  }
}
