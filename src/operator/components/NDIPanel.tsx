import { invoke } from "@tauri-apps/api/core";
import { useState } from "react";
import { useTauriEvent } from "@/shared/hooks/useTauriEvent";
import { EVENTS } from "@/shared/events";
import { Radio } from "lucide-react";

interface NdiStatusPayload {
  active: boolean;
  error: string | null;
}

export function NDIPanel() {
  const [ndiActive, setNdiActive] = useState(false);
  const [ndiError, setNdiError] = useState<string | null>(null);
  const [ndiLoading, setNdiLoading] = useState(false);

  useTauriEvent<NdiStatusPayload>(EVENTS.NDI_STATUS, (payload) => {
    setNdiActive(payload.active);
    setNdiError(payload.error);
    setNdiLoading(false);
  });

  const handleNdiToggle = async () => {
    setNdiLoading(true);
    setNdiError(null);
    try {
      if (ndiActive) {
        await invoke("ndi_stop_broadcast");
      } else {
        await invoke("ndi_start_broadcast");
      }
    } catch (e) {
      setNdiError(String(e));
      setNdiLoading(false);
    }
  };

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="mb-4 flex items-center gap-2">
        <Radio className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold text-foreground">NDI Broadcast</h2>
      </div>

      <p className="mb-4 text-xs leading-relaxed text-muted-foreground">
        Broadcast the Presentation window as an NDI video source on the local network.
      </p>

      <button
        onClick={handleNdiToggle}
        disabled={ndiLoading}
        className={`flex w-full items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-colors ${
          ndiActive
            ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        } ${ndiLoading ? "opacity-50" : ""}`}
      >
        <Radio className="h-4 w-4" />
        {ndiLoading ? "Connecting..." : ndiActive ? "Stop Broadcast" : "Start NDI Broadcast"}
      </button>

      {ndiError && (
        <div className="mt-3 rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {ndiError}
        </div>
      )}

      {ndiActive && !ndiError && (
        <div className="mt-3 rounded-xl bg-primary/10 px-3 py-2 text-xs text-primary">
          Source &quot;Pneuma Presentation&quot; is live on the local network.
        </div>
      )}
    </div>
  );
}
