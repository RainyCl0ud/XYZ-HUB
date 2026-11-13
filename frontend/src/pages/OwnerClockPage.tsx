import { useCallback, useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
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
  serverNow: string;
  timeZone: string;
  counts: {
    clockedInStaff: number;
    staffOnBreak: number;
    shiftsStartedToday: number;
    pendingReviewRequests: number;
  };
  activeShifts: ActiveShift[];
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

export default function OwnerClockPage() {
  const [searchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "review" ? "review" : "overview";
  const [data, setData] = useState<OwnerOverview | null>(null);
  const [error, setError] = useState("");
  const [refreshing, setRefreshing] = useState(true);
  const [cursor, setCursor] = useState<string | undefined>();
  const [cursorTrail, setCursorTrail] = useState<string[]>([]);
  const toast = useToast();

  const load = useCallback(async (signal: AbortSignal, showFeedback = false) => {
    if (showFeedback) setRefreshing(true);
    try {
      const result = await apiRequest<OwnerOverview>(
        `/api/clock/owner/overview${cursor ? `?before=${encodeURIComponent(cursor)}` : ""}`,
        { signal },
      );
      if (signal.aborted) return;
      setData(result);
      setError("");
    } catch (cause) {
      if (signal.aborted) return;
      if (cause instanceof ApiError && cause.status === 400 && cursor) {
        // A staff member clocking out can invalidate a previous pagination cursor.
        setCursor(undefined);
        setCursorTrail([]);
        return;
      }
      const message = cause instanceof Error ? cause.message : "Unable to load attendance overview.";
      setData(null);
      setError(message);
      if (showFeedback) toast.error(message, "Attendance overview unavailable");
    } finally {
      if (!signal.aborted) setRefreshing(false);
    }
  }, [cursor, toast]);

  useEffect(() => {
    const controller = new AbortController();
    const first = window.setTimeout(() => void load(controller.signal, true), 0);
    const poll = window.setInterval(() => {
      if (document.visibilityState === "visible") void load(controller.signal);
    }, 15_000);
    return () => {
      controller.abort();
      window.clearTimeout(first);
      window.clearInterval(poll);
    };
  }, [load]);

  const refresh = () => {
    const controller = new AbortController();
    void load(controller.signal, true);
  };

  return <section className="clock-page owner-attendance" aria-labelledby="clock-title">
    <header className="clock-page-heading">
      <div>
        <p className="clock-eyebrow">AGENCY ATTENDANCE</p>
        <h1 id="clock-title">Clock &amp; Hours</h1>
        <p>Operational attendance overview and correction approvals.</p>
      </div>
      <span className="clock-zone">US Central · CDT / CST automatically</span>
    </header>
    <nav className="clock-tabs" aria-label="Owner attendance sections">
      <Link to="/clock" aria-current={tab === "overview" ? "page" : undefined}>Attendance overview</Link>
      <Link to="/clock?tab=review" aria-current={tab === "review" ? "page" : undefined}>Review requests</Link>
    </nav>

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
          <h2>Agency overview</h2>
          <p>Current attendance and work requiring your attention.</p>
        </div>
        <button type="button" disabled={refreshing} onClick={refresh}>
          {refreshing ? "Refreshing…" : "Refresh overview"}
        </button>
      </div>

      {error && <div className="clock-error" role="alert">{error}</div>}
      {!data && !error && <div className="clock-load-panel" role="status" aria-live="polite">
        <span className="clock-load-spinner" aria-hidden="true" />
        Loading agency attendance…
      </div>}
      {data && <>
        <div className="owner-attendance-metrics" aria-label="Agency attendance metrics">
          <div>
            <span>Currently clocked in</span>
            <strong>{data.counts.clockedInStaff}</strong>
            <small>Active employee shifts</small>
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
          <div>
            <span>Awaiting your review</span>
            <strong>{data.counts.pendingReviewRequests}</strong>
            <Link to="/clock?tab=review">Review correction requests</Link>
          </div>
        </div>

        <section className="owner-attendance-roster" aria-labelledby="owner-active-shifts-title">
          <header>
            <div>
              <h2 id="owner-active-shifts-title">Active shifts</h2>
              <p>Staff currently clocked in, showing their current team and paid-break status.</p>
            </div>
            <span className="owner-attendance-updated">Updated {centralTime(data.serverNow)}</span>
          </header>
          {data.activeShifts.length ? <div className="clock-table-scroll" role="region"
            aria-label="Agency active shifts" aria-busy={refreshing} tabIndex={0}>
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
      </>}
    </>}
  </section>;
}
