import { useOperatorStore } from "../store";
import { Settings, Target, Tag, RotateCcw, User, Building2, ShieldCheck, Clock3 } from "lucide-react";
import type { SaaSAccountState } from "@/shared/types";

function formatDurationSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

export function SettingsPanel() {
  const { appSettings, updateSettings, saasState, saveSaasAccount } = useOperatorStore();

  const planOptions: { value: SaaSAccountState["plan"]; label: string }[] = [
    { value: "free", label: "Free" },
    { value: "standard", label: "Standard" },
  ];

  const subscriptionOptions: { value: SaaSAccountState["subscription_status"]; label: string }[] = [
    { value: "inactive", label: "Inactive" },
    { value: "active", label: "Active" },
    { value: "grace_period", label: "Grace Period" },
  ];

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <Settings className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Settings</h2>
      </div>

      <div className="flex-1 space-y-5 overflow-y-auto pr-1">
        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <User className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Cloud Account</h3>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <label className="flex items-center justify-between text-[11px] text-muted-foreground">
              <span>Signed In</span>
              <input
                type="checkbox"
                checked={saasState.account.signed_in}
                onChange={(e) => void saveSaasAccount({ signed_in: e.target.checked })}
                className="accent-primary"
              />
            </label>
            <input
              type="email"
              value={saasState.account.email}
              onChange={(e) => void saveSaasAccount({ email: e.target.value })}
              placeholder="church@pneuma.app"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Organization</h3>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3">
            <input
              type="text"
              value={saasState.account.organization_name}
              onChange={(e) => void saveSaasAccount({ organization_name: e.target.value })}
              placeholder="Church Name"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
            <input
              type="text"
              value={saasState.account.organization_timezone}
              onChange={(e) => void saveSaasAccount({ organization_timezone: e.target.value })}
              placeholder="UTC"
              className="w-full rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            />
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <ShieldCheck className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Plan & Billing State</h3>
          </div>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border bg-card p-3">
            <select
              value={saasState.account.plan}
              onChange={(e) => void saveSaasAccount({ plan: e.target.value as SaaSAccountState["plan"] })}
              className="rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              {planOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
            <select
              value={saasState.account.subscription_status}
              onChange={(e) => void saveSaasAccount({ subscription_status: e.target.value as SaaSAccountState["subscription_status"] })}
              className="rounded-xl border border-input bg-card px-3 py-2 text-xs text-foreground outline-none focus:border-primary"
            >
              {subscriptionOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </section>

        <section>
          <div className="mb-2 flex items-center gap-1.5">
            <Clock3 className="h-3.5 w-3.5 text-muted-foreground" />
            <h3 className="text-xs font-semibold text-foreground">Weekly Cloud Usage</h3>
          </div>
          <div className="space-y-2 rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">
            <div className="flex items-center justify-between">
              <span>Status</span>
              <span className="font-medium text-foreground">
                {saasState.usage.unlimited ? "Unlimited" : formatDurationSeconds(saasState.usage.remaining_seconds)}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span>Used This Week</span>
              <span className="font-medium text-foreground">{formatDurationSeconds(saasState.usage.used_seconds)}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Timezone</span>
              <span className="font-medium text-foreground">{saasState.usage.timezone}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>Cloud Access</span>
              <span className={`font-medium ${saasState.usage.cloud_allowed ? "text-green-500" : "text-warning"}`}>
                {saasState.usage.cloud_allowed ? "Available" : "Blocked"}
              </span>
            </div>
            {!saasState.usage.cloud_allowed && saasState.usage.blocking_reason && (
              <p className="rounded-lg bg-warning/10 px-2 py-1.5 text-warning">
                {saasState.usage.blocking_reason}
              </p>
            )}
          </div>
        </section>

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
                semantic_threshold: 0.70,
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
