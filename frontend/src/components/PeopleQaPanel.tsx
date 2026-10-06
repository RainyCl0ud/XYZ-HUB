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

type StrikeHistoryRecord = {
  id: string;
  status:
    | "ACTIVE"
    | "EXPIRED"
    | "VOIDED";
  reasonNameSnapshot: string;
  issuedAt: string;
  issuedByNameSnapshot: string;
  standingLabelSnapshot: string;
  deductionPercentSnapshot: number;
  activeStrikeCountAfterIssue: number;
  sourceIncidentId: string | null;
};

type DisciplinaryHistory = {
  records: StrikeHistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};

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
  disciplinaryHistory:
    DisciplinaryHistory | null;
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

  const [
    strikeHistoryPage,
    setStrikeHistoryPage,
  ] =
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
              `/api/people/${personId}/qa?page=${historyPage}&strikePage=${strikeHistoryPage}`
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

            const resolvedStrikePage =
              response.qa
                ?.disciplinaryHistory
                ?.page ??
              1;

            setStrikeHistoryPage(
              (
                current
              ) =>
                current ===
                resolvedStrikePage
                  ? current
                  : resolvedStrikePage
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
      strikeHistoryPage,
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

          {qa.disciplinaryHistory && (
            <>
              <div className="people-qa-history-heading">
                <div>
                  <span className="people-section-label">
                    Disciplinary history
                  </span>

                  <strong>
                    Strike History
                  </strong>
                </div>

                <span>
                  {qa.disciplinaryHistory.total} total
                </span>
              </div>

              {qa.disciplinaryHistory.records.length ===
              0 ? (
                <div className="people-qa-empty compact">
                  No Strike records recorded.
                </div>
              ) : (
                <div className="people-qa-history-list">
                  {qa.disciplinaryHistory.records.map(
                    (
                      strike
                    ) => (
                      <button
                        key={
                          strike.id
                        }
                        type="button"
                        className="people-qa-incident-row"
                        onClick={() =>
                          navigate(
                            `/strikes?strikeId=${encodeURIComponent(
                              strike.id
                            )}`
                          )
                        }
                      >
                        <span className="people-qa-incident-main">
                          <strong>
                            {
                              strike.reasonNameSnapshot
                            }
                          </strong>

                          <small>
                            {
                              strike.standingLabelSnapshot
                            }
                            {" · "}
                            {formatPercent(
                              strike.deductionPercentSnapshot
                            )}
                            % deduction
                            {" · "}
                            {formatCentralDateTime(
                              strike.issuedAt
                            )}
                            {" · "}
                            by{" "}
                            {
                              strike.issuedByNameSnapshot
                            }
                          </small>
                        </span>

                        <span className="people-qa-incident-status">
                          {strike.status ===
                          "ACTIVE"
                            ? "Active"
                            : strike.status ===
                                "EXPIRED"
                              ? "Expired"
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

              {qa.disciplinaryHistory.pageCount >
                1 && (
                <div
                  className="qa-history-pagination"
                  aria-label="Employee disciplinary history pagination"
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setStrikeHistoryPage(
                        (
                          current
                        ) =>
                          Math.max(
                            1,
                            current - 1
                          )
                      )
                    }
                    disabled={
                      loading ||
                      qa.disciplinaryHistory.page <=
                        1
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page{" "}
                    {qa.disciplinaryHistory.page}{" "}
                    of{" "}
                    {
                      qa.disciplinaryHistory
                        .pageCount
                    }
                  </span>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setStrikeHistoryPage(
                        (
                          current
                        ) =>
                          Math.min(
                            qa.disciplinaryHistory
                              ?.pageCount ??
                              1,
                            current + 1
                          )
                      )
                    }
                    disabled={
                      loading ||
                      qa.disciplinaryHistory.page >=
                        qa.disciplinaryHistory
                          .pageCount
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </>
          )}

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
