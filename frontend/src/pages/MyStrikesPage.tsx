import { useEffect, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import { apiRequest } from "../lib/api";
import { formatCentralDateTime } from "../lib/time";
import "./StrikesPage.css";

type OwnStrike = {
  id: string;
  reason: string;
  standing: string;
  details: string;
  status: "ACTIVE" | "EXPIRED" | "VOIDED";
  issuedAt: string;
  expiresAt: string;
};

type StrikeHistory = { records: OwnStrike[]; page: number; pageCount: number };
const statusLabels = { ACTIVE: "Active", EXPIRED: "Expired", VOIDED: "Voided" };

export default function MyStrikesPage() {
  const { user } = useAuth();
  return user ? <OwnStrikeHistory key={user.id} /> : null;
}

function OwnStrikeHistory() {
  const [page, setPage] = useState(1);
  const [history, setHistory] = useState<StrikeHistory | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const request = new AbortController();
    apiRequest<StrikeHistory>(`/api/strikes/mine?page=${page}`, { signal: request.signal })
      .then(result => {
        if (!request.signal.aborted) setHistory(result);
      })
      .catch(() => {
        if (!request.signal.aborted) setError("Couldn’t load your strike history. Try again.");
      });
    return () => request.abort();
  }, [page, attempt]);

  function loadPage(nextPage: number) {
    setHistory(null);
    setError("");
    setPage(nextPage);
    setAttempt(previous => previous + 1);
  }

  return (
    <div className="page strikes-page">
      <header className="page-header strikes-page-header">
        <div>
          <p className="page-eyebrow">Your records</p>
          <h1>My Strikes</h1>
          <p className="page-description">Review your disciplinary history. Times are shown in US Central.</p>
        </div>
      </header>
      {error ? (
        <section className="content-card">
          <p role="alert">{error}</p>
          <button type="button" className="secondary-button" onClick={() => loadPage(page)}>Try again</button>
        </section>
      ) : !history ? <p role="status">Loading your strikes…</p> : (
        <>
          {history.records.length === 0 ? <section className="personal-strike-empty" aria-labelledby="strikes-empty-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true"><path d="m12 3 8 4v5c0 5-8 9-8 9s-8-4-8-9V7z"/><path d="m8 12 3 3 5-6"/></svg>
            <h2 id="strikes-empty-title">No strikes on your record</h2>
            <p>Any strikes issued to you will appear here with their reason, status and expiry date.</p>
          </section> : <div className="personal-strike-table-scroll" role="region" aria-label="Your strike history" tabIndex={0}>
            <table className="personal-strike-table">
              <thead><tr><th scope="col">Reason</th><th scope="col">Status</th><th scope="col">Issued</th><th scope="col">Expires</th><th scope="col">Standing when issued</th></tr></thead>
              <tbody>{history.records.map(strike => <tr key={strike.id}>
                <th scope="row">{strike.reason}{strike.details && <details><summary>View details</summary><p>{strike.details}</p></details>}</th>
                <td>{statusLabels[strike.status]}</td>
                <td><time dateTime={strike.issuedAt}>{formatCentralDateTime(strike.issuedAt)}</time></td>
                <td><time dateTime={strike.expiresAt}>{formatCentralDateTime(strike.expiresAt)}</time></td>
                <td>{strike.standing}</td>
              </tr>)}</tbody>
            </table>
          </div>}
          {history.pageCount > 1 && (
            <nav className="personal-strike-pages" aria-label="Strike history pages">
              <button type="button" className="secondary-button" disabled={history.page === 1} onClick={() => loadPage(history.page - 1)}>Previous</button>
              <span>Page {history.page} of {history.pageCount}</span>
              <button type="button" className="secondary-button" disabled={history.page === history.pageCount} onClick={() => loadPage(history.page + 1)}>Next</button>
            </nav>
          )}
        </>
      )}
    </div>
  );
}
