export type MatchType = "REGEX" | "SEMANTIC";

export interface DetectedScripture {
  match_type: MatchType;
  book_id: number;
  book_name: string;
  chapter: number;
  verse_start: number;
  verse_end: number;
  score?: number;
}

export interface TranscriptChunk {
  raw_text: string;
  is_final: boolean;
  confidence_score: number;
  detected_scriptures: DetectedScripture[];
}

export interface Verse {
  id: number;
  translation_code: string;
  book_index: number;
  book_name: string;
  chapter_number: number;
  verse_number: number;
  verse_text: string;
  clean_search_tokens: string | null;
}

export interface VerseLine {
  verse_number: number;
  text: string;
}

export interface VerseQueueItem {
  id: string;
  scripture: DetectedScripture;
  verse_text: string;
  verses: VerseLine[];
  confidence: number;
  match_type: MatchType;
  status: "pending" | "live" | "queued" | "dismissed";
  timestamp: number;
}

export interface ThemeConfig {
  fontFamily: string;
  fontSize: number;
  alignment: "left" | "center" | "right";
  layoutMode: "fullscreen" | "lower-thirds";
  animation: "fade" | "slide" | "kinetic-slide" | "none";
  backgroundColor: string;
  textColor: string;
  accentColor: string;
  alphaBackground: boolean;
}

export type CanvasState = "normal" | "blackout" | "clear" | "freeze";

export interface AudioDevice {
  id: string;
  name: string;
  is_default: boolean;
}

export type EngineStatus =
  | "stopped"
  | "starting"
  | "running"
  | "paused"
  | "error";

export type EngineMode = "cloud" | "local";

export type EngineWarning =
  | "idle_paused"
  | "connection_drop"
  | "sign_in_required"
  | "quota_exhausted"
  | "deepgram_key_missing"
  | null;

export type SubscriptionPlan = "free" | "standard";

export type SubscriptionStatus = "inactive" | "active" | "grace_period";

export interface SaaSAccountState {
  signed_in: boolean;
  email: string;
  organization_name: string;
  organization_timezone: string;
  plan: SubscriptionPlan;
  subscription_status: SubscriptionStatus;
  last_synced_at: string | null;
}

export interface CloudUsageSummary {
  weekly_allowance_seconds: number;
  used_seconds: number;
  remaining_seconds: number;
  unlimited: boolean;
  week_start: string;
  week_end: string;
  timezone: string;
  active_session: boolean;
  cloud_allowed: boolean;
  blocking_reason: string | null;
}

export interface SaaSState {
  account: SaaSAccountState;
  usage: CloudUsageSummary;
}

export interface PlaylistItem {
  id: string;
  type: "verse" | "note" | "placeholder";
  label: string;
  scripture?: DetectedScripture;
  verse_text?: string;
  verses?: VerseLine[];
  duration?: number;
}

export interface AppSettings {
  theme: ThemeConfig;
  selected_audio_device: string | null;
  model_tier: "tiny" | "base" | "small";
  inference_delay_ms: number;
  semantic_threshold: number;
  hot_words: string[];
  active_translation: string;
}
