import { describe, it, expect, beforeEach, vi } from "vitest";
import { useOperatorStore } from "@/operator/store";
import type { TranscriptChunk, VerseQueueItem, PlaylistItem } from "@/shared/types";

// Mock @tauri-apps/api/core (invoke)
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

// Mock @tauri-apps/api/event (emit) — used via dynamic import in goLive
const mockEmit = vi.fn();
vi.mock("@tauri-apps/api/event", () => ({
  emit: (...args: unknown[]) => mockEmit(...args),
}));

function makeScripture(overrides: Partial<VerseQueueItem["scripture"]> = {}) {
  return {
    match_type: "REGEX" as const,
    book_id: 43,
    book_name: "John",
    chapter: 3,
    verse_start: 16,
    verse_end: 16,
    score: 1.0,
    ...overrides,
  };
}

function makeChunk(overrides: Partial<TranscriptChunk> = {}): TranscriptChunk {
  return {
    raw_text: "John 3:16",
    is_final: true,
    confidence_score: 0.95,
    detected_scriptures: [],
    ...overrides,
  };
}

describe("operator store", () => {
  beforeEach(() => {
    // Reset store to initial state
    useOperatorStore.setState({
      transcriptChunks: [],
      verseQueue: [],
      verseHistory: [],
      recentDetections: [],
      stagedItem: null,
      liveItem: null,
      liveSync: false,
      livePage: 0,
      playlist: [],
      playlistIndex: 0,
      searchMode: "reference",
      searchResultsCount: 0,
      rapidSelectIndex: null,
      canvasState: "normal",
      engineStatus: "stopped",
      sessionRunning: false,
      sessionElapsedMs: 0,
    });
    mockInvoke.mockReset();
    mockEmit.mockReset();
    // Default mock: verse lookup returns empty
    mockInvoke.mockResolvedValue([]);
  });

  describe("ingestTranscript", () => {
    it("adds transcript chunk to the list", () => {
      const chunk = makeChunk();
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.transcriptChunks).toHaveLength(1);
      expect(state.transcriptChunks[0].raw_text).toBe("John 3:16");
    });

    it("replaces an evolving interim chunk instead of duplicating it", () => {
      useOperatorStore
        .getState()
        .ingestTranscript(makeChunk({ raw_text: "John three", is_final: false }));
      useOperatorStore
        .getState()
        .ingestTranscript(makeChunk({ raw_text: "John three sixteen", is_final: false }));
      useOperatorStore
        .getState()
        .ingestTranscript(makeChunk({ raw_text: "John 3:16", is_final: true }));

      const chunks = useOperatorStore.getState().transcriptChunks;
      expect(chunks).toHaveLength(1);
      expect(chunks[0]).toMatchObject({ raw_text: "John 3:16", is_final: true });
    });

    it("merges a delayed semantic detection into its final transcript", () => {
      useOperatorStore
        .getState()
        .ingestTranscript(
          makeChunk({ raw_text: "the lord is my shepherd", detected_scriptures: [] }),
        );
      useOperatorStore.getState().ingestTranscript(
        makeChunk({
          raw_text: "the lord is my shepherd",
          detected_scriptures: [makeScripture({ match_type: "SEMANTIC" })],
        }),
      );

      const chunks = useOperatorStore.getState().transcriptChunks;
      expect(chunks).toHaveLength(1);
      expect(chunks[0].detected_scriptures).toHaveLength(1);
    });

    it("creates verse queue items for detected scriptures", () => {
      const chunk = makeChunk({
        detected_scriptures: [makeScripture()],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.verseQueue).toHaveLength(1);
      expect(state.verseQueue[0].scripture.book_name).toBe("John");
      expect(state.verseQueue[0].status).toBe("pending");
    });

    it("uses scripture score for confidence when available", () => {
      const chunk = makeChunk({
        confidence_score: 0.5,
        detected_scriptures: [makeScripture({ score: 0.88, match_type: "SEMANTIC" })],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.verseQueue[0].confidence).toBe(0.88);
    });

    it("falls back to chunk confidence when score is absent", () => {
      const chunk = makeChunk({
        confidence_score: 0.72,
        detected_scriptures: [makeScripture({ score: undefined })],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.verseQueue[0].confidence).toBe(0.72);
    });

    it("auto-stages REGEX matches", () => {
      const chunk = makeChunk({
        detected_scriptures: [makeScripture({ match_type: "REGEX" })],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.stagedItem).not.toBeNull();
      expect(state.stagedItem?.scripture.book_name).toBe("John");
    });

    it("does not auto-stage SEMANTIC-only matches", () => {
      const chunk = makeChunk({
        detected_scriptures: [makeScripture({ match_type: "SEMANTIC", score: 0.85 })],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.stagedItem).toBeNull();
    });

    it("adds items to recentDetections", () => {
      const chunk = makeChunk({
        detected_scriptures: [makeScripture()],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      const state = useOperatorStore.getState();
      expect(state.recentDetections).toHaveLength(1);
    });

    it("fires verse-text lookup via invoke", () => {
      const chunk = makeChunk({
        detected_scriptures: [makeScripture()],
      });
      useOperatorStore.getState().ingestTranscript(chunk);
      expect(mockInvoke).toHaveBeenCalledWith(
        "db_query_verses",
        expect.objectContaining({
          bookIndex: 43,
          chapter: 3,
          verseStart: 16,
          verseEnd: 16,
        }),
      );
    });
  });

  describe("stageItem", () => {
    it("sets stagedItem", () => {
      const item: VerseQueueItem = {
        id: "test-1",
        scripture: makeScripture(),
        verse_text: "For God so loved...",
        verses: [],
        confidence: 1,
        match_type: "REGEX",
        status: "pending",
        timestamp: Date.now(),
      };
      useOperatorStore.getState().stageItem(item);
      expect(useOperatorStore.getState().stagedItem).toEqual(item);
    });

    it("clears stagedItem when null is passed", () => {
      useOperatorStore.setState({ stagedItem: {} as VerseQueueItem });
      useOperatorStore.getState().stageItem(null);
      expect(useOperatorStore.getState().stagedItem).toBeNull();
    });
  });

  describe("goLive", () => {
    it("emits VERSE_GO_LIVE event and sets liveItem", async () => {
      const item: VerseQueueItem = {
        id: "live-1",
        scripture: makeScripture(),
        verse_text: "For God so loved...",
        verses: [],
        confidence: 1,
        match_type: "REGEX",
        status: "pending",
        timestamp: Date.now(),
      };
      useOperatorStore.getState().goLive(item);
      // goLive uses dynamic import("@tauri-apps/api/event") — await microtasks
      await vi.waitFor(() => expect(mockEmit).toHaveBeenCalled());
      const state = useOperatorStore.getState();
      expect(state.liveItem).toEqual(item);
      expect(state.livePage).toBe(0);
    });

    it("clears stagedItem when liveSync is enabled", () => {
      useOperatorStore.setState({ liveSync: true });
      const item: VerseQueueItem = {
        id: "live-2",
        scripture: makeScripture(),
        verse_text: "Test",
        verses: [],
        confidence: 1,
        match_type: "REGEX",
        status: "pending",
        timestamp: Date.now(),
      };
      useOperatorStore.getState().stageItem(item);
      expect(useOperatorStore.getState().stagedItem).not.toBeNull();
      useOperatorStore.getState().goLive(item);
      expect(useOperatorStore.getState().stagedItem).toBeNull();
    });
  });

  describe("toggleLiveSync", () => {
    it("flips liveSync state", () => {
      expect(useOperatorStore.getState().liveSync).toBe(false);
      useOperatorStore.getState().toggleLiveSync();
      expect(useOperatorStore.getState().liveSync).toBe(true);
      useOperatorStore.getState().toggleLiveSync();
      expect(useOperatorStore.getState().liveSync).toBe(false);
    });
  });

  describe("updateVerseStatus", () => {
    it("marks item as dismissed and removes from queue", () => {
      const item: VerseQueueItem = {
        id: "dismiss-1",
        scripture: makeScripture(),
        verse_text: "Test",
        verses: [],
        confidence: 1,
        match_type: "REGEX",
        status: "pending",
        timestamp: Date.now(),
      };
      useOperatorStore.setState({ verseQueue: [item] });
      useOperatorStore.getState().updateVerseStatus("dismiss-1", "dismissed");
      const state = useOperatorStore.getState();
      expect(state.verseQueue.find((v) => v.id === "dismiss-1")).toBeUndefined();
      expect(state.verseHistory.find((v) => v.id === "dismiss-1")).toBeDefined();
    });

    it("marks item as live and resets livePage", () => {
      const item: VerseQueueItem = {
        id: "live-3",
        scripture: makeScripture(),
        verse_text: "Test",
        verses: [],
        confidence: 1,
        match_type: "REGEX",
        status: "pending",
        timestamp: Date.now(),
      };
      useOperatorStore.setState({ verseQueue: [item], livePage: 5 });
      useOperatorStore.getState().updateVerseStatus("live-3", "live");
      const state = useOperatorStore.getState();
      expect(state.verseQueue.find((v) => v.id === "live-3")?.status).toBe("live");
      expect(state.livePage).toBe(0);
    });
  });

  describe("addToPlaylist", () => {
    it("adds item to playlist", () => {
      const item: PlaylistItem = {
        id: "pl-1",
        type: "verse",
        label: "John 3:16",
      };
      useOperatorStore.getState().addToPlaylist(item as PlaylistItem);
      expect(useOperatorStore.getState().playlist).toHaveLength(1);
      expect(useOperatorStore.getState().playlist[0].label).toBe("John 3:16");
    });
  });

  describe("toggleSearchMode", () => {
    it("flips between reference and semantic", () => {
      expect(useOperatorStore.getState().searchMode).toBe("reference");
      useOperatorStore.getState().toggleSearchMode();
      expect(useOperatorStore.getState().searchMode).toBe("semantic");
      useOperatorStore.getState().toggleSearchMode();
      expect(useOperatorStore.getState().searchMode).toBe("reference");
    });
  });
});
