import { useOperatorStore } from "../store";
import { ListMusic, Trash2, ChevronUp, ChevronDown, Play, Plus } from "lucide-react";

export function PlaylistQueue() {
  const { playlist, playlistIndex, removeFromPlaylist, reorderPlaylist, advancePlaylist } =
    useOperatorStore();

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
            <ListMusic className="h-3.5 w-3.5 text-primary" />
          </div>
          <h2 className="text-sm font-semibold text-foreground">Playlist</h2>
          {playlist.length > 0 && (
            <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              {playlist.length}
            </span>
          )}
        </div>
        {playlist.length > 0 && (
          <button
            onClick={advancePlaylist}
            className="flex items-center gap-1 rounded-full bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            <Play className="h-3 w-3" />
            Next
          </button>
        )}
      </div>

      <div className="flex-1 space-y-1.5 overflow-y-auto pr-1">
        {playlist.length === 0 ? (
          <div className="flex h-full items-center justify-center text-center">
            <div className="space-y-1">
              <Plus className="mx-auto h-8 w-8 text-muted-foreground/30" />
              <p className="text-xs text-muted-foreground/60">
                Add verses or notes to build your run-of-show.
              </p>
            </div>
          </div>
        ) : (
          playlist.map((item, i) => (
            <div
              key={item.id}
              className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs transition-colors ${
                i === playlistIndex
                  ? "border-primary/50 bg-primary/10"
                  : "border-border bg-card hover:border-primary/30"
              }`}
            >
              <span className="w-5 text-center text-[10px] text-muted-foreground">
                {i + 1}
              </span>
              <div className="flex-1 truncate">
                <span className="font-medium text-foreground">{item.label}</span>
                {item.type === "verse" && (
                  <span className="ml-1.5 rounded-full bg-blue-500/10 px-1.5 py-0.5 text-[9px] text-blue-500">
                    VERSE
                  </span>
                )}
              </div>
              <div className="flex items-center gap-0.5">
                <button
                  onClick={() => i > 0 && reorderPlaylist(i, i - 1)}
                  disabled={i === 0}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronUp className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => i < playlist.length - 1 && reorderPlaylist(i, i + 1)}
                  disabled={i === playlist.length - 1}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-30"
                >
                  <ChevronDown className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => removeFromPlaylist(item.id)}
                  className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
