import { useOperatorStore } from "../store";
import type { VerseQueueItem, PlaylistItem } from "@/shared/types";
import { Brain, Send, Eye, X, Clock, Plus } from "lucide-react";

export function AIDetectionsPool() {
  const { verseQueue, verseHistory, updateVerseStatus, stageItem, goLive, addToPlaylist } =
    useOperatorStore();

  const handleGoLive = (item: VerseQueueItem) => {
    goLive(item);
    updateVerseStatus(item.id, "live");
  };

  const handleStage = (item: VerseQueueItem) => {
    stageItem(item);
  };

  const handleDismiss = (item: VerseQueueItem) => {
    updateVerseStatus(item.id, "dismissed");
  };

  const handleAddToPlaylist = (item: VerseQueueItem) => {
    const ref = formatRef(item);
    const playlistItem: PlaylistItem = {
      id: `pl-${Date.now()}`,
      type: "verse",
      label: ref,
      scripture: item.scripture,
      verse_text: item.verse_text,
      verses: item.verses,
    };
    addToPlaylist(playlistItem);
  };

  const formatRef = (item: VerseQueueItem) => {
    const { book_name, chapter, verse_start, verse_end } = item.scripture;
    return verse_start === verse_end
      ? `${book_name} ${chapter}:${verse_start}`
      : `${book_name} ${chapter}:${verse_start}-${verse_end}`;
  };

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <div className="flex items-center gap-2">
          <Brain className="h-3.5 w-3.5 text-muted-foreground" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI Detections
          </h2>
          {verseQueue.length > 0 && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-medium text-primary">
              {verseQueue.length}
            </span>
          )}
        </div>
      </div>

      {/* Detections */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1.5">
        {verseQueue.length === 0 && verseHistory.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-1">
              <Clock className="mx-auto h-6 w-6 text-muted-foreground/40" />
              <p className="text-[10px] text-muted-foreground">No scriptures detected yet.</p>
            </div>
          </div>
        ) : (
          <>
            {verseQueue.map((item, idx) => (
              <div
                key={item.id}
                className="rounded-md border border-border bg-card p-2 transition-colors hover:border-primary/40"
              >
                <div className="mb-1.5 flex items-start justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-bold text-muted-foreground min-w-[16px]">
                      {idx + 1}
                    </span>
                    <h3 className="text-xs font-semibold text-foreground">{formatRef(item)}</h3>
                  </div>
                  <div className="flex items-center gap-1">
                    <span
                      className={`rounded px-1 py-0.5 text-[8px] font-medium ${
                        item.match_type === "REGEX"
                          ? "bg-blue-500/20 text-blue-400"
                          : "bg-purple-500/20 text-purple-400"
                      }`}
                    >
                      {item.match_type}
                    </span>
                    <span className="text-[9px] text-muted-foreground">
                      {(item.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>

                {item.verse_text && (
                  <p className="mb-1.5 text-[10px] italic text-muted-foreground line-clamp-2">
                    &quot;{item.verse_text}&quot;
                  </p>
                )}

                <div className="flex items-center gap-1">
                  <button
                    onClick={() => handleStage(item)}
                    className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                  >
                    <Eye className="h-2.5 w-2.5" />
                    Stage
                  </button>
                  <button
                    onClick={() => handleGoLive(item)}
                    className="flex items-center gap-1 rounded bg-primary px-2 py-0.5 text-[9px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
                  >
                    <Send className="h-2.5 w-2.5" />
                    Live
                  </button>
                  <button
                    onClick={() => handleAddToPlaylist(item)}
                    className="flex items-center gap-1 rounded border border-border px-2 py-0.5 text-[9px] font-medium text-muted-foreground transition-colors hover:bg-accent"
                    title="Add to Playlist"
                  >
                    <Plus className="h-2.5 w-2.5" />
                  </button>
                  <button
                    onClick={() => handleDismiss(item)}
                    className="ml-auto rounded p-0.5 text-muted-foreground transition-colors hover:bg-destructive/20 hover:text-destructive"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              </div>
            ))}

            {/* History */}
            {verseHistory.length > 0 && (
              <div className="pt-2">
                <h3 className="mb-1.5 text-[9px] font-semibold uppercase tracking-wide text-muted-foreground/60">
                  History
                </h3>
                {verseHistory.slice(0, 10).map((item) => (
                  <div
                    key={item.id}
                    className="mb-0.5 flex items-center justify-between rounded px-1.5 py-0.5 text-[10px] text-muted-foreground/70"
                  >
                    <span>{formatRef(item)}</span>
                    <span className="text-[9px]">{item.match_type}</span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
