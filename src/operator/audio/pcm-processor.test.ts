import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";

interface TestProcessor {
  port: { postMessage: ReturnType<typeof vi.fn> };
  process(inputs: Float32Array[][]): boolean;
}

type TestProcessorConstructor = new (options: {
  processorOptions: { inputSampleRate: number };
}) => TestProcessor;

function loadProcessor(sampleRate: number): TestProcessorConstructor {
  const source = readFileSync(resolve(process.cwd(), "public/worklets/pcm-processor.js"), "utf8");
  let processorConstructor: TestProcessorConstructor | undefined;

  class TestAudioWorkletProcessor {
    port = { postMessage: vi.fn() };
  }

  runInNewContext(source, {
    AudioWorkletProcessor: TestAudioWorkletProcessor,
    Float32Array,
    Int16Array,
    Math,
    sampleRate,
    registerProcessor: (_name: string, constructor: TestProcessorConstructor) => {
      processorConstructor = constructor;
    },
  });

  if (!processorConstructor) throw new Error("PCM worklet did not register");
  return processorConstructor;
}

describe("PCM audio worklet", () => {
  it("produces exactly 16kHz PCM from a 48kHz input", () => {
    const Processor = loadProcessor(48_000);
    const processor = new Processor({ processorOptions: { inputSampleRate: 48_000 } });

    processor.process([[new Float32Array(4_800).fill(0.25)]]);

    expect(processor.port.postMessage).toHaveBeenCalledTimes(1);
    const [buffer] = processor.port.postMessage.mock.calls[0] as [ArrayBuffer, ArrayBuffer[]];
    const pcm = new Int16Array(buffer);
    expect(pcm).toHaveLength(1_600);
    expect(pcm[0]).toBeGreaterThan(8_000);
  });

  it("uses the active channel when channel one is silent", () => {
    const Processor = loadProcessor(48_000);
    const processor = new Processor({ processorOptions: { inputSampleRate: 48_000 } });
    const silent = new Float32Array(4_800);
    const active = new Float32Array(4_800).fill(0.5);

    processor.process([[silent, active]]);

    const [buffer] = processor.port.postMessage.mock.calls[0] as [ArrayBuffer, ArrayBuffer[]];
    const pcm = new Int16Array(buffer);
    expect(pcm[0]).toBeGreaterThan(16_000);
  });
});
