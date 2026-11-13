import { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { ApiError, apiRequest } from "../lib/api";
import { CENTRAL_TIME_ZONE } from "../lib/time";
import ClockCorrections from "../components/ClockCorrections";
import ClockShiftHistory, { type ClockHistoryShift as Shift } from "../components/ClockShiftHistory";
import ClockTabs from "../components/ClockTabs";
import { useToast } from "../components/ToastProvider";
import "./ClockPage.css";

type BreakKind = "SHORT_ONE" | "SHORT_TWO" | "MEAL";
remove redundant local wire shapestype ClockState = { serverNow: string; historyVersion: string; timeZone: string; canTrack: boolean; canRequestCorrections: boolean; canReviewCorrections: boolean; exempt: boolean; currentShift: Shift | null; history: Shift[]; hasMore: boolean; nextBefore: string | null; totals: { dayKey: string; weekKey: string; todaySeconds: number; weekSeconds: number } };
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
  const [searchParams] = useSearchParams();
  const requestedTab = searchParams.get("tab");
  const [data, setData] = useState<ClockState | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const [loadError, setLoadError] = useState("");
  const toast = useToast();
  const [busy, setBusy] = useState(false);
  const [historyCache, setHistoryCache] = useState<{ version: string; entries: Shift[] } | null>(null);
  const [confirmOut, setConfirmOut] = useState(false);
  const baseline = useRef({ server: 0, received: 0 });
  const operation = useRef(0);
  const refreshSequence = useRef(0);
  const writing = useRef(false);
  const mounted = useRef(true);
  const pending = useRef<{ action: string; requestId: string } | null>(null);
  const dialog = useRef<HTMLDialogElement>(null);

  const accept = useCallback((next: ClockState) => {
    // All normal clock responses contain the latest bounded history page.
    // Never append older rows to it: selected history pages are rendered
    // separately, while the corrections picker retains older cached shifts.
    if (Date.parse(next.serverNow) < baseline.current.server) return;
    baseline.current = { server: Date.parse(next.serverNow), received: performance.now() };
    setElapsed(0);
    setData(next);
    setLoadError("");
  }, []);

  const cacheOlderHistory = useCallback((entries: Shift[], version: string) => {
    setHistoryCache(previous => {
      const older = previous?.version === version ? previous.entries : [];
      const byId = new Map([...older, ...entries].map(shift => [shift.id, shift]));
      return { version, entries: [...byId.values()] };
    });
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
    setBusy(true);
    if (nonce && pending.current?.action !== action) pending.current = { action, requestId: crypto.randomUUID() };
    try {
      const result = await apiRequest<ClockState>(path, { method: "POST", body: JSON.stringify({ ...body, ...(nonce ? { requestId: pending.current!.requestId } : {}) }) });
      if (!mounted.current) return;
      accept(result); pending.current = null; setConfirmOut(false);
      toast.success(action === "in" ? "You’re clocked in. Your shift is being recorded." : action === "out" ? "You’re clocked out. Your hours and paid breaks have been saved." : action === "end-break" ? "Break ended. You’re back on your shift." : "Your paid break has started.");
    } catch (error) {
      if (mounted.current) {
        toast.error(describeError(error), "Attendance action failed"); setConfirmOut(false);
        if (error instanceof ApiError && [401, 403, 404].includes(error.status)) setData(null);
      }
    } finally {
      writing.current = false;
      if (mounted.current) { setBusy(false); void refresh().catch(() => {}); }
    }
  }
  const syncHistoryAfterChange = useCallback(async () => {
    try {
      await refresh();
    } catch (error) {
      toast.error(describeError(error), "Unable to refresh shift history");
    }
  }, [refresh, toast]);
  const shift = data?.currentShift;
  const activeBreak = shift?.breaks.find((b) => !b.endedAt);
  const shiftSeconds = shift ? shift.workedSeconds + elapsed : 0;
  const breakSeconds = activeBreak ? activeBreak.elapsedSeconds + elapsed : 0;
  const today = (data?.totals.todaySeconds ?? 0) + (shift?.startDay === data?.totals.dayKey ? elapsed : 0);
  const week = (data?.totals.weekSeconds ?? 0) + (shift?.startWeek === data?.totals.weekKey ? elapsed : 0);
  const online = !loadError && !!data && elapsed < 30;
  const tab = requestedTab === "requests" || requestedTab === "history"
    || (requestedTab === "review" && data?.canReviewCorrections)
      ? requestedTab : "overview";

  return <section className="clock-page" aria-labelledby="clock-title">
    <header className="clock-page-heading"><div><p className="clock-eyebrow">YOUR ATTENDANCE</p><h1 id="clock-title">Clock &amp; Hours</h1><p>Your shifts and paid breaks, recorded in one place.</p></div><span className="clock-zone">US Central · CDT / CST automatically</span></header>
    {loadError && <div className="clock-error" role="alert">! {loadError} <button type="button" onClick={() => void refresh().catch((e: unknown) => setLoadError(describeError(e)))}>Retry connection</button></div>}
    {data && <ClockTabs mode="staff" activeTab={tab} canReview={data.canReviewCorrections} />}
    {!data ? <p role="status">{loadError ? "Your attendance could not be loaded." : "Loading your attendance…"}</p> : <>
      {tab === "overview" && <div className="clock-workspace">
      {shift && shiftSeconds >= 14 * 3600 && <div className="clock-callout" role="status"><strong>! Your shift has been open for 14 hours.</strong><p>If you’ve finished, clock out. Your hours will keep recording until you do. Use Time corrections below if a recorded time needs changing.</p></div>}
      <section className="clock-summary-section" aria-labelledby="current-shift-title">
        <header className="clock-section-heading">
          <h2 id="current-shift-title">Current shift</h2>
          <p>Worked time includes paid breaks. Times use US Central.</p>
        </header>
        <div className="clock-table-scroll" role="region" aria-label="Current shift details" tabIndex={0}>
          <table className="clock-data-table clock-shift-table">
            <thead><tr><th scope="col">Status</th><th scope="col">Clocked in</th><th scope="col">Worked time</th><th scope="col">Action</th></tr></thead>
            <tbody><tr>
              <td><span className="clock-status">{shift ? activeBreak ? "On paid break" : "Clocked in" : "Clocked out"}</span></td>
              <td>{shift ? formatClockTime(shift.startedAt) : "Not clocked in"}</td>
              <td><strong className="clock-live-duration" role="timer" aria-label="Current shift duration" aria-live="off">{duration(shiftSeconds)}</strong></td>
              <td>{shift ? (
                <button type="button" className="clock-primary" disabled={busy || !online || !data.canTrack} onClick={() => setConfirmOut(true)}>Clock out</button>
              ) : data.exempt ? (
                <span className="clock-muted">Exempt from clocking in</span>
              ) : !data.canTrack ? (
                <span className="clock-muted">View-only access</span>
              ) : (
                <button type="button" className="clock-primary" disabled={busy || !online} onClick={() => void write("in", "/api/clock/in", {}, true)}>{busy ? "Saving…" : "Clock in"}</button>
              )}</td>
            </tr></tbody>
          </table>
        </div>
        <p className="clock-recording-note">{online ? shift ? "Your shift follows you across creators. The server records times to the second." : "The server records times to the second." : "Connection needs refreshing. Actions are paused until your attendance is up to date."}</p>
      </section>
      <section className="clock-hours-section" aria-labelledby="hours-summary-title">
        <header className="clock-section-heading"><h2 id="hours-summary-title">Hours summary</h2><p>Shifts belong to the day and week they started in US Central.</p></header>
        <div className="clock-table-scroll" role="region" aria-label="Personal hours summary" tabIndex={0}>
          <table className="clock-data-table clock-hours-table">
            <thead><tr><th scope="col">Period</th><th scope="col" className="clock-number">Worked time</th><th scope="col">Counting rule</th></tr></thead>
            <tbody>
              <tr><th scope="row">Today</th><td className="clock-number clock-hours-value">{duration(today)}</td><td>Shifts started today (US Central).</td></tr>
              <tr><th scope="row">This week</th><td className="clock-number clock-hours-value">{duration(week)}</td><td>Week of {data.totals.weekKey}, Monday–Sunday (US Central).</td></tr>
            </tbody>
          </table>
        </div>
        <p className="clock-hours-note">Hours only. This screen does not calculate pay.</p>
      </section>
      {shift && <section className="clock-breaks" aria-labelledby="breaks-title">
        <header className="clock-section-heading"><h2 id="breaks-title">Your paid breaks</h2><p>Two 15-minute short breaks and one 30-minute meal break per shift.</p></header>
        {activeBreak && <p className="clock-active-break-note">
          <strong>{activeBreak.label} in progress.</strong>{" "}
          {breakSeconds >= activeBreak.allowanceSeconds
            ? "Past planned length by " + duration(breakSeconds - activeBreak.allowanceSeconds) + ". Your break remains paid."
            : "Planned time left: " + duration(activeBreak.allowanceSeconds - breakSeconds) + ". Your break remains paid."}
        </p>}
        <div className="clock-table-scroll" role="region" aria-label="Paid break status and actions" tabIndex={0}>
          <table className="clock-data-table clock-breaks-table">
            <thead><tr><th scope="col">Break</th><th scope="col">Paid allowance</th><th scope="col">Status</th><th scope="col" className="clock-number">Elapsed</th><th scope="col">Action</th></tr></thead>
            <tbody>{BREAK_OPTIONS.map((option) => {
              const recorded = shift.breaks.find((b) => b.kind === option.kind);
              const isActive = !!recorded && !recorded.endedAt;
              const seconds = recorded ? isActive ? Math.min(breakSeconds, recorded.limitSeconds) : recorded.elapsedSeconds : 0;
              return <tr key={option.kind}>
                <th scope="row">{option.label}</th>
                <td>{option.minutes} min · Paid</td>
                <td><span className="clock-status">{recorded ? isActive ? "In progress" : "Completed" : "Available"}</span>{recorded?.endReason === "LIMIT" && <span className="clock-row-note">Ended automatically at the limit</span>}</td>
                <td className="clock-number">{recorded ? (
                  isActive ? <span role="timer" aria-label="Current break duration" aria-live="off">{duration(seconds)}</span> : duration(seconds)
                ) : "—"}</td>
                <td>{!recorded ? (
                  <button type="button" disabled={busy || !online || !!activeBreak || !data.canTrack} onClick={() => void write("break-" + option.kind + "-" + shift.id, "/api/clock/shifts/" + shift.id + "/breaks", { kind: option.kind }, true)}>Start {option.label.toLowerCase()}</button>
                ) : isActive ? (
                  <button type="button" disabled={busy || !online || !data.canTrack} onClick={() => void write("end-break", "/api/clock/shifts/" + shift.id + "/breaks/" + recorded.id + "/end", {})}>End break</button>
                ) : <span className="clock-muted">Finished</span>}</td>
              </tr>;
            })}</tbody>
          </table>
        </div>
        <p className="clock-break-help">Breaks end automatically when their limit is reached. All break time remains paid.</p>
      </section>}
      </div>}
      {tab === "history" && <ClockShiftHistory
        key={data.historyVersion}
        firstPage={{
          history: data.history,
          historyVersion: data.historyVersion,
          hasMore: data.hasMore,
          nextBefore: data.nextBefore,
        }}
        disabled={busy}
        onOlderPageLoaded={cacheOlderHistory}
        onHistoryChanged={syncHistoryAfterChange}
      />}
      {(tab === "requests" || tab === "review") && <ClockCorrections
        key={tab}
        mode={tab === "review" ? "review" : "mine"}
        canRequest={data.canRequestCorrections}
        canReview={data.canReviewCorrections}
        canAddMissing={data.canTrack}
        shifts={[...new Map([
          ...(data.currentShift ? [data.currentShift] : []),
          ...data.history,
          ...(historyCache?.version === data.historyVersion ? historyCache.entries : []),
        ].map((shift): [string, Shift] => [shift.id, shift])).values()]}
        disabled={busy || !online}
        onChanged={() => { void refresh().catch((e: unknown) => setLoadError(describeError(e))); }}
      />}
    </>}
    <dialog ref={dialog} className="clock-dialog" aria-labelledby="clock-out-title" onCancel={() => setConfirmOut(false)}><h2 id="clock-out-title">End your shift?</h2><p>Your worked time is {duration(shiftSeconds)}, including paid breaks.</p>{activeBreak && <p>Your current break will end when you clock out.</p>}<div><button type="button" disabled={busy} onClick={() => setConfirmOut(false)}>Keep working</button><button type="button" className="clock-primary" disabled={busy || !shift || !online} onClick={() => shift && void write("out", `/api/clock/shifts/${shift.id}/out`, {})}>{busy ? "Saving…" : "Confirm clock out"}</button></div></dialog>
  </section>;
}
