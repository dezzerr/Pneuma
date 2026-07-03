use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use chrono_tz::Tz;
use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::sync::Mutex;
use tauri::{AppHandle, Manager};

use crate::db;

const FREE_WEEKLY_ALLOWANCE_SECONDS: i64 = 40 * 60;
const MAX_SINGLE_SESSION_MS: i64 = 60 * 60 * 1000; // 60 minutes

fn write_audit_log(conn: &Connection, event_type: &str, detail: Option<&str>) {
    let _ = conn.execute(
        "INSERT INTO audit_log (event_type, detail) VALUES (?1, ?2)",
        params![event_type, detail],
    );
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AuditEntry {
    pub id: i64,
    pub event_type: String,
    pub detail: Option<String>,
    pub timestamp: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaasAccountState {
    pub signed_in: bool,
    pub email: String,
    pub organization_name: String,
    pub organization_timezone: String,
    pub plan: String,
    pub subscription_status: String,
    pub last_synced_at: Option<String>,
}

impl Default for SaasAccountState {
    fn default() -> Self {
        Self {
            signed_in: false,
            email: String::new(),
            organization_name: String::new(),
            organization_timezone: "UTC".to_string(),
            plan: "free".to_string(),
            subscription_status: "inactive".to_string(),
            last_synced_at: None,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CloudUsageSummary {
    pub weekly_allowance_seconds: i64,
    pub used_seconds: i64,
    pub remaining_seconds: i64,
    pub unlimited: bool,
    pub week_start: String,
    pub week_end: String,
    pub timezone: String,
    pub active_session: bool,
    pub cloud_allowed: bool,
    pub blocking_reason: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaasState {
    pub account: SaasAccountState,
    pub usage: CloudUsageSummary,
}

fn lock_conn(app: &AppHandle) -> Result<std::sync::MutexGuard<'_, db::DbState>, String> {
    let conn_state = app.try_state::<std::sync::Mutex<db::DbState>>()
        .ok_or_else(|| "Database not ready".to_string())?;
    conn_state
        .inner()
        .lock()
        .map_err(|e| format!("DB lock error: {}", e))
}

fn normalize_timezone(timezone: &str) -> String {
    let trimmed = timezone.trim();
    if trimmed.is_empty() {
        return "UTC".to_string();
    }
    if trimmed.parse::<Tz>().is_ok() {
        trimmed.to_string()
    } else {
        "UTC".to_string()
    }
}

fn resolve_timezone(timezone: &str) -> Tz {
    normalize_timezone(timezone)
        .parse::<Tz>()
        .unwrap_or(chrono_tz::UTC)
}

fn local_midnight(tz: Tz, date: NaiveDate) -> Result<DateTime<Tz>, String> {
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| "Invalid week boundary".to_string())?;
    tz.from_local_datetime(&naive)
        .single()
        .or_else(|| tz.from_local_datetime(&naive).earliest())
        .or_else(|| tz.from_local_datetime(&naive).latest())
        .ok_or_else(|| "Unable to resolve organization timezone".to_string())
}

fn current_week_bounds(now_utc: DateTime<Utc>, timezone: &str) -> Result<(DateTime<Tz>, DateTime<Tz>), String> {
    let tz = resolve_timezone(timezone);
    let now_local = now_utc.with_timezone(&tz);
    let start_date = now_local.date_naive() - Duration::days(now_local.weekday().num_days_from_sunday() as i64);
    let start_local = local_midnight(tz, start_date)?;
    let end_local = start_local + Duration::days(7);
    Ok((start_local, end_local))
}

fn load_account(conn: &Connection) -> Result<SaasAccountState, String> {
    let raw: Option<String> = conn
        .query_row(
            "SELECT state_json FROM saas_account_state WHERE id = 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Load SaaS account error: {}", e))?;

    match raw {
        Some(json) => {
            let mut account: SaasAccountState = serde_json::from_str(&json)
                .map_err(|e| format!("Parse SaaS account error: {}", e))?;
            account.organization_timezone = normalize_timezone(&account.organization_timezone);
            Ok(account)
        }
        None => Ok(SaasAccountState::default()),
    }
}

fn save_account(conn: &Connection, account: &SaasAccountState) -> Result<SaasAccountState, String> {
    let mut normalized = account.clone();
    normalized.organization_timezone = normalize_timezone(&normalized.organization_timezone);
    normalized.last_synced_at = Some(Utc::now().to_rfc3339());
    let json = serde_json::to_string(&normalized)
        .map_err(|e| format!("Serialize SaaS account error: {}", e))?;

    conn.execute(
        "INSERT OR REPLACE INTO saas_account_state (id, state_json) VALUES (1, ?1)",
        params![json],
    )
    .map_err(|e| format!("Save SaaS account error: {}", e))?;

    Ok(normalized)
}

fn usage_window_strings(timezone: &str) -> Result<(String, String), String> {
    let (start, end) = current_week_bounds(Utc::now(), timezone)?;
    Ok((start.to_rfc3339(), end.to_rfc3339()))
}

fn compute_usage(conn: &Connection, account: &SaasAccountState) -> Result<CloudUsageSummary, String> {
    let timezone = normalize_timezone(&account.organization_timezone);
    let (week_start, week_end) = usage_window_strings(&timezone)?;
    let now_ms = Utc::now().timestamp_millis();
    let mut stmt = conn
        .prepare(
            "SELECT started_at_ms, ended_at_ms
             FROM cloud_usage_sessions
             WHERE week_start_local = ?1 AND week_end_local = ?2",
        )
        .map_err(|e| format!("Prepare cloud usage query error: {}", e))?;

    let rows = stmt
        .query_map(params![week_start, week_end], |row| {
            Ok((row.get::<_, i64>(0)?, row.get::<_, Option<i64>>(1)?))
        })
        .map_err(|e| format!("Cloud usage query error: {}", e))?;

    let mut used_ms: i64 = 0;
    let mut active_session = false;

    for row in rows {
        let (started_at_ms, ended_at_ms) = row.map_err(|e| format!("Cloud usage row error: {}", e))?;
        let end_ms = ended_at_ms.unwrap_or(now_ms);
        if ended_at_ms.is_none() {
            active_session = true;
        }
        // WS6: Skip negative-duration rows (clock manipulation guard)
        if end_ms > started_at_ms {
            // WS6: Cap single session contribution at 60 minutes
            let duration = (end_ms - started_at_ms).min(MAX_SINGLE_SESSION_MS);
            used_ms += duration;
        }
    }

    let used_seconds = (used_ms / 1000).max(0);
    let unlimited = account.signed_in
        && account.plan == "standard"
        && (account.subscription_status == "active" || account.subscription_status == "grace_period");

    let (cloud_allowed, blocking_reason, remaining_seconds) = if !account.signed_in {
        (false, Some("Sign in to use managed cloud transcription.".to_string()), 0)
    } else if unlimited {
        (true, None, 0)
    } else if account.plan == "free" {
        let remaining = (FREE_WEEKLY_ALLOWANCE_SECONDS - used_seconds).max(0);
        if remaining > 0 {
            (true, None, remaining)
        } else {
            (
                false,
                Some("Your free 40-minute cloud allowance has been used for this week.".to_string()),
                0,
            )
        }
    } else {
        (
            false,
            Some("An active Standard subscription is required for unlimited cloud transcription.".to_string()),
            0,
        )
    };

    Ok(CloudUsageSummary {
        weekly_allowance_seconds: FREE_WEEKLY_ALLOWANCE_SECONDS,
        used_seconds,
        remaining_seconds,
        unlimited,
        week_start,
        week_end,
        timezone,
        active_session,
        cloud_allowed,
        blocking_reason,
    })
}

fn build_state(conn: &Connection) -> Result<SaasState, String> {
    let account = load_account(conn)?;
    let usage = compute_usage(conn, &account)?;
    Ok(SaasState { account, usage })
}

fn close_active_sessions(conn: &Connection) -> Result<(), String> {
    conn.execute(
        "UPDATE cloud_usage_sessions SET ended_at_ms = ?1 WHERE ended_at_ms IS NULL",
        params![Utc::now().timestamp_millis()],
    )
    .map_err(|e| format!("Close cloud usage session error: {}", e))?;
    Ok(())
}

/// Returns true only in debug builds. Used by the frontend to gate
/// dev-only UI like the admin plan override panel.
#[tauri::command]
pub async fn saas_is_dev_mode() -> bool {
    cfg!(debug_assertions)
}

/// Retrieve recent audit log entries (dev/diagnostic only).
#[tauri::command]
pub async fn saas_get_audit_log(app: AppHandle, limit: Option<i64>) -> Result<Vec<AuditEntry>, String> {
    let conn = lock_conn(&app)?;
    let lim = limit.unwrap_or(50).min(500);
    let mut stmt = conn
        .0
        .prepare("SELECT id, event_type, detail, timestamp FROM audit_log ORDER BY id DESC LIMIT ?1")
        .map_err(|e| format!("Prepare audit log error: {}", e))?;
    let entries = stmt
        .query_map(params![lim], |row| {
            Ok(AuditEntry {
                id: row.get(0)?,
                event_type: row.get(1)?,
                detail: row.get(2)?,
                timestamp: row.get(3)?,
            })
        })
        .map_err(|e| format!("Audit log query error: {}", e))?;
    let mut result = Vec::new();
    for entry in entries {
        result.push(entry.map_err(|e| format!("Audit log row error: {}", e))?);
    }
    Ok(result)
}

#[tauri::command]
pub async fn saas_get_state(app: AppHandle) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    build_state(&conn.0)
}

#[tauri::command]
pub async fn saas_save_account(app: AppHandle, account: SaasAccountState) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    let old_account = load_account(&conn.0)?;
    let saved = save_account(&conn.0, &account)?;
    if old_account.plan != saved.plan {
        write_audit_log(
            &conn.0,
            "plan_changed",
            Some(&format!("{} -> {} (status: {})", old_account.plan, saved.plan, saved.subscription_status)),
        );
    }
    if !old_account.signed_in && saved.signed_in {
        write_audit_log(&conn.0, "account_signed_in", Some(&saved.email));
    }
    if old_account.signed_in && !saved.signed_in {
        write_audit_log(&conn.0, "account_signed_out", None);
    }
    build_state(&conn.0)
}

#[tauri::command]
pub async fn saas_start_cloud_session(app: AppHandle) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    let account = load_account(&conn.0)?;
    let usage = compute_usage(&conn.0, &account)?;

    if !usage.cloud_allowed {
        return Err(
            usage
                .blocking_reason
                .unwrap_or_else(|| "Cloud transcription is not available.".to_string()),
        );
    }

    let active_id: Option<i64> = conn
        .0
        .query_row(
            "SELECT id FROM cloud_usage_sessions WHERE ended_at_ms IS NULL LIMIT 1",
            [],
            |row| row.get(0),
        )
        .optional()
        .map_err(|e| format!("Read active cloud session error: {}", e))?;

    if active_id.is_none() {
        let now = Utc::now();
        let (week_start, week_end) = usage_window_strings(&account.organization_timezone)?;
        conn.0
            .execute(
                "INSERT INTO cloud_usage_sessions (
                    started_at_ms,
                    ended_at_ms,
                    timezone,
                    week_start_local,
                    week_end_local,
                    plan_snapshot
                ) VALUES (?1, NULL, ?2, ?3, ?4, ?5)",
                params![
                    now.timestamp_millis(),
                    normalize_timezone(&account.organization_timezone),
                    week_start,
                    week_end,
                    account.plan
                ],
            )
            .map_err(|e| format!("Start cloud usage session error: {}", e))?;
        write_audit_log(
            &conn.0,
            "cloud_session_started",
            Some(&format!("plan={}, week={}", account.plan, week_start)),
        );
    }

    build_state(&conn.0)
}

#[tauri::command]
pub async fn saas_pause_cloud_session(app: AppHandle) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    close_active_sessions(&conn.0)?;
    build_state(&conn.0)
}

#[tauri::command]
pub async fn saas_stop_cloud_session(app: AppHandle) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    close_active_sessions(&conn.0)?;
    build_state(&conn.0)
}

/// Open the Stripe Checkout page in the user's default browser.
/// The URL is built from env vars or a placeholder. After successful payment,
/// the backend would redirect back; for now the user returns manually and
/// the app refreshes entitlement state.
#[tauri::command]
pub async fn saas_open_checkout(app: AppHandle) -> Result<(), String> {
    let conn = lock_conn(&app)?;
    let account = load_account(&conn.0)?;

    let base = std::env::var("PNEUMA_CHECKOUT_URL")
        .unwrap_or_else(|_| "https://checkout.stripe.com/c/pay/pneuma-standard".to_string());

    let mut url = base;
    if !account.email.is_empty() {
        let sep = if url.contains('?') { '&' } else { '?' };
        url = format!("{}{}prefilled_email={}", url, sep, urlencoding::encode(&account.email));
    }

    open::that(&url).map_err(|e| format!("Failed to open checkout: {}", e))
}

/// Open the Stripe Billing Portal in the user's default browser.
/// Only meaningful for accounts with an active subscription.
#[tauri::command]
pub async fn saas_open_billing_portal() -> Result<(), String> {
    let url = std::env::var("PNEUMA_BILLING_PORTAL_URL")
        .unwrap_or_else(|_| "https://billing.stripe.com/p/pneuma-portal".to_string());
    open::that(&url).map_err(|e| format!("Failed to open billing portal: {}", e))
}

/// Refresh entitlement state after the user returns from checkout.
/// In a full backend implementation this would call the server; for now it
/// re-reads the local DB so any externally-updated state is picked up.
#[tauri::command]
pub async fn saas_refresh_entitlements(app: AppHandle) -> Result<SaasState, String> {
    let conn = lock_conn(&app)?;
    build_state(&conn.0)
}
