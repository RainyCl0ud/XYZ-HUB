import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { centralInputValue, centralTimeCandidates, formatCorrectionTime } from "../lib/clock-correction-time";
import "./ClockCorrections.css";

type Kind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";
const labels: Record<Kind, string> = { SHORT_ONE: "Short break 1", SHORT_TWO: "Short break 2", MEAL: "Meal break" };
type Times = { startedAt: string; endedAt: string | null };
type Snapshot = Times & { breaks: (Times & { kind: Kind })[] };
export type CorrectionShift = Snapshot & { id: string; recordVersion: string };
type Item = { id: string; personName: string; kind: "SHIFT_TIMES" | "MISSING_SHIFT"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reason: string; before: Snapshot | null; proposed: Snapshot; submittedAt: string; reviewerName: string | null; reviewNote: string | null; reviewedAt: string | null; stale: boolean; subjectAvailable: boolean; route: string };
type Inbox = { serverNow: string; requests: Item[]; hasMore: boolean; nextBefore: string | null; ownPendingCount: number; reviewPendingCount: number; canRequestCorrections: boolean; canReviewCorrections: boolean };
type TimeValue = { wall: string; instant: string };
const initialTime = (instant: string | null): TimeValue => ({ wall: instant ? centralInputValue(instant) : "", instant: instant ?? "" });
const errorText = (e: unknown) => e instanceof Error ? e.message : "Unable to update corrections. Please try again.";
const statusLabels = { PENDING: "Awaiting review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };

function TimeField({ label, value, onChange, disabled }: { label: string; value: TimeValue; onChange: (value: TimeValue) => void; disabled: boolean }) {
  const id = useId();
  const candidates = centralTimeCandidates(value.wall);
  return <div className="correction-time"><label htmlFor={id}>{label} <span>US Central</span></label>
    <input id={id} type="datetime-local" step="1" required disabled={disabled} value={value.wall} aria-describedby={candidates.length === 0 && value.wall ? `${id}-help` : undefined}
      onChange={(e) => { const wall = e.target.value; const options = centralTimeCandidates(wall); onChange({ wall, instant: options.length === 1 ? options[0] : "" }); }} />
    {value.wall && candidates.length === 0 && <p id={`${id}-help`} className="correction-field-error">! This is not a valid Central time. During spring daylight saving, some times do not exist.</p>}
    {candidates.length > 1 && <><label htmlFor={`${id}-occurrence`}>This time occurs twice. Choose which one.</label><select id={`${id}-occurrence`} required disabled={disabled} value={value.instant} onChange={(e) => onChange({ ...value, instant: e.target.value })}><option value="">Choose CDT or CST</option>{candidates.map((instant) => <option key={instant} value={instant}>{formatCorrectionTime(instant)}</option>)}</select></>}
  </div>;
}
type CorrectionChange = {
  key: string;
  label: string;
  recorded: string;
  requested: string;
};

function sameCorrectionInstant(recorded: string | null, proposed: string | null): boolean {
  if (recorded === proposed) return true;
  if (!recorded || !proposed) return false;
  const oldTime = Date.parse(recorded);
  const newTime = Date.parse(proposed);
  return Number.isFinite(oldTime) && Number.isFinite(newTime) && oldTime === newTime;
}

function getRequestedChanges(before: Snapshot | null, proposed: Snapshot): CorrectionChange[] {
  const changes: CorrectionChange[] = [];
  const appendIfChanged = (
    key: string,
    label: string,
    recorded: string | null,
    requested: string | null,
  ) => {
    if (before && sameCorrectionInstant(recorded, requested)) return;
    changes.push({
      key,
      label,
      recorded: recorded ? formatCorrectionTime(recorded) : "Not recorded",
      requested: requested ? formatCorrectionTime(requested) : "Not provided",
    });
  };

  appendIfChanged("shift-start", "Clock in", before?.startedAt ?? null, proposed.startedAt);
  appendIfChanged("shift-end", "Clock out", before?.endedAt ?? null, proposed.endedAt);

  for (const pause of proposed.breaks) {
    const recordedPause = before?.breaks.find((item) => item.kind === pause.kind);
    appendIfChanged(
      `${pause.kind}-start`,
      `${labels[pause.kind]} — start`,
      recordedPause?.startedAt ?? null,
      pause.startedAt,
    );
    appendIfChanged(
      `${pause.kind}-end`,
      `${labels[pause.kind]} — end`,
      recordedPause?.endedAt ?? null,
      pause.endedAt,
    );
  }

  return changes;
}

function Comparison({ before, proposed }: { before: Snapshot | null; proposed: Snapshot }) {
  const changes = getRequestedChanges(before, proposed);

  return (
    <section className="correction-comparison" aria-label="Requested time changes">
      <p className="clock-label">REQUESTED CHANGES</p>
      {!before && <p className="correction-new-shift">New shift — no existing recorded shift.</p>}
      {changes.length === 0 ? (
        <p className="correction-no-changes">No time changes requested.</p>
      ) : (
        <dl className="correction-change-list">
          {changes.map((change) => (
            <div className="correction-change-row" key={change.key}>
              <dt>{change.label}</dt>
              <dd><span>Recorded</span><strong>{change.recorded}</strong></dd>
              <dd><span>Requested</span><strong>{change.requested}</strong></dd>
            </div>
          ))}
        </dl>
      )}
    </section>
  );
}
function RequestForm({ shift, onClose, onSaved }: { shift: CorrectionShift | null; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(() => initialTime(shift?.startedAt ?? null));
  const [end, setEnd] = useState(() => initialTime(shift?.endedAt ?? null));
  const [breaks, setBreaks] = useState(() => (shift?.breaks ?? []).map((b) => ({ kind: b.kind, start: initialTime(b.startedAt), end: initialTime(b.endedAt), recorded: true })));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writing = useRef(false);
  const pending = useRef<{ key: string; requestId: string } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (writing.current) return;
    if (![start, end, ...breaks.flatMap((b) => [b.start, b.end])].every((v) => v.instant && centralTimeCandidates(v.wall).includes(v.instant))) { setError("Choose a valid Central time for every field, including the CDT/CST occurrence where requested."); return; }
    const payload = { ...(shift ? { shiftId: shift.id, expectedVersion: shift.recordVersion } : {}), reason: reason.trim(), proposed: { startedAt: start.instant, endedAt: end.instant, breaks: breaks.map((b) => ({ kind: b.kind, startedAt: b.start.instant, endedAt: b.end.instant })) } };
    const key = JSON.stringify(payload);
    if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() };
    writing.current = true; setBusy(true); setError("");
    try { await apiRequest("/api/clock/corrections", { method: "POST", body: JSON.stringify({ ...payload, requestId: pending.current!.requestId }) }); onSaved(); }
    catch (e) { setError(errorText(e)); }
    finally { writing.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="clock-dialog correction-dialog" aria-labelledby="correction-request-title" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}><form onSubmit={(e) => void submit(e)}>
    <h2 id="correction-request-title">{shift ? "Request a time correction" : "Request a missed shift"}</h2><p>Enter the actual times and explain what happened. Your recorded hours stay unchanged until someone else approves.</p>
    {shift && !shift.endedAt && <p className="correction-hint">This shift is still open. Enter when you actually finished. You can still clock out normally, but doing so changes the record and this request will need to be resubmitted.</p>}
    {error && <div className="clock-error" role="alert">! {error}</div>}
    <div className="correction-time-grid"><TimeField label="Clocked in" value={start} onChange={setStart} disabled={busy} /><TimeField label="Clocked out" value={end} onChange={setEnd} disabled={busy} /></div>
    <fieldset disabled={busy}><legend>Paid breaks</legend><p>All breaks stay included in worked hours. Keep recorded breaks; correct an accidental break to zero duration rather than erasing its history.</p>
      {breaks.map((pause, index) => <div className="correction-break" key={pause.kind}><div className="correction-break-heading"><strong>{labels[pause.kind]}</strong>{!pause.recorded && <button type="button" onClick={() => setBreaks((old) => old.filter((b) => b.kind !== pause.kind))}>Remove added break</button>}</div><div className="correction-time-grid"><TimeField label={`${labels[pause.kind]} started`} value={pause.start} disabled={busy} onChange={(start) => setBreaks((old) => old.map((b, i) => i === index ? { ...b, start } : b))} /><TimeField label={`${labels[pause.kind]} ended`} value={pause.end} disabled={busy} onChange={(end) => setBreaks((old) => old.map((b, i) => i === index ? { ...b, end } : b))} /></div></div>)}
      <div className="correction-add-breaks">{(Object.keys(labels) as Kind[]).filter((kind) => !breaks.some((b) => b.kind === kind)).map((kind) => <button key={kind} type="button" onClick={() => setBreaks((old) => [...old, { kind, start: initialTime(null), end: initialTime(null), recorded: false }])}>Add missed {labels[kind].toLowerCase()}</button>)}</div>
    </fieldset>
    <label className="correction-reason">Reason for the correction<textarea required maxLength={2000} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the missed or incorrect time." /></label>
    <div className="correction-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Keep recorded times</button><button type="submit" className="clock-primary" disabled={busy || !reason.trim()}>{busy ? "Submitting…" : "Submit for approval"}</button></div>
  </form></dialog>;
}
function DecisionForm({ item, decision, onClose, onSave }: { item: Item; decision: "APPROVED" | "REJECTED" | "CANCELLED"; onClose: () => void; onSave: (note: string) => Promise<void> }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const writing = useRef(false);
  useEffect(() => { dialog.current?.showModal(); }, []);
  const action = decision === "APPROVED" ? "Approve correction" : decision === "REJECTED" ? "Reject request" : "Cancel request";
  async function submit(e: FormEvent) { e.preventDefault(); if (writing.current) return; writing.current = true; setBusy(true); setError(""); try { await onSave(note.trim()); } catch (e) { setError(errorText(e)); } finally { writing.current = false; setBusy(false); } }
  return <dialog ref={dialog} className="clock-dialog correction-dialog" aria-labelledby="correction-decision-title" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}><form onSubmit={(e) => void submit(e)}><h2 id="correction-decision-title">{action} — {item.personName}</h2><p>{decision === "APPROVED" ? "Approval applies the requested times and recalculates the person's day and week totals. The original record stays in the correction history." : "Recorded hours will stay unchanged."}</p><Comparison before={item.before} proposed={item.proposed} /><p className="correction-quoted-reason">Requester's reason: {item.reason}</p>{error && <div className="clock-error" role="alert">! {error}</div>}{decision !== "CANCELLED" && <label className="correction-reason">{decision === "APPROVED" ? "Approval note" : "Reason for rejection"}<textarea required maxLength={2000} disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} /></label>}<div className="correction-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Go back</button><button type="submit" className="clock-primary" disabled={busy || (decision !== "CANCELLED" && !note.trim())}>{busy ? "Saving…" : action}</button></div></form></dialog>;
}
export default function ClockCorrections({ canRequest, canReview, canAddMissing, shifts, disabled, onChanged }: { canRequest: boolean; canReview: boolean; canAddMissing: boolean; shifts: CorrectionShift[]; disabled: boolean; onChanged: () => void }) {
  const [data, setData] = useState<Inbox | null>(null); const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const [scope, setScope] = useState<"mine" | "review">("mine"); const [filter, setFilter] = useState<"all" | "pending">("all");
  const [cursor, setCursor] = useState<string | undefined>(); const [trail, setTrail] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState(""); const [form, setForm] = useState<{ shift: CorrectionShift | null } | null>(null);
  const [decision, setDecision] = useState<{ item: Item; decision: "APPROVED" | "REJECTED" | "CANCELLED" } | null>(null);
  const sequence = useRef(0);
  const read = useCallback(async (signal?: AbortSignal) => {
    const generation = ++sequence.current;
    try { const next = await apiRequest<Inbox>(`/api/clock/corrections?scope=${scope}&filter=${filter}${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`, { signal }); if (generation === sequence.current && !signal?.aborted) { setData(next); setError(""); } }
    catch (e) { if (generation === sequence.current && !signal?.aborted) { setData(null); setError(errorText(e)); } }
  }, [scope, filter, cursor]);
  useEffect(() => { const controller = new AbortController(); const timer = setTimeout(() => void read(controller.signal), 0); const poll = setInterval(() => { if (document.visibilityState === "visible") void read(controller.signal); }, 10000); return () => { controller.abort(); clearTimeout(timer); clearInterval(poll); }; }, [read]);
  function select(next: "mine" | "review") { sequence.current++; setScope(next); setFilter(next === "review" ? "pending" : "all"); setCursor(undefined); setTrail([]); setData(null); setError(""); }
  const connected = !!data && !error && !disabled;
  const decisionItem = decision ? data?.requests.find((item) => item.id === decision.item.id && item.status === "PENDING") : undefined;
  const actualShift = shifts.find((s) => s.id === selectedShift) ?? shifts[0];
  function saved(message: string) { sequence.current++; setForm(null); setDecision(null); setNotice(message); onChanged(); void read(); }
  return <section className="clock-corrections" aria-labelledby="clock-corrections-title"><header><div><h2 id="clock-corrections-title">Time corrections</h2><p>Request a change, follow its status and keep the original record. Nobody approves their own hours.</p></div></header>
    {notice && <div className="clock-notice" role="status">{notice}</div>}
    {canRequest && <div className="correction-start"><div><label htmlFor="correction-recorded-shift">Recorded shift</label><select id="correction-recorded-shift" value={actualShift?.id ?? ""} disabled={!connected || !shifts.length} onChange={(e) => setSelectedShift(e.target.value)}>{!shifts.length && <option value="">No recorded shifts yet</option>}{shifts.map((s) => <option key={s.id} value={s.id}>{formatCorrectionTime(s.startedAt)}{s.endedAt ? "" : " · Still open"}</option>)}</select><p>Load earlier shifts above if the shift you need is not listed.</p></div><button type="button" disabled={!connected || !actualShift} onClick={() => setForm({ shift: actualShift })}>Correct recorded shift</button>{canAddMissing && <button type="button" disabled={!connected} onClick={() => setForm({ shift: null })}>Request missed shift</button>}</div>}
    <div className="correction-controls"><div className="correction-tabs" role="group" aria-label="Correction lists"><button type="button" aria-pressed={scope === "mine"} onClick={() => select("mine")}>My requests{data ? ` (${data.ownPendingCount} pending)` : ""}</button>{canReview && <button type="button" aria-pressed={scope === "review"} onClick={() => select("review")}>Review requests{data ? ` (${data.reviewPendingCount} pending)` : ""}</button>}</div><label>Show<select value={filter} onChange={(e) => { sequence.current++; setFilter(e.target.value as "all" | "pending"); setCursor(undefined); setTrail([]); setData(null); }}><option value="all">All statuses</option><option value="pending">Awaiting review</option></select></label><button type="button" onClick={() => void read()}>Refresh list</button></div>
    {scope === "review" && <p className="correction-hint">This queue shows only requests you can currently review. Access follows current roles and creator assignments. Your own requests stay under My requests.</p>}
    {error && <div className="clock-error" role="alert">! {error}</div>}
    {!data && !error && <p role="status">Loading correction requests…</p>}
    {data && !data.requests.length && <div className="clock-empty"><h3>{scope === "review" ? "No requests to review" : "No correction requests"}</h3><p>{scope === "review" ? "Eligible requests will appear here when staff submit them." : "Your requests and approval history will appear here."}</p></div>}
    {data?.requests.map((item) => <article className="correction-card" key={item.id}><header><div><h3>{scope === "mine" ? item.kind === "MISSING_SHIFT" ? "Missed shift" : "Time correction" : item.personName}</h3><p>Submitted {formatCorrectionTime(item.submittedAt)} · {item.route}</p></div><span className="clock-status">{statusLabels[item.status]}</span></header><Comparison before={item.before} proposed={item.proposed} /><p className="correction-quoted-reason"><strong>Reason:</strong> {item.reason}</p>
      {item.stale && <div className="correction-hint">! The recorded shift changed after this request. {scope === "mine" ? "Cancel this request, refresh your hours and submit a new correction." : "Ask the person to cancel and resubmit. Approval is paused to protect the newer record."}</div>}
      {!item.subjectAvailable && <p className="correction-hint">This account was deleted. History is retained; approval is unavailable.</p>}
      {item.reviewedAt && <p className="correction-review-note"><strong>{item.status === "CANCELLED" ? "Cancelled" : "Reviewed"} by {item.reviewerName}</strong> · {formatCorrectionTime(item.reviewedAt)}<span>{item.reviewNote}</span></p>}
      {item.status === "PENDING" && <div className="correction-card-actions">{scope === "mine" ? <button type="button" disabled={!connected} onClick={() => setDecision({ item, decision: "CANCELLED" })}>Cancel request</button> : <><button type="button" disabled={!connected} onClick={() => setDecision({ item, decision: "REJECTED" })}>Reject request</button><button type="button" className="clock-primary" disabled={!connected || item.stale || !item.subjectAvailable} onClick={() => setDecision({ item, decision: "APPROVED" })}>Review and approve</button></>}</div>}
    </article>)}
    <div className="correction-pagination">{!!trail.length && <button type="button" onClick={() => { sequence.current++; const previous = trail[trail.length - 1]; setTrail((old) => old.slice(0, -1)); setCursor(previous || undefined); setData(null); }}>Newer requests</button>}{data?.hasMore && <button type="button" disabled={!connected} onClick={() => { sequence.current++; setTrail((old) => [...old, cursor ?? ""]); setCursor(data.nextBefore ?? undefined); setData(null); }}>Earlier requests</button>}</div>
    {form && canRequest && <RequestForm shift={form.shift} onClose={() => setForm(null)} onSaved={() => saved("Correction submitted. Recorded hours stay unchanged until approval.")} />}
    {decision && decisionItem && (decision.decision === "CANCELLED" || canReview) && <DecisionForm item={decisionItem} decision={decision.decision} onClose={() => setDecision(null)} onSave={async (note) => { await apiRequest(`/api/clock/corrections/${decision.item.id}/${decision.decision === "CANCELLED" ? "cancel" : "review"}`, { method: "POST", body: JSON.stringify(decision.decision === "CANCELLED" ? {} : { decision: decision.decision, note }) }); saved(decision.decision === "APPROVED" ? "Correction approved. The recorded hours have been updated." : decision.decision === "REJECTED" ? "Request rejected. Recorded hours were not changed." : "Request cancelled. Recorded hours were not changed."); }} />}
  </section>;
}
