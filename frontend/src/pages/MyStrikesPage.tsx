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
          {history.records.length === 0 && <section className="content-card"><p>You have no strike records.</p></section>}
          {history.records.map(strike => (
            <article key={strike.id} className="content-card personal-strike">
              <header>
                <h2>{strike.reason}</h2>
                <strong>{statusLabels[strike.status]}</strong>
              </header>
              <dl>
                <div><dt>Issued</dt><dd><time dateTime={strike.issuedAt}>{formatCentralDateTime(strike.issuedAt)}</time></dd></div>
                <div><dt>Expiry date</dt><dd><time dateTime={strike.expiresAt}>{formatCentralDateTime(strike.expiresAt)}</time></dd></div>
                <div><dt>Standing when issued</dt><dd>{strike.standing}</dd></div>
              </dl>
              {strike.details && <p>{strike.details}</p>}
            </article>
          ))}
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
