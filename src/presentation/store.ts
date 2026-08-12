import { create } from "zustand";
import type { ThemeConfig, CanvasState, VerseQueueItem } from "@/shared/types";

interface PresentationState {
  currentVerse: VerseQueueItem | null;
  currentPage: number;
  canvasState: CanvasState;
  theme: ThemeConfig;
  frozenVerse: VerseQueueItem | null;

  setVerse: (verse: VerseQueueItem | null) => void;
  setPage: (page: number) => void;
  setCanvasState: (state: CanvasState) => void;
  setTheme: (theme: ThemeConfig) => void;
  freeze: () => void;
  resume: () => void;
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

export const usePresentationStore = create<PresentationState>((set) => ({
  currentVerse: null,
  currentPage: 0,
  canvasState: "clear",
  theme: DEFAULT_THEME,
  frozenVerse: null,

  setVerse: (verse) => set({ currentVerse: verse, currentPage: 0 }),
  setPage: (page) => set({ currentPage: page }),
  setCanvasState: (canvasState) => set({ canvasState }),
  setTheme: (theme) => set({ theme }),
  freeze: () => set((state) => ({ frozenVerse: state.currentVerse, canvasState: "freeze" })),
  resume: () => set({ frozenVerse: null, canvasState: "normal" }),
}));
