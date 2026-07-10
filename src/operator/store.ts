import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import { EVENTS } from "@/shared/events";
import type {
  TranscriptChunk,
  VerseQueueItem,
  VerseLine,
  ThemeConfig,
  CanvasState,
  EngineStatus,
  EngineMode,
  EngineWarning,
  AudioDevice,
  PlaylistItem,
  AppSettings,
  SaaSState,
  SaaSAccountState,
} from "@/shared/types";

/** Panels available in the local-first private beta. */
export type DrawerTab = "import" | "canvas" | "settings" | null;

interface OperatorState {
  // Audio monitor
  audioDevices: AudioDevice[];
  selectedDeviceId: string | null;
  engineStatus: EngineStatus;
  engineMode: EngineMode;
  engineWarning: EngineWarning;
  vuLevel: number;

  // Session timer
  sessionElapsedMs: number;
  sessionRunning: boolean;

  // Transcript console
  transcriptChunks: TranscriptChunk[];
  highlightedScriptureIds: string[];

  // Verse queue
  verseQueue: VerseQueueItem[];
  verseHistory: VerseQueueItem[];

  // Recent detections (read-only log of all auto-detected scriptures)
  recentDetections: VerseQueueItem[];

  // Canvas state (mirrors presentation for UI feedback)
  canvasState: CanvasState;

  // Live verse pagination
  livePage: number;

  // Staging (Preview Canvas)
  stagedItem: VerseQueueItem | null;
  liveSync: boolean;

  // Internal timers used to protect the live output from rapid changes.
  _lastGoLiveTs: number;
  _pendingGoLive: VerseQueueItem | null;
  _cooldownTimer: ReturnType<typeof setTimeout> | null;
  _themeSaveTimer: ReturnType<typeof setTimeout> | null;

  // Live Output Monitor (mirror of what's on screen)
  liveItem: VerseQueueItem | null;

  // Playlist Queue
  playlist: PlaylistItem[];
  playlistIndex: number;

  // Theme
  theme: ThemeConfig;
  themePanelOpen: boolean;

  // Right sidebar drawer
  drawerTab: DrawerTab;

  // App settings (persisted to DB)
  appSettings: AppSettings;
  settingsLoaded: boolean;

  // Deepgram key status (stored in OS keychain, not in settings JSON)
  deepgramKeySet: boolean;

  saasState: SaaSState;
  saasLoaded: boolean;

  // Help overlay
  helpOverlayOpen: boolean;

  // Scripture search mode + rapid select
  searchMode: "reference" | "semantic";
  searchResultsCount: number;
  rapidSelectIndex: number | null;

  // Actions
  setAudioDevices: (devices: AudioDevice[]) => void;
  setSelectedDevice: (id: string | null) => void;
  setEngineStatus: (status: EngineStatus) => void;
  setEngineMode: (mode: EngineMode) => void;
  setEngineWarning: (warning: EngineWarning) => void;
  setVuLevel: (level: number) => void;
  startSession: () => void;
  pauseSession: () => void;
  stopSession: () => void;
  tickSession: () => void;
  addTranscriptChunk: (chunk: TranscriptChunk) => void;
  ingestTranscript: (chunk: TranscriptChunk) => void;
  addVerseToQueue: (item: VerseQueueItem) => void;
  updateVerseText: (id: string, verseText: string) => void;
  updateVerseData: (id: string, verseText: string, verses: VerseLine[]) => void;
  updateVerseStatus: (id: string, status: VerseQueueItem["status"]) => void;
  dismissVerse: (id: string) => void;
  setCanvasState: (state: CanvasState) => void;
  setLivePage: (page: number) => void;
  stageItem: (item: VerseQueueItem | null) => void;
  goLive: (item: VerseQueueItem) => void;
  clearLive: () => void;
  toggleLiveSync: () => void;
  addToPlaylist: (item: PlaylistItem) => void;
  removeFromPlaylist: (id: string) => void;
  reorderPlaylist: (from: number, to: number) => void;
  advancePlaylist: () => void;
  setTheme: (theme: Partial<ThemeConfig>) => void;
  toggleThemePanel: () => void;
  setDrawerTab: (tab: DrawerTab) => void;
  clearTranscript: () => void;
  loadSettings: () => Promise<void>;
  saveSettings: () => void;
  updateSettings: (partial: Partial<AppSettings>) => void;
  loadDeepgramKeyStatus: () => Promise<void>;
  storeDeepgramKey: (key: string) => Promise<void>;
  deleteDeepgramKey: () => Promise<void>;
  loadSaasState: () => Promise<void>;
  refreshSaasState: () => Promise<void>;
  saveSaasAccount: (partial: Partial<SaaSAccountState>) => Promise<void>;
  startCloudSessionMetering: () => Promise<SaaSState>;
  pauseCloudSessionMetering: () => Promise<SaaSState>;
  stopCloudSessionMetering: () => Promise<SaaSState>;
  toggleHelpOverlay: () => void;
  toggleSearchMode: () => void;
  setSearchResultsCount: (count: number) => void;
  setRapidSelectIndex: (idx: number | null) => void;
}

const DEFAULT_THEME: ThemeConfig = {
  fontFamily: "Georgia, serif",
  fontSize: 48,
  alignment: "center",
  layoutMode: "lower-thirds",
  animation: "fade",
  backgroundColor: "rgba(45, 42, 36, 0.92)",
  textColor: "#faf9f6",
  accentColor: "#6fa885",
  alphaBackground: false,
};

const DEFAULT_SAAS_STATE: SaaSState = {
  account: {
    signed_in: false,
    email: "",
    organization_name: "",
    organization_timezone: "UTC",
    plan: "free",
    subscription_status: "inactive",
    last_synced_at: null,
  },
  usage: {
    weekly_allowance_seconds: 40 * 60,
    used_seconds: 0,
    remaining_seconds: 40 * 60,
    unlimited: false,
    week_start: "",
    week_end: "",
    timezone: "UTC",
    active_session: false,
    cloud_allowed: false,
    blocking_reason: "Sign in to use managed cloud transcription.",
  },
};

export const useOperatorStore = create<OperatorState>((set) => ({
  audioDevices: [],
  selectedDeviceId: null,
  engineStatus: "stopped",
  engineMode: "local",
  engineWarning: null,
  vuLevel: 0,

  sessionElapsedMs: 0,
  sessionRunning: false,

  transcriptChunks: [],
  highlightedScriptureIds: [],

  verseQueue: [],
  verseHistory: [],
  recentDetections: [],

  canvasState: "normal",
  livePage: 0,

  stagedItem: null,
  liveSync: false,
  _lastGoLiveTs: 0,
  _pendingGoLive: null,
  _cooldownTimer: null,
  _themeSaveTimer: null,
  liveItem: null,

  playlist: [],
  playlistIndex: 0,

  theme: DEFAULT_THEME,
  themePanelOpen: false,
  drawerTab: null,

  appSettings: {
    theme: DEFAULT_THEME,
    selected_audio_device: null,
    model_tier: "base",
    inference_delay_ms: 750,
    semantic_threshold: 0.7,
    hot_words: [],
    active_translation: "KJV",
  },
  settingsLoaded: false,
  deepgramKeySet: false,
  saasState: DEFAULT_SAAS_STATE,
  saasLoaded: false,
  helpOverlayOpen: false,

  searchMode: "reference",
  searchResultsCount: 0,
  rapidSelectIndex: null,

  setAudioDevices: (devices) => set({ audioDevices: devices }),
  setSelectedDevice: (id) => {
    set({ selectedDeviceId: id });
    useOperatorStore.getState().saveSettings();
  },
  setEngineStatus: (status) => set({ engineStatus: status }),
  setEngineMode: (mode) => set({ engineMode: mode, engineWarning: null }),
  setEngineWarning: (warning) => set({ engineWarning: warning }),
  setVuLevel: (level) => set({ vuLevel: level }),

  startSession: () =>
    set((state) => ({
      engineStatus: "running",
      sessionRunning: true,
      sessionElapsedMs: state.engineStatus === "paused" ? state.sessionElapsedMs : 0,
    })),
  pauseSession: () => set({ engineStatus: "paused", sessionRunning: false }),
  stopSession: () =>
    set({
      engineStatus: "stopped",
      sessionRunning: false,
      sessionElapsedMs: 0,
      stagedItem: null,
      liveItem: null,
      livePage: 0,
    }),
  tickSession: () =>
    set((state) => ({
      sessionElapsedMs: state.sessionElapsedMs + 1000,
    })),

  addTranscriptChunk: (chunk) =>
    set((state) => ({
      transcriptChunks: [...state.transcriptChunks.slice(-99), chunk],
    })),

  // Adds a transcript chunk and spawns pending verse-queue items for any
  // detected scriptures. Shared by the sidecar WebSocket path and the Tauri
  // event path so queue-building stays consistent.
  ingestTranscript: (chunk) => {
    const newItems: VerseQueueItem[] = chunk.detected_scriptures.map((s) => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      scripture: s,
      verse_text: "",
      verses: [] as VerseLine[],
      confidence: s.score ?? chunk.confidence_score,
      match_type: s.match_type,
      status: "pending" as const,
      timestamp: Date.now(),
    }));

    // Auto-stage the most recent REGEX (exact) match to Program Preview.
    const exactMatch = newItems.find((i) => i.match_type === "REGEX");
    const stageTarget = exactMatch ?? null;

    set((state) => ({
      transcriptChunks: [...state.transcriptChunks.slice(-99), chunk],
      verseQueue: [...newItems, ...state.verseQueue],
      recentDetections: [...newItems, ...state.recentDetections].slice(0, 50),
      stagedItem: stageTarget ?? state.stagedItem,
    }));

    // Async verse-text lookup for each detected scripture
    for (const item of newItems) {
      const s = item.scripture;
      invoke<{ verse_number: number; verse_text: string }[]>("db_query_verses", {
        translationCode: useOperatorStore.getState().appSettings.active_translation,
        bookIndex: s.book_id,
        chapter: s.chapter,
        verseStart: s.verse_start,
        verseEnd: s.verse_end,
      })
        .then((rows) => {
          const text = rows.map((v) => v.verse_text).join(" ");
          const verses: VerseLine[] = rows.map((v) => ({
            verse_number: v.verse_number,
            text: v.verse_text,
          }));
          useOperatorStore.getState().updateVerseData(item.id, text, verses);
          // If this item is the one currently staged, refresh stagedItem with verse text
          const st = useOperatorStore.getState();
          if (st.stagedItem?.id === item.id) {
            st.stageItem({ ...item, verse_text: text, verses });
          }
        })
        .catch((err) => {
          console.error("[pneuma] Verse lookup failed:", err);
        });
    }
  },

  addVerseToQueue: (item) => set((state) => ({ verseQueue: [item, ...state.verseQueue] })),

  updateVerseText: (id, verseText) =>
    set((state) => ({
      verseQueue: state.verseQueue.map((v) => (v.id === id ? { ...v, verse_text: verseText } : v)),
    })),

  updateVerseData: (id, verseText, verses) =>
    set((state) => ({
      verseQueue: state.verseQueue.map((v) =>
        v.id === id ? { ...v, verse_text: verseText, verses } : v,
      ),
    })),

  updateVerseStatus: (id, status) =>
    set((state) => {
      const queue = state.verseQueue.map((v) => (v.id === id ? { ...v, status } : v));
      const item = queue.find((v) => v.id === id);
      let history = state.verseHistory;
      if (item && (status === "live" || status === "dismissed")) {
        history = [item, ...state.verseHistory.slice(0, 49)];
      }
      return {
        verseQueue: queue.filter((v) => v.status !== "dismissed"),
        verseHistory: history,
        livePage: status === "live" ? 0 : state.livePage,
      };
    }),

  dismissVerse: (id) =>
    set((state) => ({
      verseQueue: state.verseQueue.filter((v) => v.id !== id),
    })),

  setCanvasState: (canvasState) => set({ canvasState }),
  setLivePage: (page) => set({ livePage: page }),

  stageItem: (item) => set({ stagedItem: item }),

  goLive: (item) => {
    const now = Date.now();
    const state = useOperatorStore.getState();
    const MIN_DISPLAY_MS = 2500;

    // If something is already live and hasn't been shown for the minimum duration,
    // queue the new item and emit it after the cooldown.
    if (state.liveItem && now - state._lastGoLiveTs < MIN_DISPLAY_MS) {
      // Store pending item; a timer will emit it after cooldown
      set({ _pendingGoLive: item });
      if (!state._cooldownTimer) {
        const remaining = MIN_DISPLAY_MS - (now - state._lastGoLiveTs);
        const cooldownTimer = setTimeout(() => {
          const s = useOperatorStore.getState();
          const pending = s._pendingGoLive;
          if (pending) {
            set({
              liveItem: pending,
              livePage: 0,
              _lastGoLiveTs: Date.now(),
              _pendingGoLive: null,
              _cooldownTimer: null,
            });
            import("@tauri-apps/api/event").then(({ emit }) => {
              emit(EVENTS.VERSE_GO_LIVE, pending);
            });
            if (useOperatorStore.getState().liveSync) {
              set({ stagedItem: null });
            }
          }
        }, remaining);
        set({ _cooldownTimer: cooldownTimer });
      }
      return;
    }

    // No cooldown needed — emit immediately
    set({
      liveItem: item,
      livePage: 0,
      _lastGoLiveTs: now,
      _pendingGoLive: null,
      _cooldownTimer: null,
    });
    import("@tauri-apps/api/event").then(({ emit }) => {
      emit(EVENTS.VERSE_GO_LIVE, item);
    });
    if (useOperatorStore.getState().liveSync) {
      set({ stagedItem: null });
    }
  },

  clearLive: () => set({ liveItem: null, livePage: 0 }),

  toggleLiveSync: () => set((state) => ({ liveSync: !state.liveSync })),

  addToPlaylist: (item) => set((state) => ({ playlist: [...state.playlist, item] })),

  removeFromPlaylist: (id) =>
    set((state) => ({
      playlist: state.playlist.filter((p) => p.id !== id),
    })),

  reorderPlaylist: (from, to) =>
    set((state) => {
      const list = [...state.playlist];
      const [moved] = list.splice(from, 1);
      list.splice(to, 0, moved);
      return { playlist: list };
    }),

  advancePlaylist: () =>
    set((state) => {
      const next = state.playlistIndex + 1;
      if (next >= state.playlist.length) return {};
      const item = state.playlist[next];
      // If it's a verse item, stage it
      if (item.type === "verse" && item.scripture) {
        const verseItem: VerseQueueItem = {
          id: item.id,
          scripture: item.scripture,
          verse_text: item.verse_text ?? "",
          verses: item.verses ?? [],
          confidence: 1,
          match_type: "REGEX",
          status: "queued",
          timestamp: Date.now(),
        };
        return {
          playlistIndex: next,
          stagedItem: verseItem,
        };
      }
      return { playlistIndex: next };
    }),

  setTheme: (partial) =>
    set((state) => {
      const newTheme = { ...state.theme, ...partial };
      // Debounce-save settings
      if (state._themeSaveTimer) clearTimeout(state._themeSaveTimer);
      const themeSaveTimer = setTimeout(() => {
        useOperatorStore.getState().saveSettings();
      }, 500);
      return { theme: newTheme, _themeSaveTimer: themeSaveTimer };
    }),
  toggleThemePanel: () => set((state) => ({ themePanelOpen: !state.themePanelOpen })),
  setDrawerTab: (tab) => set({ drawerTab: tab }),
  clearTranscript: () => set({ transcriptChunks: [] }),

  loadSettings: async () => {
    try {
      const raw = await invoke<string | null>("db_load_settings");
      if (!raw) {
        set({ settingsLoaded: true });
        return;
      }
      const parsed = JSON.parse(raw) as Partial<AppSettings>;
      set((state) => ({
        appSettings: { ...state.appSettings, ...parsed },
        settingsLoaded: true,
        theme: parsed.theme ?? state.theme,
        selectedDeviceId: parsed.selected_audio_device ?? state.selectedDeviceId,
      }));
    } catch (err) {
      if (String(err).includes("Database not ready")) {
        setTimeout(() => useOperatorStore.getState().loadSettings(), 500);
        return;
      }
      console.error("[pneuma] Failed to load settings:", err);
      set({ settingsLoaded: true });
    }
  },

  saveSettings: () => {
    const state = useOperatorStore.getState();
    const settings: AppSettings = {
      ...state.appSettings,
      theme: state.theme,
      selected_audio_device: state.selectedDeviceId,
    };
    invoke("db_save_settings", { settings: JSON.stringify(settings) }).catch((err) =>
      console.error("[pneuma] Failed to save settings:", err),
    );
  },

  updateSettings: (partial) => {
    set((state) => ({
      appSettings: { ...state.appSettings, ...partial },
    }));
    useOperatorStore.getState().saveSettings();
  },

  loadDeepgramKeyStatus: async () => {
    try {
      const val = await invoke<string | null>("credential_load", { key: "deepgram_api_key" });
      set({ deepgramKeySet: !!val });
    } catch (err) {
      console.error("[pneuma] Failed to load Deepgram key status:", err);
      set({ deepgramKeySet: false });
    }
  },

  storeDeepgramKey: async (key) => {
    try {
      if (key.trim()) {
        await invoke("credential_store", { key: "deepgram_api_key", value: key });
        set({ deepgramKeySet: true });
      } else {
        await invoke("credential_delete", { key: "deepgram_api_key" });
        set({ deepgramKeySet: false });
      }
    } catch (err) {
      console.error("[pneuma] Failed to store Deepgram key:", err);
      throw err;
    }
  },

  deleteDeepgramKey: async () => {
    try {
      await invoke("credential_delete", { key: "deepgram_api_key" });
      set({ deepgramKeySet: false });
    } catch (err) {
      console.error("[pneuma] Failed to delete Deepgram key:", err);
      throw err;
    }
  },

  loadSaasState: async () => {
    try {
      const saasState = await invoke<SaaSState>("saas_get_state");
      set({ saasState, saasLoaded: true });
    } catch (err) {
      if (String(err).includes("Database not ready")) {
        setTimeout(() => useOperatorStore.getState().loadSaasState(), 500);
        return;
      }
      console.error("[pneuma] Failed to load SaaS state:", err);
      set({ saasLoaded: true });
    }
  },

  refreshSaasState: async () => {
    try {
      const saasState = await invoke<SaaSState>("saas_get_state");
      set({ saasState, saasLoaded: true });
    } catch (err) {
      console.error("[pneuma] Failed to refresh SaaS state:", err);
    }
  },

  saveSaasAccount: async (partial) => {
    const state = useOperatorStore.getState();
    const account: SaaSAccountState = {
      ...state.saasState.account,
      ...partial,
    };
    try {
      const saasState = await invoke<SaaSState>("saas_save_account", { account });
      set({ saasState, saasLoaded: true });
    } catch (err) {
      console.error("[pneuma] Failed to save SaaS account:", err);
      throw err;
    }
  },

  startCloudSessionMetering: async () => {
    try {
      const saasState = await invoke<SaaSState>("saas_start_cloud_session");
      set({ saasState, saasLoaded: true });
      return saasState;
    } catch (err) {
      console.error("[pneuma] Failed to start cloud metering:", err);
      throw err;
    }
  },

  pauseCloudSessionMetering: async () => {
    try {
      const saasState = await invoke<SaaSState>("saas_pause_cloud_session");
      set({ saasState, saasLoaded: true });
      return saasState;
    } catch (err) {
      console.error("[pneuma] Failed to pause cloud metering:", err);
      throw err;
    }
  },

  stopCloudSessionMetering: async () => {
    try {
      const saasState = await invoke<SaaSState>("saas_stop_cloud_session");
      set({ saasState, saasLoaded: true });
      return saasState;
    } catch (err) {
      console.error("[pneuma] Failed to stop cloud metering:", err);
      throw err;
    }
  },

  toggleHelpOverlay: () => set((state) => ({ helpOverlayOpen: !state.helpOverlayOpen })),
  toggleSearchMode: () =>
    set((state) => ({
      searchMode: state.searchMode === "reference" ? "semantic" : "reference",
    })),
  setSearchResultsCount: (count) => set({ searchResultsCount: count }),
  setRapidSelectIndex: (idx) => set({ rapidSelectIndex: idx }),
}));
