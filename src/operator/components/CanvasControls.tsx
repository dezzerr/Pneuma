import { emit } from "@tauri-apps/api/event";
import { useOperatorStore } from "../store";
import { EVENTS } from "@/shared/events";
import type { CanvasState } from "@/shared/types";
import { Monitor, Eraser, Snowflake, Play } from "lucide-react";

export function CanvasControls() {
  const { canvasState, setCanvasState } = useOperatorStore();

  const handleCanvasAction = async (state: CanvasState) => {
    const newState = canvasState === state ? "normal" : state;
    setCanvasState(newState);

    if (newState === "blackout") await emit(EVENTS.CANVAS_BLACKOUT);
    else if (newState === "clear") await emit(EVENTS.CANVAS_CLEAR);
    else if (newState === "freeze") await emit(EVENTS.CANVAS_FREEZE);
    else await emit(EVENTS.CANVAS_RESUME);
  };

  const controls = [
    {
      state: "blackout" as CanvasState,
      label: "Blackout",
      icon: Monitor,
      activeClass: "bg-destructive/90 text-white border-destructive/50",
    },
    {
      state: "clear" as CanvasState,
      label: "Clear Text",
      icon: Eraser,
      activeClass: "bg-warning/90 text-white border-warning/50",
    },
    {
      state: "freeze" as CanvasState,
      label: "Freeze",
      icon: Snowflake,
      activeClass: "bg-blue-500/90 text-white border-blue-500/50",
    },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <Monitor className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Canvas Controls</h2>
      </div>

      <div className="space-y-2">
        {controls.map((ctrl) => {
          const Icon = ctrl.icon;
          const isActive = canvasState === ctrl.state;
          return (
            <button
              key={ctrl.state}
              onClick={() => handleCanvasAction(ctrl.state)}
              className={`flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-xs font-medium transition-colors ${
                isActive
                  ? ctrl.activeClass
                  : "border-border bg-card text-muted-foreground hover:bg-secondary"
              }`}
            >
              <Icon className="h-4 w-4" />
              {ctrl.label}
            </button>
          );
        })}
        {canvasState === "freeze" && (
          <button
            onClick={() => handleCanvasAction("freeze")}
            className="flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-3 py-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-secondary"
          >
            <Play className="h-4 w-4" />
            Resume
          </button>
        )}
      </div>

      <p className="mt-4 text-xs leading-relaxed text-muted-foreground">
        Canvas state controls what the audience sees on the Presentation window.
      </p>
    </div>
  );
}
