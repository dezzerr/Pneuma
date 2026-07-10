import { useOperatorStore } from "../store";
import { Settings, Target, Tag, RotateCcw } from "lucide-react";

export function SettingsPanel() {
  const { appSettings, updateSettings } = useOperatorStore();

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <Settings className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        {/* Semantic Threshold */}
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Target className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Semantic Threshold</h3>
          </div>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Minimum cosine similarity for semantic scripture matches.
          </p>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0.5}
              max={0.9}
              step={0.01}
              value={appSettings.semantic_threshold}
              onChange={(e) => updateSettings({ semantic_threshold: parseFloat(e.target.value) })}
              className="flex-1 accent-primary"
            />
            <span className="min-w-[3rem] text-right text-xs font-medium tabular-nums text-foreground">
              {appSettings.semantic_threshold.toFixed(2)}
            </span>
          </div>
        </section>

        {/* Hot Words */}
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Tag className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Hot Words</h3>
          </div>
          <p className="mb-2 text-[10px] text-muted-foreground">
            Comma-separated words to bias the Whisper model toward specific vocabulary.
          </p>
          <input
            type="text"
            value={appSettings.hot_words.join(", ")}
            onChange={(e) =>
              updateSettings({
                hot_words: e.target.value
                  .split(",")
                  .map((w) => w.trim())
                  .filter(Boolean),
              })
            }
            placeholder="e.g. grace, covenant, righteousness"
            className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
          />
        </section>

        {/* Reset */}
        <section className="border-t border-border pt-4">
          <button
            onClick={() =>
              updateSettings({
                semantic_threshold: 0.7,
                hot_words: [],
              })
            }
            className="flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            <RotateCcw className="h-3 w-3" />
            Reset to defaults
          </button>
        </section>
      </div>
    </div>
  );
}
