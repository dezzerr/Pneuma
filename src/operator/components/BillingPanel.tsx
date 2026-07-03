import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useOperatorStore } from "../store";
import {
  CreditCard,
  Check,
  Loader2,
  ExternalLink,
  AlertTriangle,
  Zap,
  Cloud,
  RefreshCw,
} from "lucide-react";
import type { SaaSState } from "@/shared/types";

function formatDurationSeconds(totalSeconds: number) {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}m ${seconds.toString().padStart(2, "0")}s`;
}

const FREE_FEATURES = [
  "40 min/week cloud transcription",
  "Unlimited local (offline) transcription",
  "All Bible translations & search",
  "Presentation canvas + NDI",
];

const STANDARD_FEATURES = [
  "Unlimited cloud transcription",
  "Everything in Free",
  "Priority cloud engine access",
  "Multi-operator org support",
];

export function BillingPanel() {
  const { saasState, refreshSaasState, saveSaasAccount } = useOperatorStore();
  const [checkoutLoading, setCheckoutLoading] = useState(false);
  const [portalLoading, setPortalLoading] = useState(false);
  const [refreshLoading, setRefreshLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isDevMode, setIsDevMode] = useState(false);

  useEffect(() => {
    invoke<boolean>("saas_is_dev_mode").then(setIsDevMode).catch(() => setIsDevMode(false));
  }, []);

  const { account, usage } = saasState;
  const isStandard = account.plan === "standard" && (account.subscription_status === "active" || account.subscription_status === "grace_period");
  const isGracePeriod = account.subscription_status === "grace_period";

  const handleUpgrade = async () => {
    setCheckoutLoading(true);
    setError(null);
    try {
      await invoke("saas_open_checkout");
    } catch (err) {
      setError(String(err));
    } finally {
      setCheckoutLoading(false);
    }
  };

  const handleManageBilling = async () => {
    setPortalLoading(true);
    setError(null);
    try {
      await invoke("saas_open_billing_portal");
    } catch (err) {
      setError(String(err));
    } finally {
      setPortalLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshLoading(true);
    setError(null);
    try {
      await invoke<SaaSState>("saas_refresh_entitlements");
      await refreshSaasState();
    } catch (err) {
      setError(String(err));
    } finally {
      setRefreshLoading(false);
    }
  };

  return (
    <div className="flex h-full flex-col overflow-hidden p-4">
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/10">
          <CreditCard className="h-3.5 w-3.5 text-primary" />
        </div>
        <h2 className="text-sm font-semibold text-foreground">Billing & Plans</h2>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto pr-1">
        {/* Current Plan Badge */}
        <div className="rounded-xl border border-border bg-card p-3">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">Current Plan</p>
              <p className="text-sm font-semibold text-foreground">
                {isStandard ? "Standard" : "Free"}
              </p>
            </div>
            <span
              className={`rounded-full px-2.5 py-1 text-[10px] font-medium ${
                isStandard
                  ? "bg-green-500/10 text-green-500"
                  : "bg-secondary text-muted-foreground"
              }`}
            >
              {account.subscription_status === "active" && "Active"}
              {account.subscription_status === "grace_period" && "Grace Period"}
              {account.subscription_status === "inactive" && "Inactive"}
            </span>
          </div>
          {account.signed_in && (
            <p className="mt-1.5 text-[10px] text-muted-foreground">
              {account.organization_name || account.email}
            </p>
          )}
        </div>

        {/* Grace Period Warning */}
        {isGracePeriod && (
          <div className="flex items-start gap-2 rounded-xl border border-warning/30 bg-warning/5 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
            <div>
              <p className="text-xs font-medium text-warning">Payment Action Required</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">
                Your subscription is in a grace period. Update your payment method to avoid losing unlimited cloud access.
              </p>
              <button
                onClick={handleManageBilling}
                disabled={portalLoading}
                className="mt-2 flex items-center gap-1 rounded-full border border-warning/40 px-2.5 py-1 text-[10px] font-medium text-warning transition-colors hover:bg-warning/10 disabled:opacity-40"
              >
                {portalLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : <ExternalLink className="h-3 w-3" />}
                Update Payment
              </button>
            </div>
          </div>
        )}

        {/* Plan Comparison */}
        <div className="grid grid-cols-2 gap-2">
          {/* Free Plan */}
          <div
            className={`rounded-xl border p-3 ${
              !isStandard ? "border-primary bg-primary/5" : "border-border bg-card"
            }`}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Cloud className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-xs font-semibold text-foreground">Free</h3>
            </div>
            <p className="mb-2 text-lg font-bold text-foreground">$0<span className="text-[10px] font-normal text-muted-foreground">/mo</span></p>
            <ul className="space-y-1">
              {FREE_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                  <Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            {!isStandard && (
              <p className="mt-2 text-[10px] font-medium text-primary">Current plan</p>
            )}
          </div>

          {/* Standard Plan */}
          <div
            className={`rounded-xl border p-3 ${
              isStandard ? "border-primary bg-primary/5" : "border-primary/30 bg-card"
            }`}
          >
            <div className="mb-2 flex items-center gap-1.5">
              <Zap className="h-3.5 w-3.5 text-primary" />
              <h3 className="text-xs font-semibold text-foreground">Standard</h3>
            </div>
            <p className="mb-2 text-lg font-bold text-foreground">$20<span className="text-[10px] font-normal text-muted-foreground">/mo</span></p>
            <ul className="space-y-1">
              {STANDARD_FEATURES.map((f) => (
                <li key={f} className="flex items-start gap-1 text-[10px] text-muted-foreground">
                  <Check className="mt-0.5 h-2.5 w-2.5 shrink-0 text-green-500" />
                  {f}
                </li>
              ))}
            </ul>
            {isStandard && (
              <p className="mt-2 text-[10px] font-medium text-primary">Current plan</p>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="space-y-2">
          {!isStandard && (
            <button
              onClick={handleUpgrade}
              disabled={checkoutLoading || !account.signed_in}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-4 py-2.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-40"
            >
              {checkoutLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <CreditCard className="h-3.5 w-3.5" />
              )}
              Upgrade to Standard — $20/mo
            </button>
          )}
          {!account.signed_in && !isStandard && (
            <p className="text-center text-[10px] text-muted-foreground">
              Sign in to your account in Settings to upgrade.
            </p>
          )}

          {isStandard && (
            <button
              onClick={handleManageBilling}
              disabled={portalLoading}
              className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2.5 text-xs font-medium text-foreground transition-colors hover:bg-secondary disabled:opacity-40"
            >
              {portalLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ExternalLink className="h-3.5 w-3.5" />
              )}
              Manage Billing
            </button>
          )}

          <button
            onClick={handleRefresh}
            disabled={refreshLoading}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-border px-4 py-2 text-[11px] font-medium text-muted-foreground transition-colors hover:bg-secondary disabled:opacity-40"
          >
            {refreshLoading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
            Refresh Entitlements
          </button>
        </div>

        {/* Usage Summary (compact) */}
        <div className="rounded-xl border border-border bg-card p-3 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between">
            <span>Cloud minutes remaining</span>
            <span className="font-medium text-foreground">
              {usage.unlimited ? "Unlimited" : formatDurationSeconds(usage.remaining_seconds)}
            </span>
          </div>
          <div className="mt-1 flex items-center justify-between">
            <span>Used this week</span>
            <span className="font-medium text-foreground">{formatDurationSeconds(usage.used_seconds)}</span>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
            {error}
          </div>
        )}

        {/* Local plan override (dev only — compiled out of release builds) */}
        {isDevMode && (
        <details className="rounded-xl border border-border bg-card p-3">
          <summary className="cursor-pointer text-[10px] font-medium text-muted-foreground">
            Admin: Override plan locally
          </summary>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              onClick={() => void saveSaasAccount({ plan: "free", subscription_status: "inactive" })}
              className="rounded-lg border border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
            >
              Set Free
            </button>
            <button
              onClick={() => void saveSaasAccount({ plan: "standard", subscription_status: "active" })}
              className="rounded-lg border border-border px-2 py-1.5 text-[10px] font-medium text-muted-foreground hover:bg-secondary"
            >
              Set Standard
            </button>
          </div>
          <p className="mt-2 text-[9px] text-muted-foreground">
            For development only. Production entitlements are set by the backend after Stripe checkout.
          </p>
        </details>
        )}
      </div>
    </div>
  );
}
