import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { hasPortalPermission } from "../auth/portalAccess";
import { ApiError, apiRequest } from "../lib/api";
import { CENTRAL_TIME_ZONE } from "../lib/time";
import "./ClockAlerts.css";

type Alert = { id: string; kind: string; personName: string; own: boolean; title: string; message: string; occurredAt: string; recordedAt: string; status: string; readAt: string | null };
type Inbox = { alerts: Alert[]; unreadCount: number; canReviewStaff: boolean; hasMore: boolean; nextBefore: string | null };
const time = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(value));

export default function ClockAlerts() {
  const { user, access } = useAuth();
  const eligible = import.meta.env.VITE_BLOCK2_CLOCK_ENABLED === "true" && ["clock.self.view", "clock.alerts.team", "clock.alerts.all"].some((p) => hasPortalPermission(access, p));
  // Reset private state when the signed-in identity or effective access changes.
  const accessKey = `${user?.id}:${access?.permissions.join(",")}:${access?.assignedModelIds.join(",")}`;
  const [inbox, setInbox] = useState<Inbox | null>(null);
  const [latest, setLatest] = useState<Alert | null>(null);
  const [hiddenToast, setHiddenToast] = useState("");
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState<"unread" | "all">("unread");
  const [before, setBefore] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);
  const revision = useRef(0);
  const refreshId = useRef(0);
  const latestLoad = useRef<() => Promise<void>>(async () => {});
  const load = useCallback(async (signal?: AbortSignal) => {
    const request = ++refreshId.current;
    const generation = revision.current;
    try {
      // The unread snapshot also supplies the global badge when browsing history.
      const unseen = await apiRequest<Inbox>("/api/clock/alerts", { signal });
      const page = open && (filter !== "unread" || before)
        ? await apiRequest<Inbox>(`/api/clock/alerts?filter=${filter}${before ? `&before=${encodeURIComponent(before)}` : ""}`, { signal }) : unseen;
      if (generation !== revision.current || request !== refreshId.current || signal?.aborted) return;
      setInbox({ ...page, unreadCount: unseen.unreadCount });
      setLatest(unseen.alerts.find((a) => a.own && a.status === "Still open") ?? unseen.alerts[0] ?? null);
      setError("");
    } catch (e) {
      if (generation !== revision.current || request !== refreshId.current || signal?.aborted) return;
      if (e instanceof ApiError && [401, 403, 404].includes(e.status)) { setInbox(null); setLatest(null); setOpen(false); }
      else { setInbox(null); setLatest(null); setError("Alerts could not be refreshed. Your attendance continues to be recorded."); }
    }
  }, [open, filter, before]);
  useEffect(() => { latestLoad.current = load; }, [load]);
  const invalidate = useCallback(() => { revision.current++; }, []);
  useEffect(() => {
    invalidate();
    const reset = setTimeout(() => { setInbox(null); setLatest(null); setOpen(false); setBefore(null); setHiddenToast(""); setError(""); setBusyId(null); }, 0);
    return () => { clearTimeout(reset); invalidate(); };
  }, [accessKey, invalidate]);
  useEffect(() => {
    if (!eligible) return;
    const controller = new AbortController();
    const read = () => { if (document.visibilityState === "visible") void load(controller.signal); };
    const initial = setTimeout(read, 0);
    const interval = setInterval(read, 15_000);
    document.addEventListener("visibilitychange", read);
    window.addEventListener("focus", read);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(interval); document.removeEventListener("visibilitychange", read); window.removeEventListener("focus", read); };
  }, [eligible, accessKey, load]);
  useEffect(() => {
    if (open) {
      const panel = dialog.current;
      if (panel && !panel.open) panel.showModal();
      panel?.scrollTo({ top: 0 });
    } else dialog.current?.close();
  }, [open, filter, before]);
  function show() { setFilter("unread"); setBefore(null); setOpen(true); }
  async function markRead(id: string) {
    if (busyId) return;
    const generation = revision.current;
    setBusyId(id); refreshId.current++;
    try {
      await apiRequest(`/api/clock/alerts/${encodeURIComponent(id)}/read`, { method: "POST", body: "{}" });
      if (generation !== revision.current) return;
      setHiddenToast(id);
      await latestLoad.current();
    } catch (e) {
      if (generation === revision.current) {
        if (e instanceof ApiError && [401, 403, 404].includes(e.status)) { setInbox(null); setLatest(null); }
        setError("This alert could not be updated. Refresh to check your current access.");
      }
    } finally { if (generation === revision.current) setBusyId(null); }
  }
  if (!eligible) return null;
  return <div className="clock-alerts-control">
    <button type="button" className="clock-alerts-trigger" onClick={show} aria-haspopup="dialog" aria-label={`Attendance alerts${inbox?.unreadCount ? `, ${inbox.unreadCount} unread` : ""}`}>
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" /></svg>
      {!!inbox?.unreadCount && <span>{inbox.unreadCount > 99 ? "99+" : inbox.unreadCount}</span>}
    </button>
    {!open && latest && latest.id !== hiddenToast && <aside className="clock-alert-toast" aria-label="New attendance alert">
      <div role="status"><strong>{latest.own ? latest.title : `${latest.personName}: ${latest.title}`}</strong><p>{latest.message}</p></div>
      <div><button type="button" onClick={show}>View alerts</button><button type="button" onClick={() => setHiddenToast(latest.id)}>Dismiss notice</button></div>
    </aside>}
    <dialog ref={dialog} className="clock-alerts-dialog" aria-labelledby="attendance-alert-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <header><div><p className="clock-alert-eyebrow">ATTENDANCE</p><h2 id="attendance-alert-title">Your alerts</h2></div><button type="button" onClick={() => setOpen(false)} aria-label="Close attendance alerts">Close</button></header>
      <div className="clock-alert-toolbar"><div role="group" aria-label="Filter attendance alerts"><button type="button" aria-pressed={filter === "unread"} onClick={() => { setFilter("unread"); setBefore(null); }}>Unread{inbox ? ` (${inbox.unreadCount})` : ""}</button><button type="button" aria-pressed={filter === "all"} onClick={() => { setFilter("all"); setBefore(null); }}>All alerts</button></div><button type="button" onClick={() => void load()}>Refresh</button></div>
      {error && <p className="clock-alert-error" role="alert">! {error}</p>}
      {!inbox ? <p role="status">{error ? "No alert details are shown until the connection is restored." : "Loading your alerts…"}</p> : <>
        {!inbox.alerts.length ? <div className="clock-alert-empty"><h3>{filter === "unread" ? "You’re caught up" : "No alerts yet"}</h3><p>Break reminders and attendance flags will appear here when needed.</p></div> : <ul className="clock-alert-list">{inbox.alerts.map((alert) => <li key={alert.id}>
          <div className="clock-alert-row"><span className="clock-alert-person">{alert.personName}</span><span className="clock-alert-status">{alert.status}</span></div><h3>{alert.title}</h3><p>{alert.message}</p><time dateTime={alert.occurredAt}>{time(alert.occurredAt)}</time>
          {!alert.readAt && <button type="button" disabled={!!busyId || !!error} onClick={() => void markRead(alert.id)}>{busyId === alert.id ? "Saving…" : "Mark as read"}</button>}
        </li>)}</ul>}
        <div className="clock-alert-pagination">{before && <button type="button" onClick={() => setBefore(null)}>Latest alerts</button>}{inbox.hasMore && <button type="button" onClick={() => setBefore(inbox.nextBefore)}>Older alerts</button>}</div>
      </>}
      {hasPortalPermission(access, "clock.self.view") && <Link className="clock-alert-link" to="/clock" onClick={() => setOpen(false)}>Open Clock &amp; Hours →</Link>}
    </dialog>
  </div>;
}
