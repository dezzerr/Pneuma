// Captures microphone audio for a selected device and fans it out to:
//   1. an AnalyserNode for the VU meter (RMS level callback), and
//   2. an AudioWorklet that emits 16 kHz Int16 PCM frames for the sidecar.
//
// One getUserMedia stream feeds both paths.

const WORKLET_URL = "/worklets/pcm-processor.js";
const METER_INTERVAL_MS = 50; // 20 fps is smooth without repainting the UI continuously.

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
  private silentSink: GainNode | null = null;
  private raf: number | null = null;
  private lastMeterAt = 0;
  private handlers: AudioPipelineHandlers;

  constructor(handlers: AudioPipelineHandlers = {}) {
    this.handlers = handlers;
  }

  async start(deviceId: string | null): Promise<void> {
    this.stop();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          ...(deviceId ? { deviceId: { exact: deviceId } } : {}),
          // Windows audio interfaces frequently expose stereo inputs even when
          // only one channel carries the microphone. Ask the browser for mono,
          // while the worklet still handles multi-channel devices defensively.
          channelCount: { ideal: 1 },
          // Keep the PCM contract consistent across CoreAudio and WebView2.
          // Platform DSP can otherwise produce very different gain and gating.
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
        },
      });
      this.stream = stream;

      const ctx = new AudioContext();
      this.ctx = ctx;
      const source = ctx.createMediaStreamSource(stream);

      // VU metering path
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
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
        const silentSink = ctx.createGain();
        silentSink.gain.value = 0;
        this.silentSink = silentSink;
        source.connect(worklet);
        // Web Audio is pull-driven. WebView2 may stop processing a graph branch
        // that has no destination, even though its worklet posts messages.
        // A zero-gain sink keeps capture scheduled without audible monitoring.
        worklet.connect(silentSink);
        silentSink.connect(ctx.destination);
        if (ctx.state === "suspended") await ctx.resume();
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
    const tick = (now: number) => {
      if (now - this.lastMeterAt < METER_INTERVAL_MS) {
        this.raf = requestAnimationFrame(tick);
        return;
      }
      this.lastMeterAt = now;
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
    this.raf = requestAnimationFrame(tick);
  }

  stop(): void {
    if (this.raf !== null) cancelAnimationFrame(this.raf);
    this.raf = null;
    this.lastMeterAt = 0;
    if (this.worklet) {
      this.worklet.port.onmessage = null;
      this.worklet.disconnect();
      this.worklet = null;
    }
    this.silentSink?.disconnect();
    this.silentSink = null;
    this.analyser?.disconnect();
    this.analyser = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
    this.ctx?.close().catch(() => {});
    this.ctx = null;
    this.handlers.onLevel?.(0);
  }
}
