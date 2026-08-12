import { useEffect, useCallback } from "react";
import { emit } from "@tauri-apps/api/event";
import { useOperatorStore } from "../store";
import { EVENTS } from "@/shared/events";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function LiveVerseControls() {
  const { verseQueue, livePage, setLivePage } = useOperatorStore();

  const liveVerse = verseQueue.find((v) => v.status === "live");
  const verses = liveVerse?.verses ?? [];
  const hasMultiple = verses.length > 1;

  const changePage = useCallback(
    (newPage: number) => {
      if (!liveVerse || !hasMultiple) return;
      const clamped = Math.max(0, Math.min(newPage, verses.length - 1));
      setLivePage(clamped);
      emit(EVENTS.VERSE_PAGE_SET, clamped);
    },
    [liveVerse, hasMultiple, verses.length, setLivePage],
  );

  // Keyboard shortcuts: Left/Right arrows to navigate pages
  useEffect(() => {
    if (!hasMultiple) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        changePage(livePage - 1);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        changePage(livePage + 1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [hasMultiple, livePage, changePage]);

  if (!liveVerse || !hasMultiple) return null;

  const formatRef = () => {
    const { book_name, chapter, verse_start, verse_end } = liveVerse.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  return (
    <div className="flex items-center justify-between border-b border-border bg-card px-4 py-2.5">
      <div className="flex items-center gap-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <span className="text-xs font-semibold text-primary">{livePage + 1}</span>
        </div>
        <div className="flex flex-col">
          <span className="text-xs font-semibold text-foreground">{formatRef()}</span>
          <span className="text-[10px] text-muted-foreground">
            Verse {livePage + 1} of {verses.length}
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => changePage(livePage - 1)}
          disabled={livePage === 0}
          className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          onClick={() => changePage(livePage + 1)}
          disabled={livePage >= verses.length - 1}
          className="rounded-full border border-border p-1.5 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
