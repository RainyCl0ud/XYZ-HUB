import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { apiRequest } from "../lib/api";
import { Link } from "react-router-dom";
import { useToast } from "./ToastProvider";
import { centralInputValue, centralTimeCandidates, formatCorrectionTime } from "../lib/clock-correction-time";
import { correctionBreakLabels as labels, getRequestedChanges, type CorrectionBreakKind as Kind, type CorrectionSnapshot as Snapshot } from "../lib/clock-correction-comparison";
import "./ClockCorrections.css";

export type CorrectionShift = Snapshot & { id: string; recordVersion: string };
export type ClockCorrectionItem = { id: string; personName: string; kind: "SHIFT_TIMES" | "MISSING_SHIFT"; status: "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED"; reason: string; before: Snapshot | null; proposed: Snapshot; submittedAt: string; reviewerName: string | null; reviewNote: string | null; reviewedAt: string | null; stale: boolean; subjectAvailable: boolean; route: string };
type Item = ClockCorrectionItem;
type Inbox = { serverNow: string; requests: Item[]; hasMore: boolean; nextBefore: string | null; ownPendingCount: number; reviewPendingCount: number; canRequestCorrections: boolean; canReviewCorrections: boolean };
type TimeValue = { wall: string; instant: string };
const initialTime = (instant: string | null): TimeValue => ({ wall: instant ? centralInputValue(instant) : "", instant: instant ?? "" });
const errorText = (e: unknown) => e instanceof Error ? e.message : "Unable to update corrections. Please try again.";
const statusLabels = { PENDING: "Awaiting review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };

function TimeField({ label, value, onChange, disabled, nowMs }: { label: string; value: TimeValue; onChange: (value: TimeValue) => void; disabled: boolean; nowMs: number }) {
  const id = useId();
  const candidates = centralTimeCandidates(value.wall);
  const isFuture = Boolean(value.instant) && Date.parse(value.instant) > nowMs;
  const isInvalid = candidates.length === 0 && Boolean(value.wall);
  const helperId = (isFuture || isInvalid) ? `${id}-help` : undefined;
  return <div className="correction-time"><label htmlFor={id}>{label} <span>US Central</span></label>
    <input id={id} type="datetime-local" step="1" required disabled={disabled} value={value.wall} aria-invalid={isFuture || isInvalid} aria-describedby={helperId}
      onChange={(e) => { const wall = e.target.value; const options = centralTimeCandidates(wall); onChange({ wall, instant: options.length === 1 ? options[0] : "" }); }} />
    {isInvalid && <p id={helperId} className="correction-field-error">This is not a valid Central time. Some times do not exist during the spring daylight-saving transition.</p>}
    {isFuture && <p id={helperId} className="correction-field-error">{label} is later than the current US Central time. Choose a time that has already occurred.</p>}
    {candidates.length > 1 && <><label htmlFor={`${id}-occurrence`}>This time occurs twice. Choose which one.</label><select id={`${id}-occurrence`} required disabled={disabled} value={value.instant} onChange={(e) => onChange({ ...value, instant: e.target.value })}><option value="">Choose CDT or CST</option>{candidates.map((instant) => <option key={instant} value={instant}>{formatCorrectionTime(instant)}</option>)}</select></>}
  </div>;
}
export function Comparison({ before, proposed }: { before: Snapshot | null; proposed: Snapshot }) {
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
export function RequestForm({ shift, onClose, onSaved }: { shift: CorrectionShift | null; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [start, setStart] = useState(() => initialTime(shift?.startedAt ?? null));
  const [end, setEnd] = useState(() => initialTime(shift?.endedAt ?? null));
  const [breaks, setBreaks] = useState(() => (shift?.breaks ?? []).map((b) => ({ kind: b.kind, start: initialTime(b.startedAt), end: initialTime(b.endedAt), recorded: true })));
  const [reason, setReason] = useState("");
  const toast = useToast();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 30_000);
    return () => window.clearInterval(interval);
  }, []);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const writing = useRef(false);
  const pending = useRef<{ key: string; requestId: string } | null>(null);
  useEffect(() => { dialog.current?.showModal(); }, []);
  async function submit(e: FormEvent) {
    e.preventDefault();
    if (writing.current) return;
    if (![start, end, ...breaks.flatMap((b) => [b.start, b.end])].every((v) => v.instant && centralTimeCandidates(v.wall).includes(v.instant))) {
      setError("Choose a valid US Central time for every field, including the CDT/CST occurrence when prompted.");
      return;
    }
    const now = Date.now();
    const future = [
      { label: "Clocked in", value: start },
      { label: "Clocked out", value: end },
      ...breaks.flatMap((pause) => [
        { label: `${labels[pause.kind]} start`, value: pause.start },
        { label: `${labels[pause.kind]} end`, value: pause.end },
      ]),
    ].find((field) => Date.parse(field.value.instant) > now);
    if (future) {
      setNowMs(now);
      setError(`${future.label} is in the future in US Central time. Check the date, time and timezone before submitting.`);
      return;
    }
    const payload = { ...(shift ? { shiftId: shift.id, expectedVersion: shift.recordVersion } : {}), reason: reason.trim(), proposed: { startedAt: start.instant, endedAt: end.instant, breaks: breaks.map((b) => ({ kind: b.kind, startedAt: b.start.instant, endedAt: b.end.instant })) } };
    const key = JSON.stringify(payload);
    if (pending.current?.key !== key) pending.current = { key, requestId: crypto.randomUUID() };
    writing.current = true; setBusy(true); setError("");
    try { await apiRequest("/api/clock/corrections", { method: "POST", body: JSON.stringify({ ...payload, requestId: pending.current!.requestId }) }); onSaved(); }
    catch (e) { const message = errorText(e); setError(message); toast.error(message, "Correction not submitted"); }
    finally { writing.current = false; setBusy(false); }
  }
  return <dialog ref={dialog} className="clock-dialog correction-dialog" aria-labelledby="correction-request-title" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}><form onSubmit={(e) => void submit(e)}>
    <h2 id="correction-request-title">{shift ? "Request a time correction" : "Request a missed shift"}</h2>
    <p>Enter the actual times and explain what happened. Recorded hours only change after approval.</p>
    <p className="correction-timezone-note">
      <strong>Times use US Central (CDT/CST), not your device's timezone.</strong>
      <time dateTime={new Date(nowMs).toISOString()}> Current US Central time: {formatCorrectionTime(new Date(nowMs).toISOString())}</time>
    </p>
    {shift && !shift.endedAt && <p className="correction-hint">This shift is still open. Enter when you actually finished. You can still clock out normally, but doing so changes the record and this request will need to be resubmitted.</p>}
    {error && <div className="clock-error" role="alert">{error}</div>}
    <div className="correction-time-grid"><TimeField label="Clocked in" value={start} onChange={setStart} disabled={busy} nowMs={nowMs} /><TimeField label="Clocked out" value={end} onChange={setEnd} disabled={busy} nowMs={nowMs} /></div>
    <fieldset disabled={busy}><legend>Paid breaks</legend><p>All breaks stay included in worked hours. Keep recorded breaks; correct an accidental break to zero duration rather than erasing its history.</p>
      {breaks.map((pause, index) => <div className="correction-break" key={pause.kind}><div className="correction-break-heading"><strong>{labels[pause.kind]}</strong>{!pause.recorded && <button type="button" onClick={() => setBreaks((old) => old.filter((b) => b.kind !== pause.kind))}>Remove added break</button>}</div><div className="correction-time-grid"><TimeField label={`${labels[pause.kind]} started`} value={pause.start} disabled={busy} nowMs={nowMs} onChange={(start) => setBreaks((old) => old.map((b, i) => i === index ? { ...b, start } : b))} /><TimeField label={`${labels[pause.kind]} ended`} value={pause.end} disabled={busy} nowMs={nowMs} onChange={(end) => setBreaks((old) => old.map((b, i) => i === index ? { ...b, end } : b))} /></div></div>)}
      <div className="correction-add-breaks">{(Object.keys(labels) as Kind[]).filter((kind) => !breaks.some((b) => b.kind === kind)).map((kind) => <button key={kind} type="button" onClick={() => setBreaks((old) => [...old, { kind, start: initialTime(null), end: initialTime(null), recorded: false }])}>Add missed {labels[kind].toLowerCase()}</button>)}</div>
    </fieldset>
    <label className="correction-reason">Reason for the correction<textarea required maxLength={2000} disabled={busy} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Explain the missed or incorrect time." /></label>
    <div className="correction-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Keep recorded times</button><button type="submit" className="clock-primary" disabled={busy || !reason.trim()}>{busy ? "Submitting…" : "Submit for approval"}</button></div>
  </form></dialog>;
}
export function DecisionForm({ item, decision, onClose, onSave, own = false }: { item: Item; decision: "APPROVED" | "REJECTED" | "CANCELLED"; onClose: () => void; onSave: (note: string) => Promise<void>; own?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [note, setNote] = useState(""); const [busy, setBusy] = useState(false); const [error, setError] = useState(""); const writing = useRef(false);
  const toast = useToast();
  useEffect(() => { dialog.current?.showModal(); }, []);
  const action = decision === "APPROVED" ? "Approve correction" : decision === "REJECTED" ? "Reject request" : "Cancel request";
  async function submit(e: FormEvent) { e.preventDefault(); if (writing.current) return; writing.current = true; setBusy(true); setError(""); try { await onSave(note.trim()); } catch (e) { const message = errorText(e); setError(message); toast.error(message, "Request not updated"); } finally { writing.current = false; setBusy(false); } }
  return <dialog ref={dialog} className="clock-dialog correction-dialog" aria-labelledby="correction-decision-title" onCancel={(e) => { if (busy) e.preventDefault(); else onClose(); }}><form onSubmit={(e) => void submit(e)}><h2 id="correction-decision-title">{action}{own ? "" : ` — ${item.personName}`}</h2><p>{decision === "APPROVED" ? "Approval applies the requested times and recalculates the person's day and week totals. The original record stays in the correction history." : "Recorded hours will stay unchanged."}</p><Comparison before={item.before} proposed={item.proposed} /><p className="correction-quoted-reason">{own ? "Your reason" : "Employee’s reason"}: {item.reason}</p>{error && <div className="clock-error" role="alert">{error}</div>}{decision !== "CANCELLED" && <label className="correction-reason">{decision === "APPROVED" ? "Approval note" : "Reason for rejection"}<textarea required maxLength={2000} disabled={busy} value={note} onChange={(e) => setNote(e.target.value)} /></label>}<div className="correction-dialog-actions"><button type="button" disabled={busy} onClick={onClose}>Go back</button><button type="submit" className="clock-primary" disabled={busy || (decision !== "CANCELLED" && !note.trim())}>{busy ? "Saving…" : action}</button></div></form></dialog>;
}
export default function ClockCorrections({ mode, canRequest, canReview, canAddMissing, shifts, disabled, onChanged }: {
  mode: "mine" | "review"; canRequest: boolean; canReview: boolean; canAddMissing: boolean;
  shifts: CorrectionShift[]; disabled: boolean; onChanged: () => void;
}) {
  const [data, setData] = useState<Inbox | null>(null);
  const [error, setError] = useState("");
  const toast = useToast();
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<"all" | "pending">(mode === "review" ? "pending" : "all");
  const [cursor, setCursor] = useState<string | undefined>();
  const [trail, setTrail] = useState<string[]>([]);
  const [selectedShift, setSelectedShift] = useState("");
  const [form, setForm] = useState<{ shift: CorrectionShift | null } | null>(null);
  const sequence = useRef(0);

  const read = useCallback(async (signal?: AbortSignal, foreground = false) => {
    const generation = ++sequence.current;
    if (foreground) setRefreshing(true);
    try {
      const next = await apiRequest<Inbox>(
        `/api/clock/corrections?scope=${mode}&filter=${filter}${cursor ? `&before=${encodeURIComponent(cursor)}` : ""}`,
        { signal }
      );
      if (generation === sequence.current && !signal?.aborted) { setData(next); setError(""); }
    } catch (cause) {
      if (generation === sequence.current && !signal?.aborted) {
        const message = errorText(cause);
        setData(null);
        setError(message);
        if (foreground) toast.error(message, "Could not refresh requests");
      }
    } finally {
      if (generation === sequence.current && !signal?.aborted) setRefreshing(false);
    }
  }, [mode, filter, cursor, toast]);

  useEffect(() => {
    const controller = new AbortController();
    const initial = setTimeout(() => void read(controller.signal), 0);
    const poll = setInterval(() => {
      if (document.visibilityState === "visible") void read(controller.signal);
    }, 10000);
    return () => { controller.abort(); clearTimeout(initial); clearInterval(poll); };
  }, [read]);

  const connected = !!data && !error && !disabled;
  const actualShift = shifts.find(shift => shift.id === selectedShift) ?? shifts[0];
  function saved() {
    sequence.current++;
    setForm(null);
    toast.success("Correction submitted for approval. Recorded hours remain unchanged.");
    onChanged();
    window.dispatchEvent(new Event("xyz-clock-corrections-changed"));
    void read();
  }

  return <section className="clock-corrections" aria-labelledby="clock-corrections-title">
    <header className="clock-section-heading"><div>
      <h2 id="clock-corrections-title">{mode === "mine" ? "My requests" : "Review requests"}</h2>
      <p>{mode === "mine" ? "Submit a correction and follow its status." : "Requests you are currently authorized to review."}</p>
    </div></header>
    {mode === "mine" && canRequest && <div className="correction-start">
      <div><label htmlFor="correction-recorded-shift">Recorded shift</label>
        <select id="correction-recorded-shift" value={actualShift?.id ?? ""} disabled={!connected || !shifts.length}
          onChange={event => setSelectedShift(event.target.value)}>
          {!shifts.length && <option value="">No recorded shifts yet</option>}
          {shifts.map(shift => <option key={shift.id} value={shift.id}>{formatCorrectionTime(shift.startedAt)}{shift.endedAt ? "" : " · Still open"}</option>)}
        </select><p>Load earlier shifts from Shift history if needed.</p>
      </div>
      <button type="button" disabled={!connected || !actualShift} onClick={() => setForm({ shift: actualShift })}>Request correction</button>
      {canAddMissing && <button type="button" disabled={!connected} onClick={() => setForm({ shift: null })}>Request missed shift</button>}
    </div>}
    {mode === "review" && !canReview && <p className="correction-hint">You are not permitted to review corrections.</p>}
    <div className="correction-controls">
      <label htmlFor="correction-status-filter">Status
        <select id="correction-status-filter" value={filter} onChange={event => {
          sequence.current++; setFilter(event.target.value as "all" | "pending");
          setCursor(undefined); setTrail([]); setData(null);
        }}>
          <option value="all">All statuses</option>
          <option value="pending">Awaiting review</option>
        </select>
      </label>
      <button type="button" disabled={refreshing} onClick={() => void read(undefined, true)}>{refreshing ? "Refreshing…" : "Refresh"}</button>
    </div>
    {error && <div className="clock-error" role="alert">{error}</div>}
    {!data && !error && <div className="clock-load-panel" role="status" aria-live="polite">
      <span className="clock-load-spinner" aria-hidden="true" />
      Loading requests…
    </div>}
    {data && !data.requests.length && !refreshing && <div className="clock-empty">
      <h3>{mode === "review" ? "No requests to review" : "No correction requests"}</h3>
      <p>{mode === "review" ? "Eligible requests will appear here." : "Your corrections and approval history will appear here."}</p>
    </div>}
    {refreshing && data && data.requests.length === 0 && <div className="clock-load-panel" role="status" aria-live="polite"><span className="clock-load-spinner" aria-hidden="true" />Refreshing requests…</div>}
    {data && data.requests.length > 0 && <div className="correction-table-state" aria-busy={refreshing}>
      <div className="clock-table-scroll" role="region"
        aria-label={mode === "mine" ? "My correction requests" : "Correction review queue"} tabIndex={0}>
      <table className="clock-data-table correction-requests-table">
        <thead><tr>
          {mode === "review" && <th scope="col">Employee</th>}
          <th scope="col">Type</th><th scope="col">Submitted</th><th scope="col">Status</th><th scope="col">Details</th>
        </tr></thead>
        <tbody>{data.requests.map(item => <tr key={item.id}>
          {mode === "review" && <th scope="row">{item.personName}</th>}
          <td>{item.kind === "MISSING_SHIFT" ? "Missed shift" : "Time correction"}</td>
          <td>{formatCorrectionTime(item.submittedAt)}</td>
          <td><span className="clock-status">{statusLabels[item.status]}</span>{item.stale && <span className="clock-row-note">Needs resubmission</span>}</td>
          <td><Link className="correction-detail-link" to={`/clock/requests/${encodeURIComponent(item.id)}?scope=${mode}`}>View details</Link></td>
        </tr>)}</tbody>
      </table>
      </div>
      {refreshing && <div className="correction-table-loading" role="status" aria-live="polite">
        <span className="clock-load-spinner" aria-hidden="true" />
        Refreshing requests…
      </div>}
    </div>}
    <div className="correction-pagination">
      <span className="correction-page-label" aria-label={`Page ${trail.length + 1}`}>Page {trail.length + 1}</span>
      {trail.length > 0 && <button type="button" onClick={() => {
        sequence.current++;
        const previous = trail[trail.length - 1];
        setTrail(old => old.slice(0, -1));
        setCursor(previous || undefined);
        setData(null);
      }}>Newer requests</button>}
      {data?.hasMore && <button type="button" disabled={!connected} onClick={() => {
        sequence.current++; setTrail(old => [...old, cursor ?? ""]);
        setCursor(data.nextBefore ?? undefined);
        setData(null);
      }}>Earlier requests</button>}
    </div>
    {mode === "mine" && form && canRequest && <RequestForm shift={form.shift} onClose={() => setForm(null)} onSaved={saved} />}
  </section>;
}
