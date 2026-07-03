import { motion, AnimatePresence } from "framer-motion";
import { useOperatorStore } from "../store";
import { CanvasControls } from "./CanvasControls";
import { NDIPanel } from "./NDIPanel";
import { BibleImporter } from "./BibleImporter";
import { SettingsPanel } from "./SettingsPanel";
import { TranslationMarketplace } from "./TranslationMarketplace";
import { BillingPanel } from "./BillingPanel";
import { Monitor, Radio, BookOpen, Settings, Globe, CreditCard, X } from "lucide-react";
import type { DrawerTab } from "../store";

const TABS: { id: DrawerTab; label: string; icon: React.ElementType }[] = [
  { id: "canvas", label: "Canvas", icon: Monitor },
  { id: "ndi", label: "NDI", icon: Radio },
  { id: "import", label: "Import", icon: BookOpen },
  { id: "marketplace", label: "Marketplace", icon: Globe },
  { id: "billing", label: "Billing", icon: CreditCard },
  { id: "settings", label: "Settings", icon: Settings },
];

export function OperatorDrawer() {
  const { drawerTab, setDrawerTab } = useOperatorStore();
  const isOpen = drawerTab !== null;

  const handleClose = () => setDrawerTab(null);
  const handleTabClick = (tab: DrawerTab) => {
    setDrawerTab(drawerTab === tab ? null : tab);
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleClose}
            className="absolute inset-0 z-40 bg-black/10"
          />
          {/* Drawer */}
          <motion.aside
            initial={{ x: "100%" }}
            animate={{ x: 0 }}
            exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 260 }}
            className="absolute right-0 top-0 bottom-0 z-50 w-80 overflow-hidden border-l border-border bg-card shadow-soft"
          >
            {/* Tab strip */}
            <div className="flex items-center justify-between border-b border-border px-3 py-2.5">
              <div className="flex items-center gap-1">
                {TABS.map(({ id, label, icon: Icon }) => {
                  const active = drawerTab === id;
                  return (
                    <button
                      key={id}
                      onClick={() => handleTabClick(id)}
                      title={label}
                      className={`flex items-center justify-center rounded-full p-2 text-[11px] font-medium transition-colors ${
                        active
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-secondary"
                      }`}
                    >
                      <Icon className="h-4 w-4" />
                    </button>
                  );
                })}
              </div>
              <button
                onClick={handleClose}
                className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-secondary"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            {/* Active panel */}
            <div className="h-[calc(100%-48px)] overflow-hidden">
              {drawerTab === "canvas" && <CanvasControls />}
              {drawerTab === "ndi" && <NDIPanel />}
              {drawerTab === "import" && <BibleImporter />}
              {drawerTab === "marketplace" && <TranslationMarketplace />}
              {drawerTab === "billing" && <BillingPanel />}
              {drawerTab === "settings" && <SettingsPanel />}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
