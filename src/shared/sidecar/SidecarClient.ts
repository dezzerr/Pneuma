import type { TranscriptChunk } from "@/shared/types";

export type SidecarState = "connecting" | "ready" | "closed" | "error";

export type SidecarStatusState =
  | "ready"
  | "connecting"
  | "error"
  | "closed"
  | "deepgram_ready"
  | "idle_paused"
  | "connection_drop"
  | "engine_switched";

interface SidecarStatusMessage {
  event_type: "STATUS";
  payload: { state: string; message?: string };
}

interface SidecarTranscriptMessage {
  event_type: "TRANSCRIPT_CHUNK";
  payload: TranscriptChunk;
}

type SidecarMessage = SidecarStatusMessage | SidecarTranscriptMessage;

export interface SidecarHandlers {
  onTranscript?: (chunk: TranscriptChunk) => void;
  onState?: (state: SidecarState, message?: string) => void;
  onStatus?: (state: SidecarStatusState, message?: string) => void;
}

const DEFAULT_URL = "ws://127.0.0.1:8765";

/**
 * Thin WebSocket client for the Python inference sidecar. Streams raw PCM
 * (ArrayBuffer) up and receives TRANSCRIPT_CHUNK / STATUS messages down.
 */
export class SidecarClient {
  private ws: WebSocket | null = null;
  private url: string;
  private handlers: SidecarHandlers;
  private manuallyClosed = false;

  constructor(handlers: SidecarHandlers = {}, url: string = DEFAULT_URL) {
    this.handlers = handlers;
    this.url = url;
  }

  connect(): void {
    this.manuallyClosed = false;
    this.handlers.onState?.("connecting");
    try {
      const ws = new WebSocket(this.url);
      ws.binaryType = "arraybuffer";
      this.ws = ws;

      ws.onmessage = (ev) => {
        if (typeof ev.data !== "string") return;
        let msg: SidecarMessage;
        try {
          msg = JSON.parse(ev.data);
        } catch {
          return;
        }
        if (msg.event_type === "STATUS") {
          const rawState = msg.payload.state;
          // Forward all status states via onStatus
          this.handlers.onStatus?.(rawState as SidecarStatusState, msg.payload.message);
          // Backward-compat: onState only cares about ready/connecting
          const state = rawState === "ready" ? "ready" : "connecting";
          this.handlers.onState?.(state, msg.payload.message);
        } else if (msg.event_type === "TRANSCRIPT_CHUNK") {
          this.handlers.onTranscript?.(msg.payload);
        }
      };

      ws.onerror = () => this.handlers.onState?.("error");
      ws.onclose = () => {
        this.handlers.onState?.("closed");
        if (!this.manuallyClosed) this.scheduleReconnect();
      };
    } catch {
      this.handlers.onState?.("error");
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.manuallyClosed) return;
    setTimeout(() => {
      if (!this.manuallyClosed) this.connect();
    }, 1500);
  }

  /** Send a chunk of Int16 PCM audio to the sidecar. */
  sendPcm(buffer: ArrayBuffer): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(buffer);
    }
  }

  /** Send a JSON control message (e.g. reset). */
  sendControl(message: Record<string, unknown>): void {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(message));
    }
  }

  /** Switch the sidecar transcription engine (cloud | local). */
  setEngineMode(mode: "cloud" | "local"): void {
    this.sendControl({ type: "config", engine: mode });
  }

  /** Push runtime settings to the sidecar (inference delay, threshold, hot words, deepgram key). */
  pushSettings(settings: {
    inference_delay_ms?: number;
    semantic_threshold?: number;
    hot_words?: string[];
    deepgram_key?: string;
  }): void {
    this.sendControl({ type: "config", ...settings });
  }

  isOpen(): boolean {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  close(): void {
    this.manuallyClosed = true;
    this.ws?.close();
    this.ws = null;
  }
}
