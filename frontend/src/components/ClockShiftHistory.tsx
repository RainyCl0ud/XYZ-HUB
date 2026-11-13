import { useEffect, useState, type ReactNode } from "react";
import { ApiError, apiRequest } from "../lib/api";
import { CENTRAL_TIME_ZONE } from "../lib/time";
import {
  FIRST_HISTORY_POSITION,
  historyPageNumber,
  nextHistoryPosition,
  previousHistoryPosition,
  type HistoryPosition,
} from "../lib/clock-history-pagination";
import { useToast } from "./ToastProvider";

/** Same wire shape as the existing personal Clock endpoint's shift DTO. */
export type ClockHistoryShift = {
  id: string;
  recordVersion: string;
  correctionCount: number;
  personName: string;
  startedAt: string;
  endedAt: string | null;
  startDay: string;
  startWeek: string;
  workedSeconds: number;
  paidBreakSeconds: number;
  breaks: {
    id: string;
    kind: "SHORT_ONE" | "SHORT_TWO" | "MEAL";
    label: string;
    startedAt: string;
    endedAt: string | null;
    endReason: string | null;
    elapsedSeconds: number;
    allowanceSeconds: number;
    limitSeconds: number;
  }[];
};

export type ClockHistoryPage = {
  history: ClockHistoryShift[];
  hasMore: boolean;
  nextBefore: string | null;
  historyVersion: string;
};

type LoadedPage = ClockHistoryPage & { cursor: string };

type Props = {
  firstPage: ClockHistoryPage;
  disabled: boolean;
  onOlderPageLoaded: (history: ClockHistoryShift[], version: string) => void;
  onHistoryChanged: () => Promise<void>;
};

const duration = (seconds: number) => {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 3600)).padStart(2, "0")}:${String(Math.floor((value % 3600) / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
};

const formatClockTime = (value: string) => new Intl.DateTimeFormat("en-US", {
  timeZone: CENTRAL_TIME_ZONE, month: "short", day: "numeric", year: "numeric",
  hour: "numeric", minute: "2-digit", second: "2-digit", timeZoneName: "short",
}).format(new Date(value));

function TableRegion({ children }: { children: ReactNode }) {
  return <div className="clock-table-scroll" role="region" aria-label="Completed shifts table" tabIndex={0}>{children}</div>;
}

export default function ClockShiftHistory({
  firstPage, disabled, onOlderPageLoaded, onHistoryChanged,
}: Props) {
  const toast = useToast();
  const [position, setPosition] = useState<HistoryPosition>(FIRST_HISTORY_POSITION);
  const [loadedPage, setLoadedPage] = useState<LoadedPage | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);

  const cursor = position.cursor;
  useEffect(() => {
    if (!cursor) return;
    const controller = new AbortController();
    // Avoid synchronous state writes inside effects while still showing
    // a loading state for each page change and preventing stale responses.
    const initial = window.setTimeout(() => {
      setLoading(true);
      setError("");
      void apiRequest<ClockHistoryPage>(
        `/api/clock/me?before=${encodeURIComponent(cursor)}`,
        { signal: controller.signal },
      ).then(async response => {
        if (controller.signal.aborted) return;
        if (response.historyVersion !== firstPage.historyVersion) {
          setPosition(FIRST_HISTORY_POSITION);
          setLoadedPage(null);
          toast.info("An approved correction updated your shift history. Showing the latest records.");
          await onHistoryChanged();
          return;
        }
        const result: LoadedPage = { ...response, cursor };
        setLoadedPage(result);
        onOlderPageLoaded(response.history, response.historyVersion);
      }).catch((cause: unknown) => {
        if (controller.signal.aborted) return;
        if (cause instanceof ApiError && cause.status === 400) {
          // A deleted/updated cursor must not strand the user on a stale page.
          setPosition(FIRST_HISTORY_POSITION);
          setLoadedPage(null);
          toast.info("Your shift history changed. Showing the latest records.");
          void onHistoryChanged().catch(() => {});
          return;
        }
        const message = cause instanceof Error ? cause.message : "Unable to load the selected history page.";
        setError(message);
        toast.error(message, "Shift history unavailable");
      }).finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    }, 0);
    return () => {
      controller.abort();
      window.clearTimeout(initial);
    };
  }, [cursor, retry, firstPage.historyVersion, toast, onOlderPageLoaded, onHistoryChanged]);

  const page = !cursor
    ? firstPage
    : loadedPage?.cursor === cursor && loadedPage.historyVersion === firstPage.historyVersion
      ? loadedPage : null;
  const pending = Boolean(cursor && !page && !error);
  const isLoading = loading || pending;
  const pageNumber = historyPageNumber(position);

  const goNext = () => {
    if (!page?.hasMore || !page.nextBefore || isLoading || disabled) return;
    setLoadedPage(null);
    setError("");
    setPosition(current => nextHistoryPosition(current, page.nextBefore));
  };
  const goPrevious = () => {
    if (!position.trail.length || isLoading || disabled) return;
    setLoadedPage(null);
    setError("");
    setPosition(current => previousHistoryPosition(current));
  };

  return <section className="clock-history" aria-labelledby="history-title">
    <header>
      <h2 id="history-title">Your completed shifts</h2>
      <p>Times are shown in US Central. Overnight shifts belong to the day and week they started.</p>
    </header>

    {error && <div className="clock-error" role="alert">
      {error} <button type="button" onClick={() => setRetry(count => count + 1)}>Retry this page</button>
    </div>}

    {isLoading && <div className="clock-load-panel" role="status" aria-live="polite">
      <span className="clock-load-spinner" aria-hidden="true" />
      Loading shift history page {pageNumber}…
    </div>}

    {!isLoading && page && (page.history.length === 0
      ? <div className="clock-empty"><h3>No completed shifts yet</h3><p>After you clock out, your shift and paid breaks will appear here.</p></div>
      : <TableRegion>
        <table className="clock-data-table">
          <thead><tr>
            <th scope="col">CLOCKED IN</th>
            <th scope="col">CLOCKED OUT</th>
            <th scope="col" className="clock-number">WORKED TIME</th>
            <th scope="col" className="clock-number">PAID BREAKS</th>
            <th scope="col">BREAK DETAILS</th>
          </tr></thead>
          <tbody>{page.history.map(shift => <tr key={shift.id}>
            <td>{formatClockTime(shift.startedAt)}
              {!!shift.correctionCount && <span className="clock-corrected-label">Approved correction applied</span>}
            </td>
            <td>{shift.endedAt ? formatClockTime(shift.endedAt) : "Not recorded"}</td>
            <td className="clock-number">{duration(shift.workedSeconds)}</td>
            <td className="clock-number">{duration(shift.paidBreakSeconds)}</td>
            <td><details className="clock-break-details">
              <summary>{shift.breaks.length ? `View ${shift.breaks.length} paid ${shift.breaks.length === 1 ? "break" : "breaks"}` : "No breaks"}</summary>
              {!!shift.breaks.length && <ul>{shift.breaks.map(pause => <li key={pause.id}>
                <strong>{pause.label}</strong>
                <span>{duration(pause.elapsedSeconds)} · {pause.endReason === "LIMIT"
                  ? "Ended automatically at the limit"
                  : pause.endReason === "CLOCK_OUT" ? "Ended with clock-out"
                    : pause.endReason === "CORRECTION" ? "Corrected with approval" : "Returned from break"}</span>
              </li>)}</ul>}
            </details></td>
          </tr>)}</tbody>
        </table>
      </TableRegion>)}

    <nav className="clock-history-pagination" aria-label="Shift history pages">
      <span role="status" aria-live="polite">Page {pageNumber}</span>
      <div className="clock-history-pagination-actions">
        <button type="button" disabled={isLoading || disabled || !position.trail.length} onClick={goPrevious}>
          Previous
        </button>
        <button type="button" disabled={isLoading || disabled || !page?.hasMore || !page?.nextBefore} onClick={goNext}>
          Next
        </button>
      </div>
    </nav>
  </section>;
}
