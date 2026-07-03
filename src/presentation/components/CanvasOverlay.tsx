import { usePresentationStore } from "../store";

export function CanvasOverlay() {
  const { canvasState } = usePresentationStore();

  if (canvasState === "blackout") {
    return <div className="absolute inset-0 z-50 bg-black" />;
  }

  return null;
}
