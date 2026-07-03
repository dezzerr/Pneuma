import { useOperatorStore } from "../store";
import type { VerseQueueItem } from "@/shared/types";
import { ListOrdered, Send, Eye, X, Clock } from "lucide-react";

export function VerseQueue() {
  const { verseQueue, updateVerseStatus, goLive, stageItem } = useOperatorStore();

  const handleGoLive = (item: VerseQueueItem) => {
    goLive(item);
    updateVerseStatus(item.id, "live");
  };

  const handleDismiss = (item: VerseQueueItem) => {
    updateVerseStatus(item.id, "dismissed");
  };

  const formatRef = (item: VerseQueueItem) => {
    const { book_name, chapter, verse_start, verse_end } = item.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Queue Header */}
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <ListOrdered className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Verse Queue</h2>
          {verseQueue.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {verseQueue.length}
            </span>
          )}
        </div>
      </div>

      {/* Queue Items */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {verseQueue.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-1">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No scriptures detected yet.
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Detected verses will appear here for review.
              </p>
            </div>
          </div>
        ) : (
          <>
            {verseQueue.map((item) => (
              <div
                key={item.id}
                className="rounded-xl border border-border bg-card p-3 transition-colors hover:border-primary/40"
              >
                <div className="mb-2 flex items-start justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-foreground">
                      {formatRef(item)}
                    </h3>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[9px] font-medium ${
                        item.match_type === "REGEX"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-purple-500/10 text-purple-500"
                      }`}
                    >
                      {item.match_type}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {item.verse_text && (
                  <p className="mb-2 text-xs italic text-muted-foreground line-clamp-2">
                    "{item.verse_text}"
                  </p>
                )}

                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => handleGoLive(item)}
                    className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1 text-[10px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                    title="Go Live (Enter)"
                  >
                    <Send className="h-3 w-3" />
                    Go Live
                  </button>
                  <button
                    onClick={() => stageItem(item)}
                    className="flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                    title="Stage (Double-Enter)"
                  >
                    <Eye className="h-3 w-3" />
                    Stage
                  </button>
                  <button
                    onClick={() => handleDismiss(item)}
                    className="ml-auto rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}

          </>
        )}
      </div>
    </div>
  );
}
