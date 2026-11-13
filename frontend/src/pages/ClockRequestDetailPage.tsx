import { useCallback, useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { apiRequest } from "../lib/api";
import { useToast } from "../components/ToastProvider";
import { formatCorrectionTime } from "../lib/clock-correction-time";
import { Comparison, DecisionForm, type ClockCorrectionItem } from "../components/ClockCorrections";
import "./ClockPage.css";
import "./ClockRequestDetailPage.css";

type Response = {
  request: ClockCorrectionItem;
  scope: "mine" | "review";
  canReviewCorrections: boolean;
};
type Decision = "APPROVED" | "REJECTED" | "CANCELLED";

const statuses: Record<ClockCorrectionItem["status"], string> = {
  PENDING: "Awaiting review",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

function formatMaybe(value: string | null | undefined) {
  return value ? formatCorrectionTime(value) : "Not recorded";
}

export default function ClockRequestDetailPage() {
  const { requestId } = useParams<{ requestId: string }>();
  const navigate = useNavigate();
  const toast = useToast();
  const [data, setData] = useState<Response | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [decision, setDecision] = useState<Decision | null>(null);


  const load = useCallback(async (signal?: AbortSignal) => {
    if (!requestId) {
      setData(null);
      setError("No correction request was selected.");
      setLoading(false);
      return;
    }
    try {
      const response = await apiRequest<Response>(`/api/clock/corrections/${encodeURIComponent(requestId)}`, { signal });
      if (signal?.aborted) return;
      setData(response);
      setError("");
    } catch (cause) {
      if (signal?.aborted) return;
      setData(null);
      setError(cause instanceof Error ? cause.message : "Unable to load this request.");
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, [requestId]);

  useEffect(() => {
    const controller = new AbortController();
    // Queue the route transition reset outside the synchronous effect body;
    // this also prevents stale requests from flashing during navigation.
    const initial = window.setTimeout(() => {
      setLoading(true);
      setData(null);
      setDecision(null);
  
      void load(controller.signal);
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
    };
  }, [load]);

  const item = data?.request;
  const returnPath = `/clock?tab=${data?.scope === "review" ? "review" : "requests"}`;

  async function saveDecision(note: string) {
    if (!item || !decision) return;
    await apiRequest(`/api/clock/corrections/${encodeURIComponent(item.id)}/${decision === "CANCELLED" ? "cancel" : "review"}`, {
      method: "POST",
      body: JSON.stringify(decision === "CANCELLED" ? {} : { decision, note }),
    });
    setDecision(null);
    toast.success(decision === "APPROVED"
      ? "Correction approved. Recorded hours have been updated."
      : decision === "REJECTED"
        ? "Request rejected. Recorded hours remain unchanged."
        : "Request cancelled. Recorded hours remain unchanged.");
    window.dispatchEvent(new Event("xyz-clock-corrections-changed"));
    await load();
  }

  return <section className="clock-page clock-request-page" aria-labelledby="clock-request-title">
    <header className="clock-page-heading">
      <div>
        <p className="clock-eyebrow">CLOCK &amp; HOURS / REQUEST DETAILS</p>
        <h1 id="clock-request-title">{item?.kind === "MISSING_SHIFT" ? "Missed shift request" : "Time correction request"}</h1>
        <p>Review the requested changes and the complete request record.</p>
      </div>
      <button type="button" onClick={() => navigate(returnPath)}>Back to {data?.scope === "review" ? "Review requests" : "My requests"}</button>
    </header>
    {loading && <div className="clock-load-panel" role="status" aria-live="polite"><span className="clock-load-spinner" aria-hidden="true" />Loading correction request…</div>}
    {error && <div className="clock-error" role="alert">{error} <Link to="/clock?tab=requests">Back to Clock &amp; Hours</Link></div>}
    {item && data && <article className="clock-request-detail-card">
      <header className="clock-request-detail-header">
        <div>
          <p className="clock-label">{data.scope === "mine" ? "YOUR REQUEST" : "REQUEST TO REVIEW"}</p>
          {data.scope === "review" && <h2>{item.personName}</h2>}
          <p>{item.kind === "MISSING_SHIFT" ? "Missed shift" : "Time correction"} · Submitted {formatCorrectionTime(item.submittedAt)}</p>
        </div>
        <span className="clock-status">{statuses[item.status]}</span>
      </header>

      <div className="clock-request-metadata">
        <div>
          <span>{data.scope === "review" ? "Your review responsibility" : "Who reviews this?"}</span>
          <strong>{data.scope === "review"
            ? "You can review this request under your current access permissions."
            : item.route === "Owner review"
              ? "An Owner will review your request."
              : item.route === "Ops or Owner review"
                ? "An Ops Manager or Owner will review your request."
                : "Your assigned Manager or an Owner will review your request."}</strong>
        </div>
        <div><span>Request status</span><strong>{statuses[item.status]}</strong></div>
      </div>

      <Comparison before={item.before} proposed={item.proposed} />
      <section className="clock-request-reason" aria-labelledby="request-reason-title">
        <h3 id="request-reason-title">{data.scope === "mine" ? "Your reason" : "Employee’s reason"}</h3>
        <p>{item.reason}</p>
      </section>
      <section className="clock-request-full-record" aria-labelledby="full-correction-record-title">
        <h3 id="full-correction-record-title">Full recorded and requested times</h3>
        <div className="clock-table-scroll" role="region" aria-label="Full correction snapshot" tabIndex={0}>
          <table className="clock-data-table">
            <thead><tr><th scope="col">Field</th><th scope="col">Recorded</th><th scope="col">Requested</th></tr></thead>
            <tbody>
              <tr><th scope="row">Clock in</th><td>{formatMaybe(item.before?.startedAt)}</td><td>{formatMaybe(item.proposed.startedAt)}</td></tr>
              <tr><th scope="row">Clock out</th><td>{formatMaybe(item.before?.endedAt)}</td><td>{formatMaybe(item.proposed.endedAt)}</td></tr>
              {(["SHORT_ONE", "SHORT_TWO", "MEAL"] as const).map(kind => {
                const oldPause = item.before?.breaks.find(pause => pause.kind === kind);
                const newPause = item.proposed.breaks.find(pause => pause.kind === kind);
                if (!oldPause && !newPause) return null;
                const label = kind === "MEAL" ? "Meal" : kind === "SHORT_ONE" ? "Short break 1" : "Short break 2";
                return [
                  <tr key={`${kind}-start`}><th scope="row">{label} start</th><td>{formatMaybe(oldPause?.startedAt)}</td><td>{formatMaybe(newPause?.startedAt)}</td></tr>,
                  <tr key={`${kind}-end`}><th scope="row">{label} end</th><td>{formatMaybe(oldPause?.endedAt)}</td><td>{formatMaybe(newPause?.endedAt)}</td></tr>,
                ];
              })}
            </tbody>
          </table>
        </div>
      </section>

      {item.stale && <div className="correction-hint" role="status">
        This request is outdated because the recorded shift changed. Cancel and submit a new correction; approval is unavailable.
      </div>}
      {!item.subjectAvailable && <div className="correction-hint" role="status">This account was deleted. History is retained but approval is unavailable.</div>}
      {item.reviewedAt && <section className="clock-request-review" aria-label="Decision history">
        <h3>{item.status === "CANCELLED" ? "Cancellation" : "Review decision"}</h3>
        <p><strong>{item.reviewerName ?? "Reviewer"}</strong> · {formatCorrectionTime(item.reviewedAt)}</p>
        <p>{item.reviewNote}</p>
      </section>}
      {item.status === "PENDING" && <div className="correction-card-actions">
        {data.scope === "mine"
          ? <button type="button" onClick={() => setDecision("CANCELLED")}>Cancel my request</button>
          : data.canReviewCorrections && <>
            <button type="button" onClick={() => setDecision("REJECTED")}>Reject request</button>
            <button type="button" className="clock-primary" disabled={item.stale || !item.subjectAvailable}
              onClick={() => setDecision("APPROVED")}>Review and approve</button>
          </>}
      </div>}
    </article>}
    {item && decision && <DecisionForm item={item} decision={decision} own={data?.scope === "mine"}
      onClose={() => setDecision(null)} onSave={saveDecision} />}
  </section>;
}
