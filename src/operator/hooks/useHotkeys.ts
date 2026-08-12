import { useEffect, useRef, useCallback } from "react";
import { useOperatorStore } from "../store";

const DOUBLE_PRESS_MS = 300;

/**
 * Global hotkey handler for the operator dashboard.
 *
 * Keys:
 *   L          — Toggle Live Sync (auto-push staged → live)
 *   Tab        — Focus Scripture Search input
 *   Enter      — Stage current selection (or push staged → live)
 *   Double-Enter — Instant Live (push first detection straight to live)
 *   0-9        — Rapid Select: stage the Nth item from AI Detections Pool
 */
export function useHotkeys() {
  const lastEnterRef = useRef(0);

  const {
    verseQueue,
    stagedItem,
    toggleLiveSync,
    stageItem,
    goLive,
    toggleHelpOverlay,
    toggleSearchMode,
    searchResultsCount,
    setRapidSelectIndex,
  } = useOperatorStore();

  const handleKey = useCallback(
    (e: KeyboardEvent) => {
      // Don't intercept when typing in inputs/selects/textareas
      const target = e.target as HTMLElement;
      const isTyping =
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable;

      // Tab: toggle between reference and semantic search modes
      if (e.key === "Tab") {
        e.preventDefault();
        toggleSearchMode();
        const input = document.querySelector<HTMLInputElement>("input[data-search-book]");
        if (input) {
          input.focus();
          input.select();
        }
        return;
      }

      // Skip other hotkeys when typing in form fields
      if (isTyping) return;

      if (e.key === "?" || (e.key === "/" && e.shiftKey)) {
        e.preventDefault();
        toggleHelpOverlay();
        return;
      }

      if (e.key === "l" || e.key === "L") {
        e.preventDefault();
        toggleLiveSync();
        return;
      }

      if (e.key === "Enter") {
        e.preventDefault();
        const now = Date.now();
        const isDouble = now - lastEnterRef.current < DOUBLE_PRESS_MS;
        lastEnterRef.current = now;

        if (isDouble) {
          // Double-Enter: Instant Live — push first detection straight to live
          const first = verseQueue.find((v) => v.status === "pending");
          if (first) {
            goLive(first);
            useOperatorStore.getState().updateVerseStatus(first.id, "live");
          } else if (stagedItem) {
            // If nothing in queue but something is staged, push it live
            goLive(stagedItem);
          }
          return;
        }

        // Single Enter: Stage current selection or push staged → live
        if (stagedItem) {
          // Something already staged — push it live
          goLive(stagedItem);
        } else {
          // Stage the first pending detection
          const first = verseQueue.find((v) => v.status === "pending");
          if (first) {
            stageItem(first);
          }
        }
        return;
      }

      // 0-9: Rapid Select
      // If chapter results are loaded in search panel, select the Nth verse.
      // Otherwise, stage the Nth item from AI Detections Pool.
      if (e.key >= "0" && e.key <= "9") {
        e.preventDefault();
        const idx = e.key === "0" ? 9 : parseInt(e.key) - 1;
        if (searchResultsCount > 0) {
          // Select verse from search results (1-9 → verses 1-9, 0 → verse 10)
          setRapidSelectIndex(idx);
        } else {
          const item = verseQueue[idx];
          if (item) {
            stageItem(item);
          }
        }
        return;
      }
    },
    [
      verseQueue,
      stagedItem,
      toggleLiveSync,
      stageItem,
      goLive,
      toggleHelpOverlay,
      toggleSearchMode,
      searchResultsCount,
      setRapidSelectIndex,
    ],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [handleKey]);
}
