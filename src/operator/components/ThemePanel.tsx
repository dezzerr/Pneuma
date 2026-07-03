import { useOperatorStore } from "../store";
import { emit } from "@tauri-apps/api/event";
import { EVENTS } from "@/shared/events";
import type { ThemeConfig } from "@/shared/types";
import { Palette, Type, AlignLeft, AlignCenter, AlignRight, Layout } from "lucide-react";

export function ThemePanel() {
  const { theme, setTheme } = useOperatorStore();

  const updateTheme = (partial: Partial<ThemeConfig>) => {
    const merged = { ...theme, ...partial };
    setTheme(merged);
    emit(EVENTS.THEME_UPDATED, merged);
  };

  const fonts = [
    { value: "Georgia, serif", label: "Georgia (Serif)" },
    { value: "'Helvetica Neue', sans-serif", label: "Helvetica (Sans)" },
    { value: "'Courier New', monospace", label: "Courier (Mono)" },
    { value: "'Times New Roman', serif", label: "Times New Roman" },
  ];

  const alignments = [
    { value: "left" as const, icon: AlignLeft },
    { value: "center" as const, icon: AlignCenter },
    { value: "right" as const, icon: AlignRight },
  ];

  const layouts = [
    { value: "fullscreen" as const, label: "Full Screen" },
    { value: "lower-thirds" as const, label: "Lower Thirds" },
  ];

  const animations = [
    { value: "fade" as const, label: "Fade" },
    { value: "slide" as const, label: "Slide" },
    { value: "kinetic-slide" as const, label: "Kinetic" },
    { value: "none" as const, label: "None" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-3 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <Palette className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Theme</h2>
      </div>

      <div className="grid flex-1 grid-cols-2 grid-rows-2 gap-3 overflow-y-auto pr-1">
        {/* Font Family + Size */}
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-card p-3">
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Type className="h-3.5 w-3.5" />
            Font Family
          </label>
          <select
            value={theme.fontFamily}
            onChange={(e) => updateTheme({ fontFamily: e.target.value })}
            className="w-full rounded-lg border border-input bg-background px-2.5 py-1.5 text-xs text-foreground outline-none focus:border-primary"
          >
            {fonts.map((f) => (
              <option key={f.value} value={f.value}>
                {f.label}
              </option>
            ))}
          </select>
          <label className="block pt-1 text-xs font-medium text-muted-foreground">
            Font Size: {theme.fontSize}px
          </label>
          <input
            type="range"
            min="16"
            max="96"
            value={theme.fontSize}
            onChange={(e) => updateTheme({ fontSize: Number(e.target.value) })}
            className="w-full accent-primary"
          />
        </div>

        {/* Alignment + Layout */}
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-card p-3">
          <label className="flex items-center gap-1 text-xs font-medium text-muted-foreground">
            <Layout className="h-3.5 w-3.5" />
            Alignment
          </label>
          <div className="flex gap-1.5">
            {alignments.map((a) => {
              const Icon = a.icon;
              return (
                <button
                  key={a.value}
                  onClick={() => updateTheme({ alignment: a.value })}
                  className={`flex-1 rounded-lg border py-1.5 transition-colors ${
                    theme.alignment === a.value
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon className="mx-auto h-3.5 w-3.5" />
                </button>
              );
            })}
          </div>
          <label className="block pt-1 text-xs font-medium text-muted-foreground">
            Layout Mode
          </label>
          <div className="flex gap-1.5">
            {layouts.map((l) => (
              <button
                key={l.value}
                onClick={() => updateTheme({ layoutMode: l.value })}
                className={`flex-1 rounded-lg border px-1.5 py-1.5 text-[11px] font-medium transition-colors ${
                  theme.layoutMode === l.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>

        {/* Animation */}
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-card p-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Animation
          </label>
          <div className="grid grid-cols-2 gap-1.5">
            {animations.map((a) => (
              <button
                key={a.value}
                onClick={() => updateTheme({ animation: a.value })}
                className={`rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors ${
                  theme.animation === a.value
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border bg-background text-muted-foreground hover:bg-secondary"
                }`}
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>

        {/* Colors + Alpha Background */}
        <div className="flex flex-col justify-center gap-2 rounded-xl border border-border bg-card p-3">
          <label className="block text-xs font-medium text-muted-foreground">
            Colors
          </label>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">Text</span>
            <input
              type="color"
              value={theme.textColor}
              onChange={(e) => updateTheme({ textColor: e.target.value })}
              className="h-5 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
          </div>
          <div className="flex items-center justify-between rounded-lg border border-border bg-background px-2.5 py-1.5">
            <span className="text-xs text-muted-foreground">Accent</span>
            <input
              type="color"
              value={theme.accentColor}
              onChange={(e) => updateTheme({ accentColor: e.target.value })}
              className="h-5 w-10 cursor-pointer rounded border border-border bg-transparent"
            />
          </div>
          <button
            onClick={() => updateTheme({ alphaBackground: !theme.alphaBackground })}
            className={`flex w-full items-center justify-between rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
              theme.alphaBackground
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-background text-muted-foreground hover:bg-secondary"
            }`}
          >
            <span>Alpha Transparent</span>
            <span className="text-[10px]">
              {theme.alphaBackground ? "ON" : "OFF"}
            </span>
          </button>
          {theme.alphaBackground && (
            <p className="text-[10px] text-muted-foreground">
              Transparent for OBS/vMix key-fill capture
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
