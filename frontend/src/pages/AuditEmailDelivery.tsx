import { formatCentralDateTime } from "../lib/time";
import { STATUS, type EmailDeliveryState } from "./useEmailDelivery";

/** Owner-only email delivery panel inside the Audit Log's Email delivery tab. */
export default function AuditEmailDelivery({ state }: { state: EmailDeliveryState }) {
  const { data, error, busy, resolve } = state;
  const state_ = data ? STATUS[data.status] : null;
  return <div className="audit-email-delivery">
    {error && <p className="audit-email-error" role="alert">{error}</p>}
    {!data ? (!error && <p className="audit-panel-note" role="status">Loading email delivery…</p>) : <>
      <div className={`audit-email-status${state_!.problem ? " is-problem" : ""}`} role="status">
        <strong>{state_!.title}</strong>
        <p>{state_!.detail}</p>
        {data.usage && <p>{data.usage.usedToday} of {data.usage.allowanceToday} emails used in the last 24 hours. Google allows about {data.usage.dailyLimit} a day; the rest is kept for sign-in codes.</p>}
      </div>
      <h3 className="audit-panel-label">Needs attention{data.attentionTotal ? ` · ${data.attentionTotal}` : ""}</h3>
      {!data.attention.length ? <p className="audit-panel-note">Nothing needs attention.</p> : <>
        <p className="audit-panel-note">Gmail didn’t confirm these emails. Check the person’s inbox first, so nobody gets the same email twice.{data.attentionTotal > data.attention.length ? ` Showing the ${data.attention.length} most recent.` : ""}</p>
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
      <p className="audit-panel-note">Every reminder email is also recorded in the Activity tab: who, when, how many unread and the outcome, with no message content.</p>
    </>}
  </div>;
}
