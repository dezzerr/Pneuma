import { useEffect, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOperatorStore } from "../store";
import { Loader2, Cloud, HardDrive, AlertTriangle, PauseCircle, Play, Pause, Square, ArrowUpCircle } from "lucide-react";
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
    engineMode,
    setEngineMode,
    engineWarning,
    setEngineWarning,
    setVuLevel,
    ingestTranscript,
    vuLevel,
    startSession,
    pauseSession,
    stopSession,
    appSettings,
    saasState,
    refreshSaasState,
    setDrawerTab,
    deepgramKeySet,
    startCloudSessionMetering,
    pauseCloudSessionMetering,
    stopCloudSessionMetering,
  } = useOperatorStore();

  // Live capture pipeline (mic -> VU + 16kHz PCM) and sidecar WebSocket.
  const pipelineRef = useRef<AudioPipeline | null>(null);
  const sidecarRef = useRef<SidecarClient | null>(null);

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

  const beginCloudMode = async () => {
    if (!deepgramKeySet) {
      setEngineWarning("deepgram_key_missing");
      throw new Error("Deepgram API key missing");
    }
    try {
      const state = await startCloudSessionMetering();
      setEngineWarning(null);
      return state;
    } catch (err) {
      const nextWarning = saasState.account.signed_in ? "quota_exhausted" : "sign_in_required";
      setEngineWarning(nextWarning);
      throw err;
    }
  };

  // When the engine is running, connect the sidecar and stream mic PCM to it,
  // while also driving the VU meter from the same capture stream.
  useEffect(() => {
    if (engineStatus !== "running") {
      pipelineRef.current?.stop();
      pipelineRef.current = null;
      sidecarRef.current?.close();
      sidecarRef.current = null;
      return;
    }

    const sidecar = new SidecarClient({
      onTranscript: (chunk) => ingestTranscript(chunk),
      onState: (state) => {
        if (state === "error") {
          console.error("[AudioMonitor] Sidecar connection error.");
        }
      },
      onStatus: (state: SidecarStatusState, message?: string) => {
        if (state === "idle_paused") {
          setEngineWarning("idle_paused");
        } else if (state === "connection_drop") {
          setEngineWarning("connection_drop");
        } else if (state === "engine_switched") {
          if (message === "cloud") setEngineMode("cloud");
          else if (message === "local") setEngineMode("local");
          setEngineWarning(null);
        } else if (state === "deepgram_ready") {
          setEngineWarning(null);
        }
      },
    });
    sidecarRef.current = sidecar;
    sidecar.connect();
    // Apply the operator's engine mode preference as soon as the WS opens.
    // setEngineMode is a no-op if the sidecar is already in that mode.
    sidecar.setEngineMode(engineMode);

    const pipeline = new AudioPipeline({
      onLevel: (level) => setVuLevel(level),
      onPcm: (buf) => sidecar.sendPcm(buf),
      onError: () => setEngineStatus("error"),
    });
    pipelineRef.current = pipeline;
    pipeline.start(selectedDeviceId);

    return () => {
      pipeline.stop();
      sidecar.close();
      pipelineRef.current = null;
      sidecarRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engineStatus, selectedDeviceId]);

  // Push settings changes to the running sidecar
  useEffect(() => {
    if (sidecarRef.current?.isOpen()) {
      sidecarRef.current.pushSettings({
        inference_delay_ms: appSettings.inference_delay_ms,
        semantic_threshold: appSettings.semantic_threshold,
        hot_words: appSettings.hot_words,
      });
    }
  }, [appSettings.inference_delay_ms, appSettings.semantic_threshold, appSettings.hot_words]);

  // Single toggle: Start → Pause → Resume. Stop is a separate button.
  const handleToggle = async () => {
    if (engineStatus === "running") {
      if (engineMode === "cloud") {
        try {
          await pauseCloudSessionMetering();
        } catch {}
      }
      pauseSession();
    } else if (engineStatus === "paused") {
      if (engineMode === "cloud") {
        try {
          await beginCloudMode();
        } catch {
          return;
        }
      }
      startSession();
    } else {
      if (engineMode === "cloud") {
        try {
          await beginCloudMode();
        } catch {
          return;
        }
      }
      setEngineStatus("starting");
      setTimeout(() => startSession(), 800);
    }
  };

  const handleStop = async () => {
    if (engineMode === "cloud") {
      try {
        await stopCloudSessionMetering();
      } catch {}
    }
    stopSession();
  };

  const handleToggleEngineMode = async () => {
    const newMode = engineMode === "cloud" ? "local" : "cloud";
    if (newMode === "cloud") {
      if (!deepgramKeySet) {
        setEngineWarning("deepgram_key_missing");
        return;
      }
      if (engineStatus === "running") {
        try {
          await beginCloudMode();
        } catch {
          return;
        }
      }
    }
    if (engineMode === "cloud" && newMode === "local") {
      try {
        await stopCloudSessionMetering();
      } catch {}
    }
    setEngineMode(newMode);
    if (sidecarRef.current?.isOpen()) {
      sidecarRef.current.setEngineMode(newMode);
    }
  };

  // Push Deepgram key from OS keychain to the running sidecar when key status changes.
  useEffect(() => {
    if (!sidecarRef.current?.isOpen()) return;
    if (deepgramKeySet) {
      invoke<string | null>("credential_load", { key: "deepgram_api_key" })
        .then((key) => {
          if (key && sidecarRef.current?.isOpen()) {
            sidecarRef.current.pushSettings({ deepgram_key: key });
          }
        })
        .catch((err) => console.error("[AudioMonitor] Failed to load Deepgram key from keychain:", err));
    } else {
      sidecarRef.current.pushSettings({ deepgram_key: "" });
    }
  }, [deepgramKeySet]);

  useEffect(() => {
    refreshSaasState();
  }, [refreshSaasState]);

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

      {/* Engine Mode Toggle */}
      <button
        onClick={handleToggleEngineMode}
        className={`flex items-center gap-1 rounded-full border border-border px-2 py-1 text-[11px] font-medium transition-colors hover:bg-secondary ${
          engineMode === "cloud" ? "text-blue-500" : "text-muted-foreground"
        }`}
        title="Toggle engine mode"
      >
        {engineMode === "cloud" ? (
          <Cloud className="h-3 w-3" />
        ) : (
          <HardDrive className="h-3 w-3" />
        )}
        <span className="capitalize">{engineMode}</span>
      </button>

      {/* Guardrail Warnings */}
      {engineWarning === "idle_paused" && (
        <div className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[10px] text-warning">
          <PauseCircle className="h-3 w-3" />
          Idle
        </div>
      )}
      {engineWarning === "connection_drop" && (
        <div className="flex items-center gap-1 rounded-full bg-destructive/10 px-2 py-1 text-[10px] text-destructive">
          <AlertTriangle className="h-3 w-3" />
          Drop
        </div>
      )}
      {engineWarning === "sign_in_required" && (
        <div className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[10px] text-warning">
          <AlertTriangle className="h-3 w-3" />
          Sign In
        </div>
      )}
      {engineWarning === "quota_exhausted" && (
        <div className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[10px] text-warning">
          <AlertTriangle className="h-3 w-3" />
          Quota
        </div>
      )}
      {engineWarning === "deepgram_key_missing" && (
        <div className="flex items-center gap-1 rounded-full bg-warning/10 px-2 py-1 text-[10px] text-warning">
          <AlertTriangle className="h-3 w-3" />
          Key
        </div>
      )}

      {/* Upsell prompt when cloud is blocked */}
      {(engineWarning === "quota_exhausted" || engineWarning === "sign_in_required") && (
        <button
          onClick={() => setDrawerTab("billing")}
          className="flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 text-[10px] font-medium text-primary transition-colors hover:bg-primary/20"
          title="Upgrade or manage your plan"
        >
          <ArrowUpCircle className="h-3 w-3" />
          Upgrade
        </button>
      )}
    </div>
  );
}
