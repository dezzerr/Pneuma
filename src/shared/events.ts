export const EVENTS = {
  VERSE_GO_LIVE: "verse:go-live",
  VERSE_QUEUE_NEXT: "verse:queue-next",
  VERSE_DISMISS: "verse:dismiss",
  VERSE_PAGE_SET: "verse:page-set",
  CANVAS_BLACKOUT: "canvas:blackout",
  CANVAS_CLEAR: "canvas:clear",
  CANVAS_FREEZE: "canvas:freeze",
  CANVAS_RESUME: "canvas:resume",
  TRANSCRIPT_CHUNK: "transcript:chunk",
  SCRIPTURE_DETECTED: "scripture:detected",
  THEME_UPDATED: "theme:updated",
  ENGINE_STATUS: "engine:status",
  AUDIO_DEVICE_CHANGED: "audio:device-changed",
  AUDIO_DISCONNECTED: "audio:disconnected",
  NDI_STATUS: "ndi:status",
  BIBLE_DOWNLOAD_PROGRESS: "bible:download-progress",
} as const;

export type EventName = (typeof EVENTS)[keyof typeof EVENTS];
