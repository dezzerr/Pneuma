import { useTauriEvent } from "@/shared/hooks/useTauriEvent";
import { EVENTS } from "@/shared/events";
import { usePresentationStore } from "./store";
import { VerseDisplay } from "./components/VerseDisplay";
import { CanvasOverlay } from "./components/CanvasOverlay";
import type { VerseQueueItem, ThemeConfig } from "@/shared/types";

export default function PresentationApp() {
  const { setVerse, setPage, setCanvasState, setTheme, freeze, resume } = usePresentationStore();

  useTauriEvent<VerseQueueItem>(EVENTS.VERSE_GO_LIVE, (verse) => {
    setVerse(verse);
    setCanvasState("normal");
  });

  useTauriEvent<number>(EVENTS.VERSE_PAGE_SET, (page) => {
    setPage(page);
  });

  useTauriEvent<string>(EVENTS.CANVAS_BLACKOUT, () => setCanvasState("blackout"));
  useTauriEvent<string>(EVENTS.CANVAS_CLEAR, () => {
    setVerse(null);
    setCanvasState("clear");
  });
  useTauriEvent<string>(EVENTS.CANVAS_FREEZE, () => freeze());
  useTauriEvent<string>(EVENTS.CANVAS_RESUME, () => resume());
  useTauriEvent<ThemeConfig>(EVENTS.THEME_UPDATED, (theme) => setTheme(theme));

  return (
    <div className="relative h-screen w-screen overflow-hidden bg-transparent">
      <CanvasOverlay />
      <VerseDisplay />
    </div>
  );
}
