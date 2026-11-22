import { Link } from "react-router-dom";
import {
  attentionOrder,
  describeShift,
  formatSnapshotTime,
  type AttendanceState,
  type AttentionRow,
} from "../lib/dashboard-attention";

// Desktop lists 5 people on the clock; phones show the first 3 (CSS).
const CLOCK_ROWS = 5;

/** One row per item waiting on this account, each a link to where it's handled. */
export function NeedsAttentionCard({ rows }: { rows: AttentionRow[] }) {
  return (
    <section className="content-card agency-dashboard-panel agency-attention-panel">
      <div className="card-header">
        <div>
          <h3>Needs attention</h3>
          <p>What is waiting on you right now.</p>
        </div>
      </div>

      <ul className="agency-attention-list">
        {rows.map((row) => {
          const className = `agency-attention-row${row.count ? " has-items" : ""}`;
          const content = (
            <>
              <strong className="agency-attention-count">
                {row.count ?? (
                  <>
                    <span aria-hidden="true">—</span>
                    <span className="agency-sr-only">Not loaded</span>
                  </>
                )}
              </strong>
              <span className="agency-attention-copy">
                <span>{row.label}</span>
                <small>{row.helper}</small>
              </span>
            </>
          );

          return (
            <li key={row.key}>
              {row.href ? (
                <Link to={row.href} className={className}>{content}</Link>
              ) : (
                <div className={className}>{content}</div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Live attendance: three counts, then the people to look at first. */
export function OnTheClockCard({
  state,
  href,
  onRetry,
}: {
  state: AttendanceState;
  href: string | null;
  onRetry: () => void;
}) {
  const rows = state.status === "ready" ? attentionOrder(state.data).slice(0, CLOCK_ROWS) : [];

  return (
    <section className="content-card agency-dashboard-panel agency-clock-panel">
      <div className="card-header">
        <div>
          <h3>On the clock now</h3>
          <p>Who is working, on a break or not clocked in.</p>
        </div>
        {href && <Link to={href} className="text-button">View attendance</Link>}
      </div>

      {state.status === "loading" && (
        <div className="empty-state dashboard-empty" role="status">
          <strong>Loading attendance…</strong>
        </div>
      )}

      {state.status === "error" && (
        <div className="agency-clock-notice" role="status">
          <strong>Attendance couldn't load.</strong>
          <button type="button" className="text-button" onClick={onRetry}>Retry</button>
        </div>
      )}

      {state.status === "ready" && (
        <>
          {state.stale && (
            <div className="agency-clock-notice" role="status">
              <strong>Couldn't refresh. Showing attendance from {formatSnapshotTime(state.data.serverNow)}.</strong>
              <button type="button" className="text-button" onClick={onRetry}>Retry</button>
            </div>
          )}

          <dl className="agency-clock-counts">
            <div>
              <dt>Clocked in</dt>
              <dd>{state.data.counts.clockedInStaff}</dd>
            </div>
            <div>
              <dt>On break</dt>
              <dd>{state.data.counts.staffOnBreak}</dd>
            </div>
            <div>
              <dt>Not clocked in</dt>
              <dd>{state.data.counts.notClockedInStaff}</dd>
            </div>
          </dl>

          {rows.length === 0 ? (
            <div className="empty-state dashboard-empty">
              <strong>No one is clocked in right now</strong>
            </div>
          ) : (
            <ul className="agency-clock-list">
              {rows.map((row) => {
                const { state: status, tag } = describeShift(row);
                return (
                  <li key={row.id} className="agency-clock-row">
                    <span className="agency-clock-person">
                      <strong>{row.personName}</strong>
                      <span>{row.teamName}</span>
                    </span>
                    <span className="agency-clock-state">
                      <span>{status}</span>
                      {tag && <span className={`agency-clock-tag${row.isLong ? " long" : ""}`}>{tag}</span>}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
