import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";
import { refreshHubNotifications } from "../lib/hub-notifications";
import { formatCentralDateTime } from "../lib/time";
import { useToast } from "../components/ToastProvider";

type Status = "OFF" | "PREVIEW" | "NOT_CONFIGURED" | "SENDING" | "NEAR_LIMIT" | "PAUSED_HOUR" | "PAUSED_TODAY";
type Usage = { usedToday: number; allowanceToday: number; dailyLimit: number; usedHour: number; allowanceHour: number };
type Attention = { type: "reminder" | "announcement"; id: string; personName: string; at: string; detail: string; title: string | null };
type Overview = { status: Status; usage: Usage | null; attention: Attention[]; attentionTotal: number };

// Problems lead with "!", per the XYZ web kit; normal states stay quiet.
const STATUS: Record<Status, { problem: boolean; title: string; detail: string }> = {
  OFF: { problem: false, title: "Chat emails are off", detail: "Unread reminders and announcement emails are not being sent." },
  PREVIEW: { problem: false, title: "Preview mode", detail: "Unread reminders and announcement emails are recorded but not sent." },
  NOT_CONFIGURED: { problem: true, title: "Chat emails are on, but no sending budget is set", detail: "Nothing is sent until the daily budget and the sign-in reserve are configured." },
  SENDING: { problem: false, title: "Sending normally", detail: "Unread reminders and announcement emails are going out." },
  NEAR_LIMIT: { problem: true, title: "Daily email limit nearly reached", detail: "Chat emails stop soon so sign-in codes keep arriving." },
  PAUSED_HOUR: { problem: true, title: "Chat emails paused for up to an hour", detail: "This hour's budget is used. Sign-in codes are still sent." },
  PAUSED_TODAY: { problem: true, title: "Chat emails paused until the daily limit resets", detail: "Sign-in codes are still sent." },
};

/** Owner-only: Chat email health on the Audit Log page. */
export default function AuditEmailDelivery() {
  const toast = useToast();
  const location = useLocation();
  const section = useRef<HTMLElement>(null), request = useRef<AbortController | null>(null);
  const [data, setData] = useState<Overview | null>(null);
  const [hidden, setHidden] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const load = useCallback(async () => {
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    try {
      const result = await apiRequest<Overview>("/api/chat/email-delivery", { signal: controller.signal });
      if (!controller.signal.aborted) { setData(result); setError(""); }
    } catch (cause) {
      if (controller.signal.aborted) return;
      // Chat switched off (404) or no Owner access (403): nothing to show.
      if (cause instanceof ApiError && [403, 404].includes(cause.status)) setHidden(true);
      else setError("Email delivery status couldn’t be loaded. Try again in a moment.");
    }
  }, []);
  useEffect(() => {
    const initial = window.setTimeout(() => void load(), 0);
    return () => { window.clearTimeout(initial); request.current?.abort(); };
  }, [load]);
  // Bell notices link to #email-delivery. Scroll and move focus once per
  // visit (each bell click is a new history entry), not on every refresh.
  const scrolledFor = useRef<string | null>(null);
  useEffect(() => {
    if (!data || location.hash !== "#email-delivery" || scrolledFor.current === location.key) return;
    scrolledFor.current = location.key;
    section.current?.scrollIntoView({ block: "start" });
    section.current?.focus({ preventScroll: true });
  }, [data, location.hash, location.key]);

  async function resolve(item: Attention) {
    if (busy) return;
    setBusy(item.id);
    try {
      await apiRequest("/api/chat/email-delivery/resolve", { method: "POST", body: JSON.stringify({ type: item.type, id: item.id }) });
      toast.success(item.type === "reminder" ? `Reminders resumed for ${item.personName}.` : "Marked as handled.");
      refreshHubNotifications();
      await load();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That delivery couldn’t be updated.");
      // Another Owner may already have handled it: show the current list.
      await load();
    } finally { setBusy(null); }
  }

  if (hidden) return null;
  const state = data ? STATUS[data.status] : null;
  return <section ref={section} id="email-delivery" className="content-card audit-email-delivery" aria-labelledby="audit-email-title" tabIndex={-1}>
    <div className="audit-email-heading">
      <h3 id="audit-email-title">Email delivery</h3>
      <button type="button" className="secondary-button" onClick={() => void load()} disabled={!!busy}>Refresh</button>
    </div>
    {error && <p className="audit-email-error" role="alert">! {error}</p>}
    {!data ? (!error && <p role="status">Loading email delivery…</p>) : <>
      <div className={`audit-email-status${state!.problem ? " is-problem" : ""}`} role="status">
        <strong>{state!.problem ? "! " : ""}{state!.title}</strong>
        <p>{state!.detail}</p>
        {data.usage && <p>{data.usage.usedToday} of {data.usage.allowanceToday} emails used in the last 24 hours. Google allows about {data.usage.dailyLimit} a day; the rest is kept for sign-in codes.</p>}
      </div>
      <h4>Needs attention{data.attentionTotal ? ` · ${data.attentionTotal}` : ""}</h4>
      {!data.attention.length ? <p className="audit-email-quiet">Nothing needs attention.</p> : <>
        <p className="audit-email-quiet">Gmail didn’t confirm these emails. Check the person’s inbox first, so nobody gets the same email twice.{data.attentionTotal > data.attention.length ? ` Showing the ${data.attention.length} most recent.` : ""}</p>
        <ul className="audit-email-attention">{data.attention.map((item) => <li key={item.type + item.id}>
          <div>
            <strong>{item.personName} · {item.type === "reminder" ? "reminders paused" : "announcement email unconfirmed"}</strong>
            {item.title && <span>“{item.title}”</span>}
            <span>{formatCentralDateTime(item.at)}</span>
          </div>
          <button type="button" className="secondary-button" disabled={!!busy} onClick={() => void resolve(item)}>
            {busy === item.id ? "Saving…" : item.type === "reminder" ? "Resume reminders" : "Mark handled"}
          </button>
        </li>)}</ul>
      </>}
      <p className="audit-email-quiet">Every reminder email is also recorded in the Audit Log below: who, when, how many unread and the outcome, with no message content.</p>
    </>}
  </section>;
}
