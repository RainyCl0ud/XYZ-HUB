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
  formatCentralDateParts,
  formatCentralDateTime,
  formatCentralShortDate,
} from "../lib/time";

import {
  incidentStatusLabel,
} from "../lib/incident-status";

import {
  strikeStatusLabel,
} from "../lib/strike-status";

import {
  ProfilePhonePager,
  ProfilePhoneTable,
  ProfilePhoneTiles,
} from "./ProfilePhoneViews";

import type {
  ProfilePhoneTone,
} from "./ProfilePhoneViews";


type PeopleRecordView =
  | "qa"
  | "strikes";


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
  records:
    StrikeHistoryRecord[];
  total: number;
  page: number;
  pageSize: number;
  pageCount: number;
};


type QaSummary = {
  chatter:
    | {
        id: string;
        name: string;
        status:
          | "ACTIVE"
          | "INACTIVE";
      }
    | null;

  canViewQaHistory:
    boolean;

  canViewStrikeHistory:
    boolean;

  strikeSummary:
    | {
        activeStrikeCount: number;
        standingLabel: string;
        deductionPercent: number;
        nextExpiryAt:
          string |
          null;
        ladderVersionId: string;
        ladderVersion: number;
      }
    | null;

  recentIncidents: Array<{
    id: string;
    ruleTitleSnapshot: string;
    severityNameSnapshot:
      string |
      null;
    weightNameSnapshot:
      string |
      null;
    weightValueSnapshot:
      number |
      null;
    occurredAt: string;
    status:
      | "OPEN"
      | "RESOLVED"
      | "VOIDED";
  }>;

  disciplinaryHistory:
    DisciplinaryHistory |
    null;

  totalIncidentCount: number;
  historyPage: number;
  historyPageSize: number;
  historyPageCount: number;
};


type QaSummaryResponse = {
  qa:
    QaSummary |
    null;
};


function formatPercent(
  value:
    number
) {
  return Number.isInteger(
    value
  )
    ? String(
        value
      )
    : value
        .toFixed(
          2
        )
        .replace(
          /0+$/,
          ""
        )
        .replace(
          /\.$/,
          ""
        );
}


function formatIncidentStatus(
  status:
    "OPEN" |
    "RESOLVED" |
    "VOIDED"
) {
  if (
    status ===
      "OPEN"
  ) {
    return "Open";
  }

  if (
    status ===
      "RESOLVED"
  ) {
    return "Resolved";
  }

  return "Voided";
}


function formatStrikeStatus(
  status:
    "ACTIVE" |
    "EXPIRED" |
    "VOIDED"
) {
  if (
    status ===
      "ACTIVE"
  ) {
    return "Active";
  }

  if (
    status ===
      "EXPIRED"
  ) {
    return "Expired";
  }

  return "Voided";
}


// Phones: Active / Open read strongest, Expired / Resolved grey, Voided dim.
function recordTone(
  status:
    | "ACTIVE"
    | "EXPIRED"
    | "OPEN"
    | "RESOLVED"
    | "VOIDED"
): ProfilePhoneTone {
  if (
    status === "ACTIVE" ||
    status === "OPEN"
  ) {
    return "strong";
  }

  return status === "VOIDED"
    ? "dim"
    : "muted";
}


export default function PeopleQaPanel({
  personId,
  view,
  layout = "desktop",
}: {
  personId: string;
  view:
    PeopleRecordView;
  /** Phones get plain lists in place of the cards and table. */
  layout?:
    | "phone"
    | "desktop";
}) {
  const navigate =
    useNavigate();

  const [
    qa,
    setQa,
  ] =
    useState<
      QaSummary |
      null
    >(
      null
    );

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const [
    historyPage,
    setHistoryPage,
  ] =
    useState(
      1
    );

  const [
    strikeHistoryPage,
    setStrikeHistoryPage,
  ] =
    useState(
      1
    );


  useEffect(
    () => {
      let active =
        true;

      async function load() {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const requestedQaPage =
            view === "qa"
              ? historyPage
              : 1;

          const requestedStrikePage =
            view === "strikes"
              ? strikeHistoryPage
              : 1;

          const response =
            await apiRequest<
              QaSummaryResponse
            >(
              `/api/people/${encodeURIComponent(
                personId
              )}/qa?page=${requestedQaPage}&strikePage=${requestedStrikePage}`
            );

          if (
            !active
          ) {
            return;
          }

          if (
            view === "qa"
          ) {
            const resolvedPage =
              response.qa
                ?.historyPage ??
              1;

            setHistoryPage(
              (
                current
              ) =>
                current ===
                resolvedPage
                  ? current
                  : resolvedPage
            );
          }

          if (
            view ===
              "strikes"
          ) {
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
          }

          setQa(
            response.qa
          );
        } catch (
          loadError
        ) {
          if (
            active
          ) {
            setQa(
              null
            );

            setError(
              loadError instanceof
                Error
                ? loadError.message
                : `Unable to load employee ${view === "qa" ? "QA" : "Strike"} records.`
            );
          }
        } finally {
          if (
            active
          ) {
            setLoading(
              false
            );
          }
        }
      }

      void load();

      return () => {
        active =
          false;
      };
    },
    [
      personId,
      view,
      historyPage,
      strikeHistoryPage,
    ]
  );


  if (
    loading
  ) {
    return (
      <div className="people-qa-empty">
        Loading{" "}
        {view === "qa"
          ? "QA"
          : "Strike"}{" "}
        records...
      </div>
    );
  }


  if (
    error
  ) {
    return (
      <div className="people-qa-empty">
        <strong>
          Unable to load records
        </strong>

        <span>
          {error}
        </span>
      </div>
    );
  }


  if (
    !qa
  ) {
    return (
      <div className="people-qa-empty">
        <strong>
          Unable to load records
        </strong>

        <span>
          Employee history data is unavailable.
        </span>
      </div>
    );
  }


  if (
    view ===
      "qa"
  ) {
    if (
      !qa.canViewQaHistory
    ) {
      return (
        <div className="people-qa-empty">
          <strong>
            QA history unavailable
          </strong>

          <span>
            You do not have permission to view this employee's QA history.
          </span>
        </div>
      );
    }

    if (
      !qa.chatter
    ) {
      return (
        <div className="people-qa-empty">
          <strong>
            QA profile unavailable
          </strong>

          <span>
            This employee does not currently have a linked QA profile.
          </span>
        </div>
      );
    }

    if (
      layout === "phone"
    ) {
      return (
        <div className="people-profile-phone-tab">
          <ProfilePhoneTiles
            tiles={[
              {
                label: "Total incidents",
                value: qa.totalIncidentCount,
              },
              {
                label: "QA profile",
                value:
                  qa.chatter.status === "ACTIVE"
                    ? "Active"
                    : "Inactive",
              },
            ]}
          />

          <ProfilePhoneTable
            title="QA history"
            total={qa.totalIncidentCount}
            columns={[
              "QA record",
              "Date",
              "Status",
            ]}
            emptyText="No QA records yet."
            rows={qa.recentIncidents.map(
              (incident) => ({
                id: incident.id,
                title: incident.ruleTitleSnapshot,
                meta: [
                  incident.severityNameSnapshot,
                  incident.weightNameSnapshot,
                ]
                  .filter(Boolean)
                  .join(" · "),
                date: formatCentralShortDate(
                  incident.occurredAt
                ),
                status: incidentStatusLabel(
                  incident.status
                ),
                tone: recordTone(
                  incident.status
                ),
              })
            )}
            onOpen={(id) =>
              navigate(
                `/incidents?incidentId=${encodeURIComponent(
                  id
                )}`
              )
            }
          />

          <ProfilePhonePager
            label="Employee QA history pages"
            page={qa.historyPage}
            pageCount={Math.max(
              1,
              qa.historyPageCount
            )}
            disabled={loading}
            onPrevious={() =>
              setHistoryPage(
                (current) =>
                  Math.max(
                    1,
                    current - 1
                  )
              )
            }
            onNext={() =>
              setHistoryPage(
                (current) =>
                  Math.min(
                    Math.max(
                      1,
                      qa.historyPageCount
                    ),
                    current + 1
                  )
              )
            }
          />
        </div>
      );
    }

    return (
      <section className="people-detail-section people-qa-section people-tab-record-section">
        <div className="people-detail-section-heading">
          <div>
            <span className="people-section-label">
              QA
            </span>

            <h4>
              QA History
            </h4>

            <p>
              Centralized QA incidents and records linked to this employee.
            </p>
          </div>
        </div>


        <div className="people-tab-summary-grid compact">
          <div>
            <span>
              Total incidents
            </span>

            <strong>
              {qa.totalIncidentCount}
            </strong>
          </div>

          <div>
            <span>
              QA profile
            </span>

            <strong>
              {qa.chatter.status ===
                "ACTIVE"
                ? "Active"
                : "Inactive"}
            </strong>
          </div>
        </div>


        {qa.recentIncidents.length ===
        0 ? (
          <div className="people-qa-empty compact">
            <strong>
              No QA history
            </strong>

            <span>
              This employee does not have any QA records yet.
            </span>
          </div>
        ) : (
          <div className="table-wrapper people-profile-table-wrapper">
            <table className="data-table people-profile-history-table">
              <thead>
                <tr>
                  <th>
                    QA Record
                  </th>

                  <th>
                    Severity / Weight
                  </th>

                  <th>
                    Occurred
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Action
                  </th>
                </tr>
              </thead>

              <tbody>
                {qa.recentIncidents.map(
                  (
                    incident
                  ) => (
                    <tr
                      key={
                        incident.id
                      }
                    >
                      <td>
                        <strong>
                          {incident.ruleTitleSnapshot}
                        </strong>
                      </td>

                      <td>
                        <span>
                          {incident.severityNameSnapshot ??
                            "No severity"}
                          {" / "}
                          {incident.weightNameSnapshot ??
                            "No weight"}
                        </span>
                      </td>

                      <td>
                        {formatCentralDateTime(
                          incident.occurredAt
                        )}
                      </td>

                      <td>
                        <span className="people-neutral-status">
                          {formatIncidentStatus(
                            incident.status
                          )}
                        </span>
                      </td>

                      <td>
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            navigate(
                              `/incidents?incidentId=${encodeURIComponent(
                                incident.id
                              )}`
                            )
                          }
                        >
                          View
                        </button>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}


        <div
          className="compact-table-pagination"
          aria-label="Employee QA history pagination"
        >
          <span>
            {qa.totalIncidentCount} total records
          </span>

          <div>
            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setHistoryPage(
                  (
                    current
                  ) =>
                    Math.max(
                      1,
                      current -
                        1
                    )
                )
              }
              disabled={
                loading ||
                qa.historyPage <=
                  1
              }
            >
              Previous
            </button>

            <strong>
              Page {qa.historyPage} of{" "}
              {Math.max(
                1,
                qa.historyPageCount
              )}
            </strong>

            <button
              type="button"
              className="secondary-button"
              onClick={() =>
                setHistoryPage(
                  (
                    current
                  ) =>
                    Math.min(
                      Math.max(
                        1,
                        qa.historyPageCount
                      ),
                      current +
                        1
                    )
                )
              }
              disabled={
                loading ||
                qa.historyPage >=
                  Math.max(
                    1,
                    qa.historyPageCount
                  )
              }
            >
              Next
            </button>
          </div>
        </div>
      </section>
    );
  }


  if (
    !qa.canViewStrikeHistory ||
    !qa.strikeSummary
  ) {
    return (
      <div className="people-qa-empty">
        <strong>
          Strike history unavailable
        </strong>

        <span>
          You do not have permission to view this employee's Strike history.
        </span>
      </div>
    );
  }


  const history =
    qa.disciplinaryHistory;


  if (
    !history
  ) {
    return (
      <div className="people-qa-empty">
        <strong>
          Strike history unavailable
        </strong>

        <span>
          Strike history is not available for this employee.
        </span>
      </div>
    );
  }


  if (
    layout === "phone"
  ) {
    const summary =
      qa.strikeSummary;

    const pageCount =
      Math.max(
        1,
        history.pageCount
      );

    const nextExpiry =
      formatCentralDateParts(
        summary.nextExpiryAt
      );

    return (
      <div className="people-profile-phone-tab">
        <ProfilePhoneTiles
          tiles={[
            {
              label: "Current standing",
              value: summary.standingLabel,
              note: `Ladder v${summary.ladderVersion}`,
            },
            {
              label: "Active strikes",
              value: summary.activeStrikeCount,
            },
            {
              label: "Current deduction",
              value: `${formatPercent(
                summary.deductionPercent
              )}%`,
            },
            {
              label: "Next expiry",
              value:
                summary.nextExpiryAt &&
                nextExpiry
                  ? formatCentralShortDate(
                      summary.nextExpiryAt
                    )
                  : "—",
              note: nextExpiry?.time,
            },
          ]}
        />

        <ProfilePhoneTable
          title="Strike history"
          total={history.total}
          columns={[
            "Reason",
            "Issued",
            "Status",
          ]}
          emptyText="No strikes yet."
          rows={history.records.map(
            (strike) => ({
              id: strike.id,
              title: strike.reasonNameSnapshot,
              meta: `${strike.standingLabelSnapshot} · ${formatPercent(
                strike.deductionPercentSnapshot
              )}%`,
              date: formatCentralShortDate(
                strike.issuedAt
              ),
              status: strikeStatusLabel(
                strike.status
              ),
              tone: recordTone(
                strike.status
              ),
            })
          )}
          onOpen={(id) =>
            navigate(
              `/strikes?strikeId=${encodeURIComponent(
                id
              )}`
            )
          }
        />

        <ProfilePhonePager
          label="Employee Strike history pages"
          page={history.page}
          pageCount={pageCount}
          disabled={loading}
          onPrevious={() =>
            setStrikeHistoryPage(
              (current) =>
                Math.max(
                  1,
                  current - 1
                )
            )
          }
          onNext={() =>
            setStrikeHistoryPage(
              (current) =>
                Math.min(
                  pageCount,
                  current + 1
                )
            )
          }
        />
      </div>
    );
  }

  return (
    <section className="people-detail-section people-qa-section people-tab-record-section">
      <div className="people-detail-section-heading">
        <div>
          <span className="people-section-label">
            Strikes
          </span>

          <h4>
            Disciplinary Standing
          </h4>

          <p>
            Current standing and historical Strike records for this employee.
          </p>
        </div>
      </div>


      <div className="people-tab-summary-grid">
        <div className="primary">
          <span>
            Current standing
          </span>

          <strong>
            {qa.strikeSummary.standingLabel}
          </strong>

          <small>
            Ladder v
            {qa.strikeSummary.ladderVersion}
          </small>
        </div>

        <div>
          <span>
            Active Strikes
          </span>

          <strong>
            {qa.strikeSummary.activeStrikeCount}
          </strong>
        </div>

        <div>
          <span>
            Current deduction
          </span>

          <strong>
            {formatPercent(
              qa.strikeSummary.deductionPercent
            )}
            %
          </strong>
        </div>

        <div>
          <span>
            Next expiry
          </span>

          <strong>
            {qa.strikeSummary.nextExpiryAt
              ? formatCentralDateTime(
                  qa.strikeSummary.nextExpiryAt
                )
              : "-"}
          </strong>
        </div>
      </div>


      {history.records.length ===
        0 ? (
        <div className="people-qa-empty compact">
          <strong>
            No strike history
          </strong>

          <span>
            This employee does not have any strike records yet.
          </span>
        </div>
      ) : (
        <div className="table-wrapper people-profile-table-wrapper">
          <table className="data-table people-profile-history-table">
            <thead>
              <tr>
                <th>
                  Reason
                </th>

                <th>
                  Standing
                </th>

                <th>
                  Issued
                </th>

                <th>
                  Status
                </th>

                <th>
                  Action
                </th>
              </tr>
            </thead>

            <tbody>
              {history.records.map(
                (
                  strike
                ) => (
                  <tr
                    key={
                      strike.id
                    }
                  >
                    <td>
                      <strong>
                        {strike.reasonNameSnapshot}
                      </strong>
                    </td>

                    <td>
                      <span>
                        {strike.standingLabelSnapshot}
                        {" / "}
                        {formatPercent(
                          strike.deductionPercentSnapshot
                        )}
                        % deduction
                      </span>
                    </td>

                    <td>
                      <span>
                        {formatCentralDateTime(
                          strike.issuedAt
                        )}
                      </span>

                      <small>
                        by {strike.issuedByNameSnapshot}
                      </small>
                    </td>

                    <td>
                      <span className="people-neutral-status">
                        {formatStrikeStatus(
                          strike.status
                        )}
                      </span>
                    </td>

                    <td>
                      <button
                        type="button"
                        className="text-button"
                        onClick={() =>
                          navigate(
                            `/strikes?strikeId=${encodeURIComponent(
                              strike.id
                            )}`
                          )
                        }
                      >
                        View
                      </button>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>
      )}


      <div
        className="compact-table-pagination"
        aria-label="Employee Strike history pagination"
      >
        <span>
          {history?.total ??
            0} total records
        </span>

        <div>
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
                    current -
                      1
                  )
              )
            }
            disabled={
              loading ||
              (history?.page ??
                1) <=
                1
            }
          >
            Previous
          </button>

          <strong>
            Page {history?.page ??
              1} of{" "}
            {Math.max(
              1,
              history?.pageCount ??
                1
            )}
          </strong>

          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              setStrikeHistoryPage(
                (
                  current
                ) =>
                  Math.min(
                    Math.max(
                      1,
                      history
                        ?.pageCount ??
                        1
                    ),
                    current +
                      1
                  )
              )
            }
            disabled={
              loading ||
              (history?.page ??
                1) >=
                Math.max(
                  1,
                  history
                    ?.pageCount ??
                    1
                )
            }
          >
            Next
          </button>
        </div>
      </div>
    </section>
  );
}
