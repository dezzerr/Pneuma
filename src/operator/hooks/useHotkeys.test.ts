import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkeys } from "@/operator/hooks/useHotkeys";
import { useOperatorStore } from "@/operator/store";
import type { VerseQueueItem } from "@/shared/types";

// Mock @tauri-apps/api/core and event
const mockInvoke = vi.fn();
vi.mock("@tauri-apps/api/core", () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));
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

function makeQueueItem(id: string, status: VerseQueueItem["status"] = "pending"): VerseQueueItem {
  return {
    id,
    scripture: makeScripture(),
    verse_text: "For God so loved...",
    verses: [],
    confidence: 1,
    match_type: "REGEX",
    status,
    timestamp: Date.now(),
  };
}

function dispatchKey(key: string, target: HTMLElement = document.body) {
  const event = new KeyboardEvent("keydown", {
    key,
    bubbles: true,
    cancelable: true,
  });
  Object.defineProperty(event, "target", { value: target, writable: false });
  window.dispatchEvent(event);
  return event;
}

describe("useHotkeys", () => {
  beforeEach(() => {
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
      helpOverlayOpen: false,
    });
    mockInvoke.mockReset();
    mockEmit.mockReset();
    mockInvoke.mockResolvedValue([]);
  });

  it("toggles live sync on L key", () => {
    renderHook(() => useHotkeys());
    expect(useOperatorStore.getState().liveSync).toBe(false);
    dispatchKey("l");
    expect(useOperatorStore.getState().liveSync).toBe(true);
    dispatchKey("l");
    expect(useOperatorStore.getState().liveSync).toBe(false);
  });

  it("toggles help overlay on ? key", () => {
    renderHook(() => useHotkeys());
    expect(useOperatorStore.getState().helpOverlayOpen).toBe(false);
    dispatchKey("?");
    expect(useOperatorStore.getState().helpOverlayOpen).toBe(true);
  });

  it("stages first pending detection on Enter", () => {
    const item = makeQueueItem("item-1");
    useOperatorStore.setState({ verseQueue: [item] });

    renderHook(() => useHotkeys());
    dispatchKey("Enter");

    expect(useOperatorStore.getState().stagedItem).toEqual(item);
  });

  it("pushes staged item live on Enter when something is staged", async () => {
    const item = makeQueueItem("item-1");
    useOperatorStore.setState({ verseQueue: [item], stagedItem: item });

    renderHook(() => useHotkeys());
    dispatchKey("Enter");

    await vi.waitFor(() => expect(mockEmit).toHaveBeenCalled());
    expect(useOperatorStore.getState().liveItem).toEqual(item);
  });

  it("rapid select stages Nth item on digit key", () => {
    const items = [makeQueueItem("item-1"), makeQueueItem("item-2"), makeQueueItem("item-3")];
    useOperatorStore.setState({ verseQueue: items });

    renderHook(() => useHotkeys());
    dispatchKey("2");

    expect(useOperatorStore.getState().stagedItem).toEqual(items[1]);
  });

  it("rapid select 0 maps to index 9", () => {
    const items = Array.from({ length: 10 }, (_, i) => makeQueueItem(`item-${i}`));
    useOperatorStore.setState({ verseQueue: items });

    renderHook(() => useHotkeys());
    dispatchKey("0");

    expect(useOperatorStore.getState().stagedItem).toEqual(items[9]);
  });

  it("does not intercept hotkeys when typing in input", () => {
    const input = document.createElement("input");
    document.body.appendChild(input);

    renderHook(() => useHotkeys());
    dispatchKey("l", input);

    expect(useOperatorStore.getState().liveSync).toBe(false);
    document.body.removeChild(input);
  });

  it("does not intercept hotkeys when typing in textarea", () => {
    const textarea = document.createElement("textarea");
    document.body.appendChild(textarea);

    renderHook(() => useHotkeys());
    dispatchKey("l", textarea);

    expect(useOperatorStore.getState().liveSync).toBe(false);
    document.body.removeChild(textarea);
  });

  it("toggles search mode on Tab", () => {
    renderHook(() => useHotkeys());
    expect(useOperatorStore.getState().searchMode).toBe("reference");
    dispatchKey("Tab");
    expect(useOperatorStore.getState().searchMode).toBe("semantic");
  });
});
