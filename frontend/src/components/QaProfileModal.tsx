import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  apiRequest,
} from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";


type IncidentStatus =
  | "OPEN"
  | "RESOLVED"
  | "VOIDED";

type StrikeSummary = {
  activeStrikeCount: number;
  standingLabel: string;
  deductionPercent: number;
  nextExpiryAt: string | null;
  ladderVersionId: string;
  ladderVersion: number;
};

type ChatterDetail = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
  createdAt: string;
  strikeSummary: StrikeSummary;
};

type QaIncident = {
  id: string;
  ruleTitleSnapshot: string;
  severityNameSnapshot: string | null;
  occurredAt: string;
  status: IncidentStatus;
};

type ChatterDetailResponse = {
  data: ChatterDetail;
};

type IncidentListResponse = {
  data: QaIncident[];
};

type Props = {
  chatterId: string;
  onClose: () => void;
  onOpenIncident?: (
    incidentId: string
  ) => void;
};

const HISTORY_PAGE_SIZE = 5;

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

function formatStatus(
  status: IncidentStatus
) {
  if (
    status === "OPEN"
  ) {
    return "Open";
  }

  if (
    status === "RESOLVED"
  ) {
    return "Resolved";
  }

  return "Voided";
}

export default function QaProfileModal({
  chatterId,
  onClose,
  onOpenIncident,
}: Props) {
  const [
    chatter,
    setChatter,
  ] = useState<ChatterDetail | null>(
    null
  );
  const [
    incidents,
    setIncidents,
  ] = useState<QaIncident[]>([]);
  const [
    loading,
    setLoading,
  ] = useState(true);
  const [
    error,
    setError,
  ] = useState("");
  const [
    historyPage,
    setHistoryPage,
  ] = useState(1);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        setLoading(true);
        setError("");
        setHistoryPage(1);

        const [
          chatterResponse,
          incidentResponse,
        ] = await Promise.all([
          apiRequest<ChatterDetailResponse>(
            `/api/chatters/${encodeURIComponent(
              chatterId
            )}`
          ),
          apiRequest<IncidentListResponse>(
            `/api/incidents?chatterId=${encodeURIComponent(
              chatterId
            )}`
          ),
        ]);

        if (!active) {
          return;
        }

        setChatter(
          chatterResponse.data
        );
        setIncidents(
          incidentResponse.data
        );
      } catch (loadError) {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load QA profile."
        );
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
  }, [chatterId]);

  const historyPageCount =
    Math.max(
      1,
      Math.ceil(
        incidents.length /
        HISTORY_PAGE_SIZE
      )
    );

  const visibleIncidents =
    useMemo(() => {
      const start =
        (historyPage - 1) *
        HISTORY_PAGE_SIZE;

      return incidents.slice(
        start,
        start +
          HISTORY_PAGE_SIZE
      );
    }, [
      incidents,
      historyPage,
    ]);

  return (
    <div
      className="modal-backdrop qa-profile-overlay"
      onMouseDown={
        onClose
      }
    >
      <div
        className="modal chatter-profile-modal qa-profile-modal"
        onMouseDown={(event) =>
          event.stopPropagation()
        }
      >
        <div className="chatter-profile-header">
          <div className="chatter-profile-identity">
            <div>
              <div className="chatter-profile-title-row">
                <h3>
                  {chatter?.name ??
                    "QA Profile"}
                </h3>

                {chatter && (
                  <span
                    className={
                      chatter.status ===
                      "ACTIVE"
                        ? "status-badge active"
                        : "status-badge inactive"
                    }
                  >
                    {chatter.status ===
                    "ACTIVE"
                      ? "Active"
                      : "Inactive"}
                  </span>
                )}
              </div>

              <p>
                QA profile and incident history
              </p>
            </div>
          </div>

          <button
            type="button"
            className="modal-close"
            onClick={
              onClose
            }
            aria-label="Close QA profile"
          >
            ×
          </button>
        </div>

        <div className="chatter-profile-content">
          {loading ? (
            <div className="chatter-profile-loading">
              Loading QA profile...
            </div>
          ) : error ? (
            <div className="alert alert-error">
              {error}
            </div>
          ) : chatter ? (
            <>
              <section className="chatter-profile-section chatter-standing-section">
                <div className="chatter-profile-section-heading">
                  <div>
                    <span>
                      Strike Standing
                    </span>
                    <h4>
                      Current Standing
                    </h4>
                  </div>

                  <span className="chatter-ladder-version-badge">
                    Ladder v
                    {
                      chatter.strikeSummary.ladderVersion
                    }
                  </span>
                </div>

                <div className="chatter-standing-panel">
                  <div className="chatter-standing-primary">
                    <span>
                      Current Standing
                    </span>
                    <strong>
                      {
                        chatter.strikeSummary.standingLabel
                      }
                    </strong>
                    <p>
                      Based on{" "}
                      {
                        chatter.strikeSummary.activeStrikeCount
                      }{" "}
                      active{" "}
                      {chatter.strikeSummary.activeStrikeCount ===
                      1
                        ? "strike"
                        : "strikes"}
                      .
                    </p>
                  </div>

                  <div className="chatter-standing-metrics">
                    <div className="chatter-standing-metric">
                      <span>
                        Active Strikes
                      </span>
                      <strong>
                        {
                          chatter.strikeSummary.activeStrikeCount
                        }
                      </strong>
                    </div>

                    <div className="chatter-standing-metric">
                      <span>
                        Commission Deduction
                      </span>
                      <strong>
                        {formatPercent(
                          chatter.strikeSummary.deductionPercent
                        )}
                        %
                      </strong>
                    </div>

                    <div className="chatter-standing-metric chatter-standing-next-expiry">
                      <span>
                        Next Expiry
                      </span>
                      <strong>
                        {chatter.strikeSummary.nextExpiryAt
                          ? formatCentralDateTime(
                              chatter.strikeSummary.nextExpiryAt
                            )
                          : "—"}
                      </strong>
                    </div>
                  </div>
                </div>
              </section>

              <section className="chatter-profile-section">
                <div className="chatter-profile-section-heading">
                  <div>
                    <span>
                      QA History
                    </span>
                    <h4>
                      Incident History
                    </h4>
                  </div>

                  <span className="qa-history-count">
                    {incidents.length} total
                  </span>
                </div>

                {visibleIncidents.length ===
                0 ? (
                  <div className="chatter-profile-empty">
                    <strong>
                      No incidents recorded
                    </strong>
                  </div>
                ) : (
                  <div className="people-qa-history-list">
                    {visibleIncidents.map(
                      (incident) => (
                        <button
                          key={
                            incident.id
                          }
                          type="button"
                          className="people-qa-incident-row"
                          onClick={() =>
                            onOpenIncident?.(
                              incident.id
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
                            {formatStatus(
                              incident.status
                            )}
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

                {historyPageCount > 1 && (
                  <div className="qa-history-pagination">
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
                        historyPage <= 1
                      }
                    >
                      Previous
                    </button>

                    <span>
                      Page {historyPage} of {historyPageCount}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPage(
                          (current) =>
                            Math.min(
                              historyPageCount,
                              current + 1
                            )
                        )
                      }
                      disabled={
                        historyPage >=
                        historyPageCount
                      }
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
