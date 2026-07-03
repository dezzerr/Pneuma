import { useOperatorStore } from "../store";
import type { VerseQueueItem } from "@/shared/types";
import { Radar, Plus, Clock } from "lucide-react";

export function RecentDetections() {
  const { recentDetections, addVerseToQueue, verseQueue } = useOperatorStore();

  const formatRef = (item: VerseQueueItem) => {
    const { book_name, chapter, verse_start, verse_end } = item.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  const isInQueue = (item: VerseQueueItem) =>
    verseQueue.some((v) => v.id === item.id);

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <Radar className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Recent Detections</h2>
          {recentDetections.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {recentDetections.length}
            </span>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
        {recentDetections.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-1">
              <Clock className="mx-auto h-8 w-8 text-muted-foreground/40" />
              <p className="text-xs text-muted-foreground">
                No detections yet.
              </p>
              <p className="text-[10px] text-muted-foreground/60">
                Detected verses will appear here.
              </p>
            </div>
          </div>
        ) : (
          recentDetections.map((item) => {
            const inQueue = isInQueue(item);
            return (
              <div
                key={item.id}
                className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 transition-colors hover:border-primary/30"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs font-semibold text-foreground">
                      {formatRef(item)}
                    </span>
                    <span
                      className={`rounded-full px-1.5 py-0.5 text-[9px] font-medium ${
                        item.match_type === "REGEX"
                          ? "bg-blue-500/10 text-blue-500"
                          : "bg-purple-500/10 text-purple-500"
                      }`}
                    >
                      {item.match_type}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </span>
                    <span className="text-[10px] text-muted-foreground">
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                    {item.status === "live" && (
                      <span className="text-[9px] font-medium text-primary">Live</span>
                    )}
                    {item.status === "dismissed" && (
                      <span className="text-[9px] font-medium text-muted-foreground">Dismissed</span>
                    )}
                  </div>
                </div>
                {!inQueue && (
                  <button
                    onClick={() => addVerseToQueue(item)}
                    className="flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-1 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
                  >
                    <Plus className="h-3 w-3" />
                    Queue
                  </button>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
