import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { SidecarClient, type SidecarHandlers } from "@/shared/sidecar/SidecarClient";
import type { TranscriptChunk } from "@/shared/types";

// Mock WebSocket is set up in src/test/setup.ts

describe("SidecarClient", () => {
  let client: SidecarClient;
  let handlers: SidecarHandlers;

  beforeEach(() => {
    vi.useFakeTimers();
    handlers = {
      onTranscript: vi.fn(),
      onState: vi.fn(),
      onStatus: vi.fn(),
    };
    client = new SidecarClient(handlers);
  });

  afterEach(() => {
    client.close();
    vi.useRealTimers();
  });

  function getMockWs() {
    return (client as unknown as { ws: WebSocket }).ws;
  }

  /** Advance fake timers so the MockWebSocket "connects" (readyState → OPEN). */
  function flushConnect() {
    vi.advanceTimersByTime(10);
  }

  describe("connect", () => {
    it("calls onState with connecting", () => {
      client.connect();
      expect(handlers.onState).toHaveBeenCalledWith("connecting");
    });

    it("creates WebSocket with default URL", () => {
      client.connect();
      const ws = getMockWs();
      expect((ws as unknown as { url: string }).url).toBe("ws://127.0.0.1:8765");
    });

    it("creates WebSocket with custom URL", () => {
      const custom = new SidecarClient(handlers, "ws://localhost:9999");
      custom.connect();
      const ws = (custom as unknown as { ws: WebSocket }).ws;
      expect((ws as unknown as { url: string }).url).toBe("ws://localhost:9999");
      custom.close();
    });
  });

  describe("message handling", () => {
    it("parses STATUS messages and calls onStatus", () => {
      client.connect();
      const ws = getMockWs();

      const statusMsg = JSON.stringify({
        event_type: "STATUS",
        payload: { state: "ready", message: "" },
      });
      ws.onmessage?.({ data: statusMsg } as MessageEvent);

      expect(handlers.onStatus).toHaveBeenCalledWith("ready", "");
      expect(handlers.onState).toHaveBeenCalledWith("ready", "");
    });

    it("parses TRANSCRIPT_CHUNK messages and calls onTranscript", () => {
      client.connect();
      const ws = getMockWs();

      const chunk: TranscriptChunk = {
        raw_text: "john three sixteen",
        is_final: true,
        confidence_score: 0.95,
        detected_scriptures: [],
      };
      const msg = JSON.stringify({
        event_type: "TRANSCRIPT_CHUNK",
        payload: chunk,
      });
      ws.onmessage?.({ data: msg } as MessageEvent);

      expect(handlers.onTranscript).toHaveBeenCalledWith(chunk);
    });

    it("ignores non-string messages", () => {
      client.connect();
      const ws = getMockWs();

      ws.onmessage?.({ data: new ArrayBuffer(8) } as MessageEvent);

      expect(handlers.onTranscript).not.toHaveBeenCalled();
      expect(handlers.onStatus).not.toHaveBeenCalled();
    });

    it("ignores invalid JSON", () => {
      client.connect();
      const ws = getMockWs();

      ws.onmessage?.({ data: "not valid json" } as MessageEvent);

      expect(handlers.onTranscript).not.toHaveBeenCalled();
    });

    it("maps deepgram_ready status to connecting for onState", () => {
      client.connect();
      const ws = getMockWs();

      const msg = JSON.stringify({
        event_type: "STATUS",
        payload: { state: "deepgram_ready" },
      });
      ws.onmessage?.({ data: msg } as MessageEvent);

      expect(handlers.onStatus).toHaveBeenCalledWith("deepgram_ready", undefined);
      expect(handlers.onState).toHaveBeenCalledWith("connecting", undefined);
    });
  });

  describe("error and close handling", () => {
    it("calls onState with error on ws error", () => {
      client.connect();
      const ws = getMockWs();

      ws.onerror?.(new Event("error"));

      expect(handlers.onState).toHaveBeenCalledWith("error");
    });

    it("calls onState with closed on ws close", () => {
      client.connect();
      const ws = getMockWs();

      ws.onclose?.(new CloseEvent("close"));

      expect(handlers.onState).toHaveBeenCalledWith("closed");
    });
  });

  describe("sendPcm", () => {
    it("sends ArrayBuffer when ws is open", () => {
      client.connect();
      flushConnect();
      const ws = getMockWs();
      const sendSpy = vi.spyOn(ws, "send");

      const buffer = new ArrayBuffer(16);
      client.sendPcm(buffer);
      expect(sendSpy).toHaveBeenCalledWith(buffer);
    });

    it("does nothing when ws is not open", () => {
      client.connect();
      // Don't flush — readyState stays 0 (CONNECTING)
      const ws = getMockWs();
      const sendSpy = vi.spyOn(ws, "send");

      client.sendPcm(new ArrayBuffer(16));
      expect(sendSpy).not.toHaveBeenCalled();
    });

    it("does nothing when ws is null", () => {
      client.close();
      client.sendPcm(new ArrayBuffer(16));
    });
  });

  describe("sendControl", () => {
    it("sends JSON string when ws is open", () => {
      client.connect();
      flushConnect();
      const ws = getMockWs();
      const sendSpy = vi.spyOn(ws, "send");

      client.sendControl({ type: "reset" });
      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "reset" }));
    });
  });

  describe("setEngineMode", () => {
    it("sends config message with engine mode", () => {
      client.connect();
      flushConnect();
      const ws = getMockWs();
      const sendSpy = vi.spyOn(ws, "send");

      client.setEngineMode("cloud");
      expect(sendSpy).toHaveBeenCalledWith(JSON.stringify({ type: "config", engine: "cloud" }));
    });
  });

  describe("pushSettings", () => {
    it("sends config message with settings", () => {
      client.connect();
      flushConnect();
      const ws = getMockWs();
      const sendSpy = vi.spyOn(ws, "send");

      client.pushSettings({ inference_delay_ms: 500, hot_words: ["pastor"] });
      const sent = sendSpy.mock.calls[0][0];
      const parsed = JSON.parse(sent as string);
      expect(parsed.type).toBe("config");
      expect(parsed.inference_delay_ms).toBe(500);
      expect(parsed.hot_words).toEqual(["pastor"]);
    });
  });

  describe("isOpen", () => {
    it("returns true when ws is open", () => {
      client.connect();
      flushConnect();
      expect(client.isOpen()).toBe(true);
    });

    it("returns false when ws is not open", () => {
      client.connect();
      // Don't flush — readyState stays 0 (CONNECTING)
      expect(client.isOpen()).toBe(false);
    });

    it("returns false when ws is null", () => {
      client.close();
      expect(client.isOpen()).toBe(false);
    });
  });

  describe("close", () => {
    it("sets manuallyClosed and closes ws", () => {
      client.connect();
      const ws = getMockWs();
      const closeSpy = vi.spyOn(ws, "close");

      client.close();
      expect(closeSpy).toHaveBeenCalled();
      expect((client as unknown as { ws: WebSocket | null }).ws).toBeNull();
    });

    it("does not reconnect after manual close", () => {
      client.connect();
      const ws = getMockWs();

      client.close();
      ws.onclose?.(new CloseEvent("close"));

      expect(handlers.onState).toHaveBeenCalledWith("closed");
    });
  });
});
