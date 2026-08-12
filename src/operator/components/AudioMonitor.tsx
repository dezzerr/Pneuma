import { useEffect, useRef, useState } from "react";
import { useOperatorStore } from "../store";
import { Loader2, HardDrive, Play, Pause, Square } from "lucide-react";
import type { AudioDevice } from "@/shared/types";
import { AudioPipeline } from "../audio/AudioPipeline";
import { SidecarClient } from "@/shared/sidecar/SidecarClient";
import type { SidecarStatusState } from "@/shared/sidecar/SidecarClient";

export function AudioMonitor() {
  const {
    audioDevices,
    selectedDeviceId,
    setAudioDevices,
    setSelectedDevice,
    engineStatus,
    setEngineStatus,
    ingestTranscript,
    startSession,
    pauseSession,
    stopSession,
    appSettings,
  } = useOperatorStore();

  // Live capture pipeline (mic -> VU + 16kHz PCM) and sidecar WebSocket.
  const pipelineRef = useRef<AudioPipeline | null>(null);
  const sidecarRef = useRef<SidecarClient | null>(null);
  // The meter is intentionally local state. Putting a 20 fps signal in the
  // global Zustand store made every operator panel re-render on each frame.
  const [vuLevel, setVuLevel] = useState(0);
  const [sidecarState, setSidecarState] = useState<"idle" | "connecting" | "ready" | "error">(
    "idle",
  );

  // Enumerate real system input devices. Requesting permission first unlocks
  // device labels (browsers hide them until mic access is granted).
  const refreshDevices = async () => {
    try {
      const probe = await navigator.mediaDevices.getUserMedia({ audio: true });
      probe.getTracks().forEach((t) => t.stop());
    } catch (err) {
      console.error("Microphone permission denied or unavailable:", err);
      setEngineStatus("error");
      return;
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs: AudioDevice[] = devices
      .filter((d) => d.kind === "audioinput")
      .map((d, i) => ({
        id: d.deviceId,
        name: d.label || `Microphone ${i + 1}`,
        is_default: d.deviceId === "default",
      }));

    setAudioDevices(inputs);

    // Auto-select a sensible default if nothing is chosen yet.
    const current = useOperatorStore.getState().selectedDeviceId;
    const stillValid = inputs.some((d) => d.id === current);
    if (!current || !stillValid) {
      const fallback = inputs.find((d) => d.is_default) ?? inputs[0];
      if (fallback) setSelectedDevice(fallback.id);
    }
  };

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices.addEventListener("devicechange", refreshDevices);
    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", refreshDevices);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the engine is running, connect the sidecar and stream mic PCM to it,
  // while also driving the VU meter from the same capture stream.
  useEffect(() => {
    if (engineStatus !== "running") {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      sidecarRef.current?.close();
      sidecarRef.current = null;
      setVuLevel(0);
      setSidecarState("idle");
      return;
    }

    let cancelled = false;
    let pipelineStarted = false;

    const startPipeline = () => {
      if (cancelled || pipelineStarted) return;
      pipelineStarted = true;
      const pipeline = new AudioPipeline({
        onLevel: setVuLevel,
        onPcm: (buf) => sidecarRef.current?.sendPcm(buf),
        onError: () => setEngineStatus("error"),
      });
      pipelineRef.current = pipeline;
      void pipeline.start(selectedDeviceId);
    };

    setSidecarState("connecting");
    const sidecar = new SidecarClient({
      onTranscript: (chunk) => ingestTranscript(chunk),
      onState: (state) => {
        if (cancelled) return;
        if (state === "ready") {
          setSidecarState("ready");
          // Do not capture speech until the model is actually listening. On a
          // cold Windows start, model loading can take longer than UI startup.
          startPipeline();
        } else if (state === "error") {
          setSidecarState("error");
          console.error("[AudioMonitor] Sidecar connection error.");
        } else {
          setSidecarState("connecting");
        }
      },
      onStatus: (state: SidecarStatusState, message?: string) => {
        if (state === "error") console.error("[AudioMonitor] Sidecar reported an error:", message);
      },
    });
    sidecarRef.current = sidecar;
    sidecar.connect();
    // Private beta is intentionally local-first; cloud transcription is not a supported path yet.
    sidecar.setEngineMode("local");
    sidecar.pushSettings({
      inference_delay_ms: appSettings.inference_delay_ms,
      semantic_threshold: appSettings.semantic_threshold,
      hot_words: appSettings.hot_words,
    });

    return () => {
      cancelled = true;
      pipelineRef.current?.stop();
      sidecar.close();
      pipelineRef.current = null;
      sidecarRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineStatus, selectedDeviceId]);

  // Push settings changes to the running sidecar
  useEffect(() => {
    sidecarRef.current?.pushSettings({
      inference_delay_ms: appSettings.inference_delay_ms,
      semantic_threshold: appSettings.semantic_threshold,
      hot_words: appSettings.hot_words,
    });
  }, [appSettings.inference_delay_ms, appSettings.semantic_threshold, appSettings.hot_words]);

  // Single toggle: Start → Pause → Resume. Stop is a separate button.
  const handleToggle = async () => {
    if (engineStatus === "running") {
      pauseSession();
    } else if (engineStatus === "paused") {
      startSession();
    } else {
      startSession();
    }
  };

  const handleStop = async () => {
    stopSession();
  };

  // Simulated VU meter bars — compact horizontal strip
  const bars = Array.from({ length: 12 }, (_, i) => {
    const threshold = (i / 12) * 100;
    const active = vuLevel > threshold;
    const color = i < 8 ? "bg-primary" : i < 10 ? "bg-warning" : "bg-destructive";
    return { active, color };
  });

  return (
    <div className="flex items-center gap-3 rounded-full border border-border bg-card px-3 py-1.5 shadow-panel">
      {/* Device Selector */}
      <select
        value={selectedDeviceId ?? ""}
        onChange={(e) => setSelectedDevice(e.target.value)}
        className="max-w-[10rem] truncate rounded-full border-0 bg-transparent px-2 py-0.5 text-[11px] text-foreground outline-none focus:ring-0"
        title="Select microphone"
      >
        {audioDevices.length === 0 && <option value="">No microphones</option>}
        {audioDevices.map((device) => (
          <option key={device.id} value={device.id}>
            {device.name}
          </option>
        ))}
      </select>

      {/* VU Meter */}
      <div className="hidden items-end gap-0.5 h-5 sm:flex">
        {bars.map((bar, i) => (
          <div
            key={i}
            className={`w-1 rounded-full transition-all ${bar.active ? bar.color : "bg-muted"}`}
            style={{ height: `${30 + (i / 12) * 70}%` }}
          />
        ))}
      </div>

      {/* Session Controls: Start/Pause toggle + Stop */}
      <div className="flex items-center gap-1">
        {/* Start / Pause / Resume toggle */}
        <button
          onClick={handleToggle}
          disabled={engineStatus === "starting"}
          className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
          title={engineStatus === "running" ? "Pause session (releases mic)" : "Start session"}
        >
          {engineStatus === "starting" ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : engineStatus === "running" ? (
            <Pause className="h-3.5 w-3.5" />
          ) : (
            <Play className="h-3.5 w-3.5" />
          )}
          {engineStatus === "running" ? "Pause" : engineStatus === "paused" ? "Resume" : "Start"}
        </button>

        {/* Stop */}
        <button
          onClick={handleStop}
          disabled={engineStatus === "stopped" || engineStatus === "starting"}
          className="flex items-center gap-1 rounded-full bg-destructive px-2.5 py-1.5 text-[11px] font-medium text-destructive-foreground transition-colors hover:bg-destructive/90 disabled:opacity-40"
          title="Stop session (releases mic, resets timer)"
        >
          <Square className="h-3.5 w-3.5" />
          Stop
        </button>
      </div>

      <div
        className="flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium text-muted-foreground"
        title={
          sidecarState === "ready"
            ? "Local transcription is ready"
            : sidecarState === "error"
              ? "The local transcription engine is reconnecting"
              : "Waiting for the local transcription model"
        }
      >
        {sidecarState === "connecting" ? (
          <Loader2 className="h-3 w-3 animate-spin text-warning" />
        ) : (
          <HardDrive className={`h-3 w-3 ${sidecarState === "error" ? "text-destructive" : ""}`} />
        )}
        <span>
          {sidecarState === "ready"
            ? "AI Ready"
            : sidecarState === "connecting"
              ? "AI Loading"
              : sidecarState === "error"
                ? "Reconnecting"
                : "Local"}
        </span>
      </div>
    </div>
  );
}
