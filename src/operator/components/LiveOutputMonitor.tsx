import { useOperatorStore } from "../store";
import { MonitorPlay } from "lucide-react";
import type { VerseQueueItem } from "@/shared/types";

export function LiveOutputMonitor() {
  const { liveItem, theme, canvasState, livePage } = useOperatorStore();

  const formatRef = (item: VerseQueueItem) => {
    const { book_name, chapter, verse_start, verse_end } = item.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  const verses = liveItem?.verses ?? [];
  const hasMultiple = verses.length > 1;
  const activeVerse = hasMultiple ? verses[Math.min(livePage, verses.length - 1)] : null;

  const lowerThirds = theme.layoutMode === "lower-thirds";
  const contentBg = theme.alphaBackground ? "transparent" : theme.backgroundColor;
  const contentClass = lowerThirds
    ? "absolute inset-x-4 bottom-4 flex flex-col rounded-xl p-3"
    : "absolute inset-0 flex flex-col justify-center p-4";

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <MonitorPlay className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Live Display</h2>
          {canvasState === "blackout" && (
            <span className="rounded-full bg-destructive/10 px-2 py-0.5 text-[10px] font-medium text-destructive">
              Blackout
            </span>
          )}
          {canvasState === "freeze" && (
            <span className="rounded-full bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-500">
              Frozen
            </span>
          )}
        </div>
      </div>

      <div className="relative flex-1 overflow-hidden bg-black">
        {canvasState === "blackout" ? (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <MonitorPlay className="h-5 w-5 text-white/40" />
            </div>
            <p className="mt-2 text-xs text-white/50">Blackout</p>
          </div>
        ) : liveItem ? (
          <div
            className={contentClass}
            style={{ textAlign: theme.alignment, background: contentBg }}
          >
            <p
              className="mb-2 font-semibold tracking-wide"
              style={{
                color: theme.accentColor,
                fontSize: `${Math.min(theme.fontSize * 0.35, 14)}px`,
                fontFamily: theme.fontFamily,
              }}
            >
              {hasMultiple && activeVerse
                ? `${liveItem.scripture.book_name} ${liveItem.scripture.chapter}:${activeVerse.verse_number}`
                : formatRef(liveItem)}
            </p>
            <p
              style={{
                color: theme.textColor,
                fontSize: `${Math.min(theme.fontSize * 0.4, 16)}px`,
                fontFamily: theme.fontFamily,
                lineHeight: 1.4,
              }}
            >
              {hasMultiple && activeVerse ? activeVerse.text : liveItem.verse_text || ""}
            </p>
            {hasMultiple && (
              <p
                className="mt-2 opacity-60"
                style={{
                  color: theme.textColor,
                  fontSize: `${Math.min(theme.fontSize * 0.2, 10)}px`,
                }}
              >
                {livePage + 1} / {verses.length}
              </p>
            )}
          </div>
        ) : (
          <div className="flex h-full flex-col items-center justify-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-white/10">
              <MonitorPlay className="h-5 w-5 text-white/40" />
            </div>
            <p className="mt-2 text-xs text-white/50">No live content</p>
          </div>
        )}
      </div>
    </div>
  );
}
