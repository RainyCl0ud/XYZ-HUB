import {
  useEffect,
  useState,
} from "react";

import {
  useNavigate,
} from "react-router-dom";

import {
  apiRequest,
} from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";

type QaSummary = {
  chatter: {
    id: string;
    name: string;
    status: "ACTIVE" | "INACTIVE";
  };
  strikeSummary: {
    activeStrikeCount: number;
    standingLabel: string;
    deductionPercent: number;
    nextExpiryAt: string | null;
    ladderVersionId: string;
    ladderVersion: number;
  };
  recentIncidents: Array<{
    id: string;
    ruleTitleSnapshot: string;
    severityNameSnapshot: string | null;
    weightNameSnapshot: string | null;
    weightValueSnapshot: number | null;
    occurredAt: string;
    status: "OPEN" | "RESOLVED" | "VOIDED";
  }>;
  totalIncidentCount: number;
  historyPage: number;
  historyPageSize: number;
  historyPageCount: number;
};

type QaSummaryResponse = {
  qa: QaSummary | null;
};

function formatPercent(
  value: number
) {
  return Number.isInteger(
    value
  )
    ? String(value)
    : value
        .toFixed(2)
        .replace(/0+$/, "")
        .replace(/\.$/, "");
}

export default function PeopleQaPanel({
  personId,
}: {
  personId: string;
}) {
  const navigate =
    useNavigate();

  const [qa, setQa] =
    useState<QaSummary | null>(
      null
    );
  const [loading, setLoading] =
    useState(true);
  const [error, setError] =
    useState("");
  const [historyPage, setHistoryPage] =
    useState(1);

  useEffect(
    () => {
      let active = true;

      async function load() {
        try {
          setLoading(true);
          setError("");

          const response =
            await apiRequest<QaSummaryResponse>(
              `/api/people/${personId}/qa?page=${historyPage}`
            );

          if (active) {
            const resolvedPage =
              response.qa?.historyPage ??
              1;

            setHistoryPage(
              (current) =>
                current === resolvedPage
                  ? current
                  : resolvedPage
            );

            setQa(
              response.qa
            );
          }
        } catch (loadError) {
          if (active) {
            setQa(null);
            setError(
              loadError instanceof Error
                ? loadError.message
                : "Unable to load disciplinary standing."
            );
          }
        } finally {
          if (active) {
            setLoading(false);
          }
        }
      }

      void load();

      return () => {
        active = false;
      };
    },
    [
      personId,
      historyPage,
    ]
  );

  return (
    <section className="people-detail-section people-qa-section">
      <div className="people-detail-section-heading">
        <div>
          <span className="people-section-label">
            Disciplinary standing
          </span>
          <h4>
            Current Standing
          </h4>
        </div>
      </div>

      {loading ? (
        <div className="people-qa-empty">
          Loading disciplinary standing…
        </div>
      ) : error ? (
        <div className="people-inline-error">
          {error}
        </div>
      ) : !qa ? (
        <div className="people-qa-empty">
          <strong>
            Not applicable
          </strong>
          <span>
            This employee does not currently have a linked Chatter or Trial Chatter QA profile.
          </span>
        </div>
      ) : (
        <>
          <div className="people-qa-standing-grid">
            <div className="people-qa-standing-card primary">
              <span>
                Current Standing
              </span>
              <strong>
                {
                  qa.strikeSummary.standingLabel
                }
              </strong>
              <small>
                Ladder v
                {
                  qa.strikeSummary.ladderVersion
                }
              </small>
            </div>

            <div className="people-qa-standing-card">
              <span>
                Active Strikes
              </span>
              <strong>
                {
                  qa.strikeSummary.activeStrikeCount
                }
              </strong>
            </div>

            <div className="people-qa-standing-card">
              <span>
                Current Deduction
              </span>
              <strong>
                {formatPercent(
                  qa.strikeSummary.deductionPercent
                )}
                %
              </strong>
            </div>

            <div className="people-qa-standing-card">
              <span>
                Next Expiry
              </span>
              <strong>
                {qa.strikeSummary.nextExpiryAt
                  ? formatCentralDateTime(
                      qa.strikeSummary.nextExpiryAt
                    )
                  : "—"}
              </strong>
            </div>
          </div>

          <div className="people-qa-history-heading">
            <div>
              <span className="people-section-label">
                QA history
              </span>
              <strong>
                Incident History
              </strong>
            </div>
            <span>
              {qa.totalIncidentCount} total
            </span>
          </div>

          {qa.recentIncidents.length ===
          0 ? (
            <div className="people-qa-empty compact">
              No incidents recorded.
            </div>
          ) : (
            <div className="people-qa-history-list">
              {qa.recentIncidents.map(
                (incident) => (
                  <button
                    key={
                      incident.id
                    }
                    type="button"
                    className="people-qa-incident-row"
                    onClick={() =>
                      navigate(
                        `/incidents?incidentId=${encodeURIComponent(
                          incident.id
                        )}`
                      )
                    }
                  >
                    <span className="people-qa-incident-main">
                      <strong>
                        {
                          incident.ruleTitleSnapshot
                        }
                      </strong>
                      <small>
                        {incident.severityNameSnapshot ??
                          "No severity"}
                        {" · "}
                        {formatCentralDateTime(
                          incident.occurredAt
                        )}
                      </small>
                    </span>

                    <span className="people-qa-incident-status">
                      {incident.status === "OPEN"
                        ? "Open"
                        : incident.status === "RESOLVED"
                          ? "Resolved"
                          : "Voided"}
                    </span>

                    <span
                      className="people-qa-incident-arrow"
                      aria-hidden="true"
                    >
                      →
                    </span>
                  </button>
                )
              )}
            </div>
          )}

          {qa.historyPageCount > 1 && (
            <div className="qa-history-pagination" aria-label="Employee QA history pagination">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setHistoryPage(
                    (current) =>
                      Math.max(
                        1,
                        current - 1
                      )
                  )
                }
                disabled={
                  loading ||
                  qa.historyPage <= 1
                }
              >
                Previous
              </button>

              <span>
                Page {qa.historyPage} of {qa.historyPageCount}
              </span>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setHistoryPage(
                    (current) =>
                      Math.min(
                        qa.historyPageCount,
                        current + 1
                      )
                  )
                }
                disabled={
                  loading ||
                  qa.historyPage >=
                    qa.historyPageCount
                }
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
