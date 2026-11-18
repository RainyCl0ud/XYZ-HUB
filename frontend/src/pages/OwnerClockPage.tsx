import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import ClockTabs from "../components/ClockTabs";
import { apiRequest, ApiError } from "../lib/api";
import { CENTRAL_TIME_ZONE } from "../lib/time";
import ClockCorrections from "../components/ClockCorrections";
import { useToast } from "../components/ToastProvider";
import "./ClockPage.css";
import "./OwnerClockPage.css";

type ActiveShift = {
  id: string;
  personName: string;
  teamName: string;
  startedAt: string;
  elapsedSeconds: number;
  activeBreak: { kind: "SHORT_ONE" | "SHORT_TWO" | "MEAL"; startedAt: string } | null;
};

type OwnerOverview = {
  scope?: "agency" | "team" | "chatters";
  canReviewSummary?: boolean;
  serverNow: string;
  timeZone: string;
  counts: {
    clockedInStaff: number;
    notClockedInStaff: number;
    staffOnBreak: number;
    shiftsStartedToday: number;
    pendingReviewRequests: number;
  };
  activeShifts: ActiveShift[];
  offShiftStaff: { id: string; personName: string; teamName: string }[];
  hasMoreOffShift: boolean;
  nextOffShiftBefore: string | null;
  hasMore: boolean;
  nextBefore: string | null;
};

const centralTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE,
  month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", timeZoneName: "short",
}).format(new Date(value));

const elapsedHours = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor(value / 60) % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
};

const breakNames = {
  SHORT_ONE: "Short break 1",
  SHORT_TWO: "Short break 2",
  MEAL: "Meal break",
} as const;

export default function OwnerClockPage({ embedded = false }: { embedded?: boolean }) {
  const [searchParams] = useSearchParams();
  const tab = !embedded && searchParams.get("tab") === "review" ? "review" : "overview";
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorTrail, setCursorTrail] = useState<string[]>([]);
  const [offShiftCursor, setOffShiftCursor] = useState<string | undefined>();
  const [offShiftCursorTrail, setOffShiftCursorTrail] = useState<string[]>([]);
  const toast = useToast();
  const activeRequest = useRef<AbortController | null>(null);

  const load = useCallback(async (showFeedback = false) => {
    // Every new request invalidates the previous response, including calls
    // from polling when the Owner is navigating between pages.
    activeRequest.current?.abort();
    const controller = new AbortController();
    activeRequest.current = controller;
    if (showFeedback) setRefreshing(true);
    try {
      const result = await apiRequest<OwnerOverview>(
        `/api/clock/${embedded ? "overview" : "owner/overview"}${cursor || offShiftCursor ? `?${new URLSearchParams({ ...(cursor ? { before: cursor } : {}), ...(offShiftCursor ? { offShiftBefore: offShiftCursor } : {}) }).toString()}` : ""}`,
        { signal: controller.signal },
      );
      if (controller.signal.aborted) return;
      setData(result);
      setError("");
    } catch (cause) {
      if (controller.signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 400 && (cursor || offShiftCursor)) {
        // A staff member clocking out can invalidate a previous pagination cursor.
        setCursor(undefined);
        setCursorTrail([]);
        setOffShiftCursor(undefined);
        setOffShiftCursorTrail([]);
        return;
      }
      const message = cause instanceof Error ? cause.message : "Unable to load attendance overview.";
      setData(null);
      setError(message);
      if (showFeedback) toast.error(message, "Attendance overview unavailable");
    } finally {
      if (!controller.signal.aborted && activeRequest.current === controller) setRefreshing(false);
    }
  }, [cursor, offShiftCursor, toast, embedded]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(true), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load();
    }, 15_000);
    return () => {
      activeRequest.current?.abort();
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [load]);

  const refresh = () => { void load(true); };

  return <section className="clock-page owner-attendance" aria-labelledby="clock-title">
    {!embedded && <header className="clock-page-heading">
      <div>
        <p className="clock-eyebrow">AGENCY ATTENDANCE</p>
        <h1 id="clock-title">Clock &amp; Hours</h1>
      </div>
      <span className="clock-zone">US Central</span>
    </header>}
    {!embedded && <ClockTabs mode="owner" activeTab={tab} canReview={true} />}

    {tab === "review" ? <ClockCorrections
      mode="review"
      canRequest={false}
      canReview={true}
      canAddMissing={false}
      shifts={[]}
      disabled={false}
      onChanged={() => {}}
    /> : <>
      <div className="owner-attendance-toolbar">
        <div>
          <h2>{!embedded || data?.scope === "agency" ? "Agency overview" : data?.scope === "chatters" ? "Assigned chatters" : "Assigned team overview"}</h2>
        </div>
        <button type="button" disabled={refreshing} onClick={refresh}>
          {refreshing ? "Refreshing…" : "Refresh overview"}
        </button>
      </div>

      {error && <div className="clock-error" role="alert">{error}</div>}
      {!data && !error && <div className="clock-load-panel" role="status" aria-live="polite">
        <span className="clock-load-spinner" aria-hidden="true" />
        Loading attendance…
      </div>}
      {data && <>
        <div className="owner-attendance-metrics" aria-label="Attendance metrics">
          <div>
            <span>Currently clocked in</span>
            <strong>{data.counts.clockedInStaff}</strong>
            <small>Active employee shifts</small>
          </div>
          <div>
            <span>Not clocked in</span>
            <strong>{data.counts.notClockedInStaff}</strong>
            <small>Not a lateness indicator</small>
          </div>
          <div>
            <span>On paid break</span>
            <strong>{data.counts.staffOnBreak}</strong>
            <small>Currently open breaks</small>
          </div>
          <div>
            <span>Shifts started today</span>
            <strong>{data.counts.shiftsStartedToday}</strong>
            <small>US Central start date</small>
          </div>
          {data.canReviewSummary && <div>
            <span>Awaiting your review</span>
            <strong>{data.counts.pendingReviewRequests}</strong>
            <Link to="/clock?tab=review">Review correction requests</Link>
          </div>}
        </div>

        <section className="owner-attendance-roster" aria-labelledby="owner-active-shifts-title">
          <header>
            <div>
              <h2 id="owner-active-shifts-title">Active shifts</h2>
              <p>Eligible staff currently clocked in, showing their current team and paid-break status.</p>
            </div>
            <span className="owner-attendance-updated">Updated {centralTime(data.serverNow)}</span>
          </header>
          {data.activeShifts.length ? <div className="clock-table-scroll" role="region"
            aria-label="Visible active shifts" aria-busy={refreshing} tabIndex={0}>
            <table className="clock-data-table">
              <thead><tr>
                <th scope="col">Employee</th>
                <th scope="col">Team</th>
                <th scope="col">Clocked in</th>
                <th scope="col">Elapsed</th>
                <th scope="col">Status</th>
              </tr></thead>
              <tbody>{data.activeShifts.map((item) => <tr key={item.id}>
                <th scope="row">{item.personName}</th>
                <td>{item.teamName}</td>
                <td>{centralTime(item.startedAt)}</td>
                <td className="owner-attendance-elapsed">{elapsedHours(item.elapsedSeconds)}</td>
                <td><span className="clock-status">{item.activeBreak ? breakNames[item.activeBreak.kind] : "Working"}</span></td>
              </tr>)}</tbody>
            </table>
          </div> : <div className="clock-empty">
            <h3>No active shifts</h3>
            <p>No active employee is currently clocked in.</p>
          </div>}
          {refreshing && <p className="owner-attendance-refresh" role="status">Refreshing attendance…</p>}
          <div className="owner-attendance-pagination">
            <span>Page {cursorTrail.length + 1}</span>
            <div>
              <button type="button" disabled={!cursorTrail.length || refreshing} onClick={() => {
                const previous = cursorTrail[cursorTrail.length - 1];
                setCursorTrail(old => old.slice(0, -1));
                setCursor(previous || undefined);
              }}>Previous</button>
              <button type="button" disabled={!data.hasMore || !data.nextBefore || refreshing} onClick={() => {
                setCursorTrail(old => [...old, cursor ?? ""]);
                setCursor(data.nextBefore ?? undefined);
              }}>Next</button>
            </div>
          </div>
        </section>

        <section className="owner-attendance-roster owner-attendance-offshift" aria-labelledby="attendance-offshift-title">
          <header>
            <div>
              <h2 id="attendance-offshift-title">Not clocked in</h2>
              <p>Eligible staff without an active shift. A person is not considered late without an assigned start time.</p>
            </div>
            <span className="owner-attendance-updated">{data.counts.notClockedInStaff} staff</span>
          </header>
          {data.offShiftStaff.length ? <div className="clock-table-scroll" role="region"
            aria-label="Staff not currently clocked in" aria-busy={refreshing} tabIndex={0}>
            <table className="clock-data-table">
              <thead><tr><th scope="col">Employee</th><th scope="col">Team</th><th scope="col">Status</th></tr></thead>
              <tbody>{data.offShiftStaff.map((person) => <tr key={person.id}>
                <th scope="row">{person.personName}</th>
                <td>{person.teamName}</td>
                <td><span className="clock-status">Not clocked in</span></td>
              </tr>)}</tbody>
            </table>
          </div> : <div className="clock-empty"><p>Everyone in this view is currently clocked in.</p></div>}
          <div className="owner-attendance-pagination">
            <span>Page {offShiftCursorTrail.length + 1}</span>
            <div>
              <button type="button" disabled={!offShiftCursorTrail.length || refreshing} onClick={() => {
                const previous = offShiftCursorTrail[offShiftCursorTrail.length - 1];
                setOffShiftCursorTrail(old => old.slice(0, -1));
                setOffShiftCursor(previous || undefined);
              }}>Previous</button>
              <button type="button" disabled={!data.hasMoreOffShift || !data.nextOffShiftBefore || refreshing} onClick={() => {
                setOffShiftCursorTrail(old => [...old, offShiftCursor ?? ""]);
                setOffShiftCursor(data.nextOffShiftBefore ?? undefined);
              }}>Next</button>
            </div>
          </div>
        </section>
      </>}
    </>}
  </section>;
}
