import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { ApiError, apiRequest } from "../lib/api";
import {
  DEVICE_NOTICE_KINDS, HUB_NOTIFICATIONS_CHANGED, exactNotificationTime, notificationHref, relativeNotificationTime,
  type HubNotification, type HubNotificationPage, type HubNotificationSummary,
} from "../lib/hub-notifications";
import { useBrowserNotifications } from "./BrowserNotificationsContext";
import "./NotificationBell.css";

const TOAST_WINDOW_MS = 30 * 60_000;
const DISMISSED_KEY = "xyz_hub_notice_toast_dismissed_v1";
const readDismissed = () => { try { return new Set<string>(JSON.parse(sessionStorage.getItem(DISMISSED_KEY) ?? "[]")); } catch { return new Set<string>(); } };
const saveDismissed = (keys: Set<string>) => { try { sessionStorage.setItem(DISMISSED_KEY, JSON.stringify([...keys].slice(-50))); } catch { /* per-tab convenience only */ } };

function KindIcon({ kind }: { kind: HubNotification["kind"] }) {
  const path = kind === "MENTION" ? "M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm4-4v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1"
    : kind === "ANNOUNCEMENT" ? "M4 10v4h3l6 4V6L7 10H4Zm13-1a4 4 0 0 1 0 6"
    : kind === "CORRECTION_REVIEW" || kind === "CORRECTION_DECIDED" ? "M7 3h7l5 5v13H7V3Zm7 0v5h5M10 14l2 2 4-4"
    : "M12 7v5l3 2M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Z";
  return <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d={path} /></svg>;
}

export default function NotificationBell() {
  const { user, access } = useAuth();
  const navigate = useNavigate();
  const browserAlerts = useBrowserNotifications();
  const offerDeviceNotices = browserAlerts?.offerHubNotices;
  const enabled = !!user && (import.meta.env.VITE_BLOCK2_CHAT_ENABLED === "true" || import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true");
  // Reset private state whenever the signed-in identity or effective access changes.
  const accessKey = `${user?.id}:${access?.permissions.join(",")}:${access?.assignedModelIds.join(",")}`;
  const [summary, setSummary] = useState<HubNotificationSummary | null>(null);
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [list, setList] = useState<HubNotificationPage | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(readDismissed);
  const [now, setNow] = useState(() => Date.now());
  const control = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const generation = useRef(0);
  const panelId = useId(), titleId = useId();

  const loadSummary = useCallback(async (signal?: AbortSignal) => {
    const started = generation.current;
    try {
      const next = await apiRequest<HubNotificationSummary>("/api/notifications/summary", { signal });
      if (started !== generation.current || signal?.aborted) return;
      setSummary(next); setNow(Date.now());
      if (next.available && offerDeviceNotices) void offerDeviceNotices(next.latest.filter((n) => !n.read && DEVICE_NOTICE_KINDS.has(n.kind)));
    } catch (e) {
      if (started !== generation.current || signal?.aborted) return;
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) { setSummary(null); setOpen(false); }
    }
  }, [offerDeviceNotices]);

  const loadList = useCallback(async (nextFilter: "all" | "unread", before?: string) => {
    const started = generation.current;
    if (before) setLoadingMore(true);
    try {
      const page = await apiRequest<HubNotificationPage>(`/api/notifications?filter=${nextFilter}${before ? `&before=${encodeURIComponent(before)}` : ""}`);
      if (started !== generation.current) return;
      setList((old) => before && old ? { ...page, items: [...old.items, ...page.items.filter((n) => !old.items.some((o) => o.key === n.key))] } : page);
      setSummary((old) => old ? { ...old, unreadCount: page.unreadCount } : old);
      setError(""); setNow(Date.now());
    } catch {
      if (started === generation.current) setError("Notifications couldn’t be loaded. Try again in a moment.");
    } finally { if (started === generation.current) setLoadingMore(false); }
  }, []);

  useEffect(() => {
    generation.current++;
    const reset = setTimeout(() => { setSummary(null); setList(null); setOpen(false); setError(""); }, 0);
    return () => clearTimeout(reset);
  }, [accessKey]);

  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const refresh = () => { if (document.visibilityState === "visible") void loadSummary(controller.signal); };
    const initial = setTimeout(refresh, 0);
    const interval = setInterval(refresh, 15_000);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("focus", refresh);
    window.addEventListener(HUB_NOTIFICATIONS_CHANGED, refresh);
    return () => {
      controller.abort(); clearTimeout(initial); clearInterval(interval);
      document.removeEventListener("visibilitychange", refresh); window.removeEventListener("focus", refresh); window.removeEventListener(HUB_NOTIFICATIONS_CHANGED, refresh);
    };
  }, [enabled, accessKey, loadSummary]);

  const close = useCallback((restoreFocus = true) => { setOpen(false); if (restoreFocus) trigger.current?.focus(); }, []);
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!control.current?.contains(event.target as Node)) close(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape); };
  }, [open, close]);

  function toggle() {
    if (open) { close(); return; }
    setList(null); setError(""); setOpen(true);
    void loadList(filter);
  }
  function chooseFilter(next: "all" | "unread") {
    if (next === filter) return;
    setFilter(next); setList(null); void loadList(next);
  }

  async function markRead(item: HubNotification) {
    if (item.read) return true;
    try {
      const result = await apiRequest<{ unreadCount: number }>("/api/notifications/read", { method: "POST", body: JSON.stringify({ key: item.key }) });
      setList((old) => old ? { ...old, unreadCount: result.unreadCount, items: old.items.map((n) => n.key === item.key ? { ...n, read: true } : n) } : old);
      setSummary((old) => old ? { ...old, unreadCount: result.unreadCount, latest: old.latest.filter((n) => n.key !== item.key) } : old);
      return true;
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) {
        setList((old) => old ? { ...old, items: old.items.filter((n) => n.key !== item.key) } : old);
        setError("That notification is no longer available.");
      }
      return false;
    }
  }
  async function openItem(item: HubNotification) {
    if (busy) return;
    setBusy(true);
    try {
      const href = notificationHref(item.target);
      const available = await markRead(item);
      if (href && available) { close(false); navigate(href); }
    } finally { setBusy(false); }
  }
  async function markAll() {
    if (busy) return;
    setBusy(true); setError("");
    try {
      const result = await apiRequest<{ unreadCount: number }>("/api/notifications/read-all", { method: "POST", body: "{}" });
      setSummary((old) => old ? { ...old, unreadCount: result.unreadCount, latest: [] } : old);
      await loadList(filter);
    } catch { setError("Notifications couldn’t be updated. Try again in a moment."); }
    finally { setBusy(false); }
  }
  function dismissToast(key: string) {
    setDismissed((old) => { const next = new Set(old); next.add(key); saveDismissed(next); return next; });
  }

  if (!enabled || !summary?.available) return null;
  const unread = summary.unreadCount;
  const toast = !open ? summary.latest.find((n) => !n.read && !dismissed.has(n.key) && now - new Date(n.occurredAt).getTime() < TOAST_WINDOW_MS) : undefined;
  const fresh = list?.items.filter((n) => !n.read) ?? [];
  const earlier = list?.items.filter((n) => n.read) ?? [];
  const row = (item: HubNotification) => {
    const href = notificationHref(item.target);
    const content = <>
      <span className="hub-notice-icon"><KindIcon kind={item.kind} /></span>
      <span className="hub-notice-text">
        <strong>{item.title}</strong>
        {item.body && <span className="hub-notice-body">{item.body}</span>}
        <span className="hub-notice-meta">{item.context} · <time dateTime={item.occurredAt} title={exactNotificationTime(item.occurredAt)}>{relativeNotificationTime(item.occurredAt, now)}</time></span>
      </span>
      {!item.read && <span className="hub-notice-unread" aria-label="Unread" role="img" />}
    </>;
    return <li key={item.key} className={item.read ? "is-read" : "is-unread"}>
      {href || !item.read
        ? <button type="button" className="hub-notice-row" disabled={busy} onClick={() => void openItem(item)}
          aria-label={`${item.read ? "" : "Unread: "}${item.title}. ${item.context}.${href ? " Opens the related page." : " Marks as read."}`}>{content}</button>
        : <div className="hub-notice-row">{content}</div>}
    </li>;
  };

  return <div className="hub-notifications" ref={control}>
    <button ref={trigger} type="button" className="hub-notifications-trigger" onClick={toggle} aria-haspopup="dialog" aria-expanded={open} aria-controls={open ? panelId : undefined}
      aria-label={`Notifications${unread ? `, ${unread} unread` : ""}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {!!unread && <span className="hub-notifications-count">{unread > 99 ? "99+" : unread}</span>}
    </button>
    {open && <section id={panelId} className="hub-notifications-panel" role="dialog" aria-labelledby={titleId}>
      <header>
        <h2 id={titleId}>Notifications</h2>
        <button type="button" className="hub-notifications-text-action" onClick={() => void markAll()} disabled={busy || !unread}>Mark all as read</button>
      </header>
      <div className="hub-notifications-filter" role="group" aria-label="Show notifications">
        <button type="button" aria-pressed={filter === "all"} onClick={() => chooseFilter("all")}>All</button>
        <button type="button" aria-pressed={filter === "unread"} onClick={() => chooseFilter("unread")}>Unread{unread ? ` (${unread > 99 ? "99+" : unread})` : ""}</button>
      </div>
      {error && <p className="hub-notifications-error" role="alert">! {error}</p>}
      {!list ? (!error && <p className="hub-notifications-status" role="status">Loading notifications…</p>) : !list.items.length ? (
        <div className="hub-notifications-empty">
          <h3>{filter === "unread" ? "You’re all caught up" : "No notifications yet"}</h3>
          <p>Mentions, announcements, attendance alerts and correction updates will appear here.</p>
        </div>
      ) : <>
        {!!fresh.length && <><h3 className="hub-notifications-group">New</h3><ul className="hub-notifications-list">{fresh.map(row)}</ul></>}
        {!!earlier.length && filter === "all" && <><h3 className="hub-notifications-group">Earlier</h3><ul className="hub-notifications-list">{earlier.map(row)}</ul></>}
        {list.nextBefore && <button type="button" className="hub-notifications-more" disabled={loadingMore} onClick={() => void loadList(filter, list.nextBefore!)}>
          {loadingMore ? "Loading…" : "See older notifications"}
        </button>}
      </>}
    </section>}
    {toast && <aside className="hub-notice-toast" aria-label="New notification">
      <div role="status"><span className="hub-notice-toast-eyebrow">NEW NOTIFICATION</span><strong>{toast.title}</strong>{toast.body && <p>{toast.body}</p>}</div>
      <div className="hub-notice-toast-actions">
        <button type="button" onClick={() => { dismissToast(toast.key); void openItem(toast); }}>{notificationHref(toast.target) ? "Open" : "Mark as read"}</button>
        <button type="button" onClick={() => dismissToast(toast.key)}>Dismiss</button>
      </div>
    </aside>}
  </div>;
}
