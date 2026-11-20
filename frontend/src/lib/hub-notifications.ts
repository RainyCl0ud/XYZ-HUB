import { CENTRAL_TIME_ZONE } from "./time";

export type HubNotificationKind = "MENTION" | "ANNOUNCEMENT" | "BREAK_REMINDER" | "BREAK_LIMIT" | "OPEN_SHIFT" | "CORRECTION_REVIEW" | "CORRECTION_DECIDED";
export type HubNotificationTarget =
  | { type: "chat-message"; conversationId: string; messageId: string }
  | { type: "clock" }
  | { type: "clock-request"; requestId: string };
export type HubNotification = {
  key: string; kind: HubNotificationKind; occurredAt: string; read: boolean;
  title: string; body: string; context: string; target: HubNotificationTarget | null;
};
export type HubNotificationPage = { unreadCount: number; items: HubNotification[]; nextBefore: string | null };
export type HubNotificationSummary = { available: boolean; unreadCount: number; latest: HubNotification[]; deviceLatest?: HubNotification[] };

// Chat dispatches this after saving reads, so a mention read in Chat leaves
// the bell promptly instead of waiting for the next poll.
export const HUB_NOTIFICATIONS_CHANGED = "xyz-chat-unread-changed";
export const refreshHubNotifications = () => window.dispatchEvent(new Event(HUB_NOTIFICATIONS_CHANGED));

const safeId = (value: string) => /^[A-Za-z0-9_-]{1,100}$/.test(value);
/** Destinations stay inside the Hub; each page re-checks access when it opens. */
export function notificationHref(target: HubNotificationTarget | null): string | null {
  if (!target) return null;
  if (target.type === "chat-message") {
    if (!safeId(target.conversationId) || !safeId(target.messageId)) return null;
    return `/chat?conversation=${encodeURIComponent(target.conversationId)}&message=${encodeURIComponent(target.messageId)}`;
  }
  if (target.type === "clock-request") return safeId(target.requestId) ? `/clock/requests/${encodeURIComponent(target.requestId)}` : null;
  return "/clock";
}

// Attendance and correction notices may also reach the device. Chat-derived
// notices (mentions, announcements) keep following the Chat alert rules in
// brief 7.3, so they never produce a second device alert from the bell.
export const DEVICE_NOTICE_KINDS: ReadonlySet<HubNotificationKind> = new Set(["BREAK_REMINDER", "BREAK_LIMIT", "OPEN_SHIFT", "CORRECTION_REVIEW", "CORRECTION_DECIDED"]);

export function relativeNotificationTime(value: string, now = Date.now()) {
  const at = new Date(value).getTime();
  if (!Number.isFinite(at)) return "";
  const minutes = Math.max(0, Math.round((now - at) / 60_000));
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return days === 1 ? "Yesterday" : `${days} days ago`;
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric" }).format(new Date(at));
}

export function exactNotificationTime(value: string) {
  return new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));
}
