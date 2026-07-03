import { invoke } from "@tauri-apps/api/core";
import { useState, useEffect } from "react";
import { AudioMonitor } from "./components/AudioMonitor";
import { TranscriptConsole } from "./components/TranscriptConsole";
import { PreviewCanvas } from "./components/PreviewCanvas";
import { LiveOutputMonitor } from "./components/LiveOutputMonitor";
import { PlaylistQueue } from "./components/PlaylistQueue";
import { AIDetectionsPool } from "./components/AIDetectionsPool";
import { ThemePanel } from "./components/ThemePanel";
import { LiveVerseControls } from "./components/LiveVerseControls";
import { OperatorDrawer } from "./components/OperatorDrawer";
import { ScriptureSearch } from "./components/ScriptureSearch";
import { HelpOverlay } from "./components/HelpOverlay";
import { useHotkeys } from "./hooks/useHotkeys";
import { useOperatorStore } from "./store";
import { useTauriEvent } from "@/shared/hooks/useTauriEvent";
import { EVENTS } from "@/shared/events";
import type { TranscriptChunk, ThemeConfig } from "@/shared/types";
import {
  Monitor,
  Settings2,
  Presentation,
  Activity,
  Menu,
  Radio,
  Cloud,
  HardDrive,
} from "lucide-react";

interface NdiStatusPayload {
  active: boolean;
  error: string | null;
}

function formatSessionTime(ms: number) {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${pad(hours)}:${pad(minutes)}:${pad(seconds)}`;
}

export default function OperatorApp() {
  const {
    drawerTab,
    setDrawerTab,
    canvasState,
    setCanvasState,
    ingestTranscript,
    setTheme,
    engineMode,
    liveSync,
    sessionElapsedMs,
    sessionRunning,
    tickSession,
    engineStatus,
    loadSettings,
    loadSaasState,
    loadDeepgramKeyStatus,
    refreshSaasState,
    appSettings,
  } = useOperatorStore();
  useHotkeys();
  const [ndiActive, setNdiActive] = useState(false);

  // Load persisted settings on mount
  useEffect(() => {
    loadSettings();
    loadSaasState();
    loadDeepgramKeyStatus();
  }, [loadSettings, loadSaasState, loadDeepgramKeyStatus]);

  useEffect(() => {
    if (!sessionRunning || engineMode !== "cloud") return;
    const interval = setInterval(() => {
      refreshSaasState();
    }, 1000);
    return () => clearInterval(interval);
  }, [sessionRunning, engineMode, refreshSaasState]);

  // Session timer — ticks only while session is running
  useEffect(() => {
    if (!sessionRunning) return;
    const interval = setInterval(() => tickSession(), 1000);
    return () => clearInterval(interval);
  }, [sessionRunning, tickSession]);

  // Listen for transcript chunks relayed via Tauri events (alternate path).
  // The primary path is the sidecar WebSocket handled in AudioMonitor.
  useTauriEvent<TranscriptChunk>(EVENTS.TRANSCRIPT_CHUNK, (chunk) => {
    ingestTranscript(chunk);
  });

  // Listen for NDI broadcast status updates
  useTauriEvent<NdiStatusPayload>(EVENTS.NDI_STATUS, (payload) => {
    setNdiActive(payload.active);
  });

  // Listen for theme updates from presentation window sync
  useTauriEvent<ThemeConfig>(EVENTS.THEME_UPDATED, (newTheme) => {
    setTheme(newTheme);
  });

  // Listen for canvas state changes
  useTauriEvent<string>(EVENTS.CANVAS_BLACKOUT, () => setCanvasState("blackout"));
  useTauriEvent<string>(EVENTS.CANVAS_CLEAR, () => setCanvasState("clear"));
  useTauriEvent<string>(EVENTS.CANVAS_FREEZE, () => setCanvasState("freeze"));
  useTauriEvent<string>(EVENTS.CANVAS_RESUME, () => setCanvasState("normal"));

  const handleLaunchPresentation = async () => {
    try {
      await invoke("create_presentation_window");
    } catch (e) {
      console.error("Failed to create presentation window:", e);
    }
  };

  const activeDrawer = drawerTab !== null;

  return (
    <div className="relative flex h-screen w-screen flex-col bg-background text-foreground">
      {/* Top Header */}
      <header className="flex items-center justify-between border-b border-border bg-surface px-4 py-2.5">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10">
              <Activity className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h1 className="text-sm font-semibold leading-tight">Pneuma</h1>
              <p className="text-[10px] text-muted-foreground">Live Voice-to-Scripture</p>
            </div>
          </div>

          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-panel lg:flex">
            <span className="text-[10px] font-medium text-muted-foreground">SESSION</span>
            <span className="text-xs font-medium tabular-nums text-foreground">{formatSessionTime(sessionElapsedMs)}</span>
            <span className="h-3 w-px bg-border" />
            <span className={`text-[10px] font-medium ${
              engineStatus === "running" ? "text-primary" : engineStatus === "paused" ? "text-warning" : "text-muted-foreground"
            }`}>
              {engineStatus === "running" ? "Live" : engineStatus === "paused" ? "Paused" : "Idle"}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <AudioMonitor />
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Status pills */}
          <div className="hidden items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 shadow-panel md:flex">
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              <Monitor className="h-3 w-3" />
              <span className="font-medium text-foreground capitalize">{canvasState}</span>
            </span>
            <span className="h-3 w-px bg-border" />
            <span className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
              {engineMode === "cloud" ? (
                <Cloud className="h-3 w-3 text-blue-500" />
              ) : (
                <HardDrive className="h-3 w-3" />
              )}
              <span className="font-medium text-foreground capitalize">
                {engineMode === "cloud" ? "Nova-3" : appSettings.model_tier}
              </span>
            </span>
            {liveSync && (
              <>
                <span className="h-3 w-px bg-border" />
                <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Activity className="h-3 w-3" />
                  Live Sync
                </span>
              </>
            )}
            {ndiActive && (
              <>
                <span className="h-3 w-px bg-border" />
                <span className="flex items-center gap-1 text-[10px] font-medium text-primary">
                  <Radio className="h-3 w-3" />
                  NDI
                </span>
              </>
            )}
          </div>

          <button
            onClick={handleLaunchPresentation}
            className="flex items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Presentation className="h-3.5 w-3.5" />
            Launch
          </button>
          <button
            onClick={() => setDrawerTab(activeDrawer ? null : "canvas")}
            className={`flex items-center gap-1.5 rounded-full border border-border px-3.5 py-2 text-xs font-medium transition-colors hover:bg-secondary ${
              activeDrawer ? "bg-secondary text-secondary-foreground" : "text-muted-foreground"
            }`}
          >
            <Settings2 className="h-3.5 w-3.5" />
            <Menu className="h-3.5 w-3.5" />
            Tools
          </button>
        </div>
      </header>

      {/* Live Verse Pagination Controls */}
      <LiveVerseControls />

      {/* Main Stage — Two-Row Layout */}
      <main className="flex flex-1 flex-col gap-3 overflow-hidden p-3">
        {/* Top Row — 50% height: Transcript | Preview + Live | VerseQueue */}
        <div className="flex h-1/2 gap-3 overflow-hidden">
          {/* Left: Live Transcript */}
          <section className="flex w-64 min-w-[15rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <TranscriptConsole />
          </section>

          {/* Center: Program Preview + Live Display */}
          <section className="flex flex-1 gap-3 overflow-hidden">
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
              <PreviewCanvas />
            </div>
            <div className="flex flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
              <LiveOutputMonitor />
            </div>
          </section>

          {/* Right: Playlist Queue */}
          <section className="flex w-72 min-w-[17rem] flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <PlaylistQueue />
          </section>
        </div>

        {/* Bottom Row — remaining height: ScriptureSearch | AI Detections Pool | Theme */}
        <div className="flex flex-1 gap-3 overflow-hidden">
          {/* Left: Scripture Search */}
          <section className="flex flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <ScriptureSearch />
          </section>

          {/* Center: AI Detections Pool */}
          <section className="flex flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <AIDetectionsPool />
          </section>

          {/* Right: Theme Editor */}
          <section className="flex flex-1 overflow-hidden rounded-2xl border border-border bg-card shadow-panel">
            <ThemePanel />
          </section>
        </div>
      </main>

      {/* Right Sidebar Drawer */}
      <OperatorDrawer />

      {/* Help Overlay (? key) */}
      <HelpOverlay />
    </div>
  );
}
