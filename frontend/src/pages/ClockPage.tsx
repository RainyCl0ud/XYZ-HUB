import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { CENTRAL_TIME_ZONE } from "../lib/time";
import "./ClockPage.css";

type BreakKind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";
type PaidBreak = { id: string; kind: BreakKind; label: string; startedAt: string; endedAt: string | null; endReason: string | null; elapsedSeconds: number; allowanceSeconds: number; limitSeconds: number };
type Shift = { id: string; personName: string; startedAt: string; endedAt: string | null; startDay: string; startWeek: string; workedSeconds: number; paidBreakSeconds: number; breaks: PaidBreak[] };
type ClockState = { serverNow: string; timeZone: string; canTrack: boolean; exempt: boolean; currentShift: Shift | null; history: Shift[]; hasMore: boolean; nextBefore: string | null; totals: { dayKey: string; weekKey: string; todaySeconds: number; weekSeconds: number } };
const BREAK_OPTIONS: { kind: BreakKind; label: string; minutes: number }[] = [
  { kind: "SHORT_ONE", label: "Short break 1", minutes: 15 },
  { kind: "SHORT_TWO", label: "Short break 2", minutes: 15 },
  { kind: "MEAL", label: "Meal break", minutes: 30 },
];
const duration = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor(value / 60) % 60).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};
const formatClockTime = (value: string) => new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short" }).format(new Date(value));
const describeError = (error: unknown) => error instanceof Error ? error.message : "Unable to update your attendance. Please try again.";

export default function ClockPage() {
  const [data, setData] = useState<ClockState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loadError, setLoadError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [confirmOut, setConfirmOut] = useState(false);
  const baseline = useRef({ server: 0, received: 0 });
  const operation = useRef(0);
  const refreshSequence = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<{ action: string; requestId: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const accept = useCallback((next: ClockState, older = false) => {
    const stale = Date.parse(next.serverNow) < baseline.current.server;
    if (!stale) {
      baseline.current = { server: Date.parse(next.serverNow), received: performance.now() };
      setElapsed(0);
    }
    setData((previous) => {
      if (!previous) return next;
      const merged = new Map((older ? [...previous.history, ...next.history] : [...next.history, ...previous.history]).map((s) => [s.id, s]));
      // Fresh server rows replace old snapshots, while older loaded history stays.
      if (!older) for (const shift of next.history) merged.set(shift.id, shift);
      const history = [...merged.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt) || b.id.localeCompare(a.id));
      const keepCursor = !older && previous.history.some((s) => !next.history.some((n) => n.id === s.id));
      return { ...(stale ? previous : next), history,
        ...(older ? { hasMore: next.hasMore, nextBefore: next.nextBefore } : keepCursor ? { hasMore: previous.hasMore, nextBefore: previous.nextBefore } : {}) };
    });
    setLoadError("");
  }, []);
  const refresh = useCallback(async (signal?: AbortSignal) => {
    const generation = operation.current;
    const sequence = ++refreshSequence.current;
    try {
      const result = await apiRequest<ClockState>("/api/clock/me", { signal });
      if (mounted.current && generation === operation.current && sequence === refreshSequence.current && !writing.current) accept(result);
    } catch (error) {
      if (mounted.current && generation === operation.current && sequence === refreshSequence.current && error instanceof ApiError && [401, 403, 404].includes(error.status)) setData(null);
      throw error;
    }
  }, [accept]);
  useEffect(() => {
    mounted.current = true;
    const controller = new AbortController();
    const read = () => { if (!writing.current) void refresh(controller.signal).catch((e: unknown) => { if (!controller.signal.aborted) setLoadError(describeError(e)); }); };
    const initial = setTimeout(read, 0);
    const poll = setInterval(() => { if (document.visibilityState === "visible") read(); }, 5000);
    const tick = setInterval(() => { if (baseline.current.received) setElapsed(Math.max(0, Math.floor((performance.now() - baseline.current.received) / 1000))); }, 1000);
    return () => { mounted.current = false; controller.abort(); clearTimeout(initial); clearInterval(poll); clearInterval(tick); };
  }, [refresh]);
  useEffect(() => {
    if (confirmOut) dialog.current?.showModal();
    else dialog.current?.close();
  }, [confirmOut]);

  async function write(action: string, path: string, body: Record<string, unknown>, nonce = false) {
    if (writing.current) return;
    writing.current = true; operation.current++;
    setBusy(true); setActionError(""); setNotice("");
    if (nonce && pending.current?.action !== action) pending.current = { action, requestId: crypto.randomUUID() };
    try {
      const result = await apiRequest<ClockState>(path, { method: "POST", body: JSON.stringify({ ...body, ...(nonce ? { requestId: pending.current!.requestId } : {}) }) });
      if (!mounted.current) return;
      accept(result); pending.current = null; setConfirmOut(false);
      setNotice(action === "in" ? "You’re clocked in. Your shift is being recorded." : action === "out" ? "You’re clocked out. Your hours and paid breaks have been saved." : action === "end-break" ? "Break ended. You’re back on your shift." : "Your paid break has started.");
    } catch (error) {
      if (mounted.current) {
        setActionError(describeError(error)); setConfirmOut(false);
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setData(null);
      }
    } finally {
      writing.current = false;
      if (mounted.current) { setBusy(false); void refresh().catch(() => {}); }
    }
  }
  async function loadOlder() {
    if (!data?.nextBefore || loadingOlder) return;
    const generation = operation.current;
    setLoadingOlder(true);
    try {
      const result = await apiRequest<ClockState>(`/api/clock/me?before=${encodeURIComponent(data.nextBefore)}`);
      if (mounted.current && generation === operation.current && !writing.current) accept(result, true);
    } catch (e) { if (mounted.current) setLoadError(describeError(e)); }
    finally { if (mounted.current) setLoadingOlder(false); }
  }
  const shift = data?.currentShift;
  const activeBreak = shift?.breaks.find((b) => !b.endedAt);
  const shiftSeconds = shift ? shift.workedSeconds + elapsed : 0;
  const breakSeconds = activeBreak ? activeBreak.elapsedSeconds + elapsed : 0;
  const today = (data?.totals.todaySeconds ?? 0) + (shift?.startDay === data?.totals.dayKey ? elapsed : 0);
  const week = (data?.totals.weekSeconds ?? 0) + (shift?.startWeek === data?.totals.weekKey ? elapsed : 0);
  const online = !loadError && !!data && elapsed < 30;

  return <section className="clock-page" aria-labelledby="clock-title">
    <header className="clock-page-heading"><div><p className="clock-eyebrow">YOUR ATTENDANCE</p><h1 id="clock-title">Clock &amp; Hours</h1><p>Your shifts and paid breaks, recorded in one place.</p></div><span className="clock-zone">US Central · CDT / CST automatically</span></header>
    {loadError && <div className="clock-error" role="alert">! {loadError} <button type="button" onClick={() => void refresh().catch((e: unknown) => setLoadError(describeError(e)))}>Retry connection</button></div>}
    {actionError && <div className="clock-error" role="alert">! {actionError}</div>}
    {notice && <div className="clock-notice" role="status">{notice}</div>}
    {!data ? <p role="status">{loadError ? "Your attendance could not be loaded." : "Loading your attendance…"}</p> : <>
      {shift && shiftSeconds >= 14 * 3600 && <div className="clock-callout" role="status"><strong>! Your shift has been open for 14 hours.</strong><p>If you’ve finished, clock out. Your hours will keep recording until you do. Contact management if a time needs correcting.</p></div>}
      <div className="clock-overview">
        <section className="clock-current" aria-labelledby="current-shift-title">
          <header><h2 id="current-shift-title">Current shift</h2><span className="clock-status">{shift ? activeBreak ? "On paid break" : "Clocked in" : "Clocked out"}</span></header>
          <p className="clock-label">{shift ? "WORKED TIME · PAID BREAKS INCLUDED" : "READY WHEN YOU ARE"}</p>
          <div className="clock-timer" role="timer" aria-label="Current shift duration" aria-live="off">{duration(shiftSeconds)}</div>
          {shift ? <><p className="clock-shift-meta">Started {formatClockTime(shift.startedAt)}</p><p>Your shift follows you across creators. All three breaks are paid and included in worked time.</p>
            <button type="button" className="clock-primary" disabled={busy || !online || !data.canTrack} onClick={() => setConfirmOut(true)}>Clock out</button></> : <>
            {data.exempt ? <p>Your current role is exempt from clocking in. Any existing personal records remain below.</p> : !data.canTrack ? <p>Your current access allows viewing your hours only.</p> : <>
              <button type="button" className="clock-primary" disabled={busy || !online} onClick={() => void write("in", "/api/clock/in", {}, true)}>{busy ? "Saving…" : "Clock in"}</button>
            </>}
          </>}
          <p className="clock-recording-note">{online ? "Times are recorded by the server, to the second." : "Connection needs refreshing. Actions are paused until your attendance is up to date."}</p>
        </section>
        <aside className="clock-totals" aria-label="Personal hours"><div><p className="clock-label">TODAY</p><strong>{duration(today)}</strong><p>Shifts that started today, Central time.</p></div><div><p className="clock-label">THIS WEEK</p><strong>{duration(week)}</strong><p>Week beginning {data.totals.weekKey}. Monday to Sunday, Central time.</p></div><p className="clock-hours-note">Hours only. This screen does not calculate pay.</p></aside>
      </div>
      {shift && <section className="clock-breaks" aria-labelledby="breaks-title"><header><div><h2 id="breaks-title">Your paid breaks</h2><p>Two 15-minute short breaks and one 30-minute meal break per shift.</p></div></header>
        {activeBreak && <div className="clock-active-break"><div><strong>{activeBreak.label}</strong><p>{breakSeconds >= activeBreak.allowanceSeconds ? `You’re ${duration(breakSeconds - activeBreak.allowanceSeconds)} past the planned break length. Your time remains paid.` : `Planned break time left: ${duration(activeBreak.allowanceSeconds - breakSeconds)}. Your break remains paid.`}</p></div><span role="timer" aria-label="Current break duration" aria-live="off">{duration(Math.min(breakSeconds, activeBreak.limitSeconds))}</span><button type="button" disabled={busy || !online || !data.canTrack} onClick={() => void write("end-break", `/api/clock/shifts/${shift.id}/breaks/${activeBreak.id}/end`, {})}>End break</button></div>}
        <div className="clock-break-grid">{BREAK_OPTIONS.map((option) => {
          const recorded = shift.breaks.find((b) => b.kind === option.kind);
          return <div className="clock-break-card" key={option.kind}><h3>{option.label}</h3><p>{option.minutes} minutes · Paid</p><span className="clock-status">{recorded ? recorded.endedAt ? "Completed" : "In progress" : "Available"}</span>{recorded ? <p>{duration(recorded.endedAt ? recorded.elapsedSeconds : Math.min(breakSeconds, recorded.limitSeconds))}{recorded.endReason === "LIMIT" ? " · Ended at the limit" : ""}</p> : <button type="button" disabled={busy || !online || !!activeBreak || !data.canTrack} onClick={() => void write(`break-${option.kind}-${shift.id}`, `/api/clock/shifts/${shift.id}/breaks`, { kind: option.kind }, true)}>Start {option.label.toLowerCase()}</button>}</div>;
        })}</div><p className="clock-break-help">A Hub reminder appears at 20 minutes for a short break or 35 minutes for a meal. At 30 or 60 minutes, the break ends automatically and management is flagged. All break time stays paid.</p>
      </section>}
      <section className="clock-history" aria-labelledby="history-title"><header><h2 id="history-title">Your completed shifts</h2><p>Times are shown in US Central. Overnight shifts belong to the day and week they started.</p></header>
        {!data.history.length ? <div className="clock-empty"><h3>No completed shifts yet</h3><p>After you clock out, your shift and paid breaks will appear here.</p></div> : <div className="clock-table-scroll" role="region" aria-label="Completed shifts table" tabIndex={0}><table><thead><tr><th scope="col">CLOCKED IN</th><th scope="col">CLOCKED OUT</th><th scope="col" className="clock-number">WORKED TIME</th><th scope="col" className="clock-number">PAID BREAKS</th><th scope="col">BREAK DETAILS</th></tr></thead><tbody>{data.history.map((s) => <tr key={s.id}><td>{formatClockTime(s.startedAt)}</td><td>{formatClockTime(s.endedAt!)}</td><td className="clock-number">{duration(s.workedSeconds)}</td><td className="clock-number">{duration(s.paidBreakSeconds)}</td><td><details className="clock-break-details"><summary>{s.breaks.length ? `View ${s.breaks.length} paid ${s.breaks.length === 1 ? "break" : "breaks"}` : "No breaks"}</summary>{!!s.breaks.length && <ul>{s.breaks.map((b) => <li key={b.id}><strong>{b.label}</strong><span>{duration(b.elapsedSeconds)} · {b.endReason === "LIMIT" ? "Ended automatically at the limit" : b.endReason === "CLOCK_OUT" ? "Ended with clock-out" : "Returned from break"}</span></li>)}</ul>}</details></td></tr>)}</tbody></table></div>}
        {data.hasMore && <button type="button" disabled={loadingOlder || busy} onClick={() => void loadOlder()}>{loadingOlder ? "Loading…" : "Load earlier shifts"}</button>}
      </section>
    </>}
    <dialog ref={dialog} className="clock-dialog" aria-labelledby="clock-out-title" onCancel={() => setConfirmOut(false)}><h2 id="clock-out-title">End your shift?</h2><p>Your worked time is {duration(shiftSeconds)}, including paid breaks.</p>{activeBreak && <p>Your current break will end when you clock out.</p>}<div><button type="button" disabled={busy} onClick={() => setConfirmOut(false)}>Keep working</button><button type="button" className="clock-primary" disabled={busy || !shift || !online} onClick={() => shift && void write("out", `/api/clock/shifts/${shift.id}/out`, {})}>{busy ? "Saving…" : "Confirm clock out"}</button></div></dialog>
  </section>;
}
