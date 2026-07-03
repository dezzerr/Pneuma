import { motion, AnimatePresence } from "framer-motion";
import { useOperatorStore } from "../store";
import { X } from "lucide-react";

const HOTKEYS = [
  { key: "L", desc: "Toggle Live Sync (auto-push staged → live)" },
  { key: "Tab", desc: "Focus Scripture Search" },
  { key: "Enter", desc: "Stage current selection (or push staged → live)" },
  { key: "Double-Enter", desc: "Instant Live — push first detection straight to live" },
  { key: "0-9", desc: "Rapid Select — stage the Nth item from Verse Queue" },
  { key: "?", desc: "Toggle this help overlay" },
];

export function HelpOverlay() {
  const { helpOverlayOpen, toggleHelpOverlay } = useOperatorStore();

  return (
    <AnimatePresence>
      {helpOverlayOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={toggleHelpOverlay}
            className="absolute inset-0 z-[60] bg-black/40"
          />
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute left-1/2 top-1/2 z-[61] w-80 -translate-x-1/2 -translate-y-1/2 rounded-2xl border border-border bg-card p-5 shadow-soft"
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-foreground">Keyboard Shortcuts</h2>
              <button
                onClick={toggleHelpOverlay}
                className="rounded-full p-1 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-2">
              {HOTKEYS.map((hk) => (
                <div key={hk.key} className="flex items-center gap-3">
                  <kbd className="min-w-[5rem] rounded-md border border-border bg-secondary px-2 py-1 text-center text-[10px] font-medium text-foreground">
                    {hk.key}
                  </kbd>
                  <span className="text-xs text-muted-foreground">{hk.desc}</span>
                </div>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
