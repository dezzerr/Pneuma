import { useEffect, useRef } from "react";
import { useOperatorStore } from "../store";
import { Eye, Send, X } from "lucide-react";
import type { VerseQueueItem } from "@/shared/types";

export function PreviewCanvas() {
  const { stagedItem, theme, goLive, stageItem, liveSync } = useOperatorStore();
  const lastAutoPushedRef = useRef<string | null>(null);

  // Live Sync: auto-push staged item to live (goLive has 2.5s anti-flicker cooldown)
  useEffect(() => {
    if (liveSync && stagedItem && stagedItem.id !== lastAutoPushedRef.current) {
      lastAutoPushedRef.current = stagedItem.id;
      goLive(stagedItem);
    }
  }, [liveSync, stagedItem, goLive]);

  const formatRef = (item: VerseQueueItem) => {
    const { book_name, chapter, verse_start, verse_end } = item.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

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
            <Eye className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Program Preview</h2>
          {liveSync && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Live Sync
            </span>
          )}
        </div>
        {stagedItem && (
          <div className="flex items-center gap-1">
            <button
              onClick={() => goLive(stagedItem)}
              className="flex items-center gap-1 rounded-full bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
              title="Push Live (Enter)"
            >
              <Send className="h-3 w-3" />
              Push Live
            </button>
            <button
              onClick={() => stageItem(null)}
              className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      <div className="relative flex-1 overflow-hidden bg-black/80">
        {stagedItem ? (
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
              {formatRef(stagedItem)}
            </p>
            <p
              style={{
                color: theme.textColor,
                fontSize: `${Math.min(theme.fontSize * 0.4, 16)}px`,
                fontFamily: theme.fontFamily,
                lineHeight: 1.4,
              }}
            >
              {stagedItem.verse_text || "Loading verse text..."}
            </p>
          </div>
        ) : (
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
              John 3:16
            </p>
            <p
              style={{
                color: theme.textColor,
                fontSize: `${Math.min(theme.fontSize * 0.4, 16)}px`,
                fontFamily: theme.fontFamily,
                lineHeight: 1.4,
              }}
            >
              For God so loved the world, that he gave his only begotten Son...
            </p>
            <p className="mt-3 text-[10px] uppercase tracking-wide text-white/30">Theme Preview</p>
          </div>
        )}
      </div>
    </div>
  );
}
