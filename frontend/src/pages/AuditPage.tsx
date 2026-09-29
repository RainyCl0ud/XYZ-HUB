import {
  useNavigationFilter,
} from "../lib/useNavigationFilter";

import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  apiRequest,
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import "./AuditPage.css";

const CENTRAL_TIME_ZONE =
  "America/Chicago";

type AuditParty = {
  label: string;
  secondary: string | null;
  kind: string | null;
};

type AuditChange = {
  label: string;
  before: string | null;
  after: string | null;
};

type AuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  actionLabel: string;
  success: boolean;
  statusCode: number;
  actor: AuditParty;
  target: AuditParty;
  summary: string;
  changes: AuditChange[];
  source: {
    ipAddress: string | null;
    userAgent: string | null;
  };
};

type AuditResponse = {
  events:
    AuditEvent[];
};

type SuccessFilter =
  | "ALL"
  | "SUCCESS"
  | "FAILED";

function formatCentralDateTime(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        CENTRAL_TIME_ZONE,
      month:
        "short",
      day:
        "numeric",
      year:
        "numeric",
      hour:
        "numeric",
      minute:
        "2-digit",
      second:
        "2-digit",
      timeZoneName:
        "short",
    }
  ).format(
    new Date(
      value
    )
  );
}

function AuditPartyDisplay({
  party,
}: {
  party:
    AuditParty;
}) {
  return (
    <span className="audit-party">
      <strong>
        {party.label}
      </strong>

      {party.secondary && (
        <small>
          {party.secondary}
        </small>
      )}
    </span>
  );
}

function AuditPage() {
  const toast =
    useToast();

  const [
    events,
    setEvents,
  ] =
    useState<
      AuditEvent[]
    >([]);

  const [
    selectedEvent,
    setSelectedEvent,
  ] =
    useState<
      AuditEvent |
      null
    >(
      null
    );

  const [
    knownActions,
    setKnownActions,
  ] =
    useState<
      {
        value:
          string;
        label:
          string;
      }[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [
    action,
    setAction,
  ] =
    useState(
      ""
    );

  const [
    successFilter,
    setSuccessFilter,
  ] =
    useNavigationFilter<
      SuccessFilter
    >(
      "result",
      [
        "ALL",
        "SUCCESS",
        "FAILED",
      ],
      "ALL"
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const loadAudit =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const params =
            new URLSearchParams();

          if (
            search.trim()
          ) {
            params.set(
              "search",
              search.trim()
            );
          }

          if (
            action
          ) {
            params.set(
              "action",
              action
            );
          }

          if (
            successFilter ===
            "SUCCESS"
          ) {
            params.set(
              "success",
              "true"
            );
          }

          if (
            successFilter ===
            "FAILED"
          ) {
            params.set(
              "success",
              "false"
            );
          }

          params.set(
            "limit",
            "300"
          );

          const response =
            await apiRequest<
              AuditResponse
            >(
              "/api/audit?" +
                params.toString()
            );

          setEvents(
            response.events
          );

          setKnownActions(
            (
              current
            ) => {
              const map =
                new Map(
                  current.map(
                    (
                      item
                    ) => [
                      item.value,
                      item.label,
                    ]
                  )
                );

              for (
                const event
                of response.events
              ) {
                map.set(
                  event.action,
                  event.actionLabel
                );
              }

              return [
                ...map.entries(),
              ]
                .map(
                  (
                    [
                      value,
                      label,
                    ]
                  ) => ({
                    value,
                    label,
                  })
                )
                .sort(
                  (
                    first,
                    second
                  ) =>
                    first.label.localeCompare(
                      second.label
                    )
                );
            }
          );

          setSelectedEvent(
            (
              current
            ) =>
              current
                ? response.events.find(
                    (
                      event
                    ) =>
                      event.id ===
                      current.id
                  ) ??
                  current
                : null
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load the audit log.";

          setError(
            message
          );

          toast.error(
            message,
            "Audit Log unavailable"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        action,
        search,
        successFilter,
        toast,
      ]
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void loadAudit();
          },
          180
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      loadAudit,
    ]
  );

  useEffect(
    () => {
      if (
        !selectedEvent
      ) {
        return;
      }

      const previousOverflow =
        document.body.style
          .overflow;

      document.body.style
        .overflow =
        "hidden";

      const handleKeyDown =
        (
          event:
            KeyboardEvent
        ) => {
          if (
            event.key ===
            "Escape"
          ) {
            setSelectedEvent(
              null
            );
          }
        };

      window.addEventListener(
        "keydown",
        handleKeyDown
      );

      return () => {
        document.body.style
          .overflow =
          previousOverflow;

        window.removeEventListener(
          "keydown",
          handleKeyDown
        );
      };
    },
    [
      selectedEvent,
    ]
  );

  return (
    <div className="page audit-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Security history
          </p>

          <h2>
            Audit Log
          </h2>

          <p className="page-description">
            Review account, access, role, and creator changes across the agency. Times are shown in US Central time.
          </p>
        </div>

        <button
          type="button"
          className="secondary-button"
          onClick={() => {
            void loadAudit();
          }}
          disabled={
            loading
          }
        >
          {loading
            ? "Refreshing…"
            : "Refresh"}
        </button>
      </header>

      <section className="content-card audit-toolbar">
        <input
          className="search-input"
          type="search"
          placeholder="Search people, creators, roles or actions"
          aria-label="Search audit log"
          value={
            search
          }
          onChange={(
            event
          ) =>
            setSearch(
              event.target.value
            )
          }
        />

        <select
          aria-label="Filter audit log by action"
          value={
            action
          }
          onChange={(
            event
          ) =>
            setAction(
              event.target.value
            )
          }
        >
          <option value="">
            All actions
          </option>

          {knownActions.map(
            (
              item
            ) => (
              <option
                key={
                  item.value
                }
                value={
                  item.value
                }
              >
                {item.label}
              </option>
            )
          )}
        </select>

        <select
          aria-label="Filter audit log by outcome"
          value={
            successFilter
          }
          onChange={(
            event
          ) =>
            setSuccessFilter(
              event.target.value as SuccessFilter
            )
          }
        >
          <option value="ALL">
            All outcomes
          </option>

          <option value="SUCCESS">
            Successful
          </option>

          <option value="FAILED">
            Failed
          </option>
        </select>
      </section>

      <div className="audit-readonly-note">
        <strong>
          Read-only history
        </strong>

        <span>
          Audit records cannot be edited or deleted.
        </span>
      </div>

      {error && (
        <div className="audit-error">
          {error}
        </div>
      )}

      <section className="content-card audit-list-card">
        {loading ? (
          <div className="empty-state">
            <strong>
              Loading audit events…
            </strong>
          </div>
        ) : events.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching audit events
            </strong>

            <span>
              Security and management actions will appear here as they occur.
            </span>
          </div>
        ) : (
          <div className="audit-table-wrap">
            <div className="audit-table audit-table-head">
              <span>
                Time
              </span>

              <span>
                Action
              </span>

              <span>
                Performed by
              </span>

              <span>
                Affected
              </span>

              <span>
                Result
              </span>
            </div>

            {events.map(
              (
                event
              ) => (
                <button
                  key={
                    event.id
                  }
                  type="button"
                  className="audit-table audit-table-row"
                  onClick={() =>
                    setSelectedEvent(
                      event
                    )
                  }
                  aria-label={
                    "View details for " +
                    event.actionLabel
                  }
                >
                  <span className="audit-time">
                    {formatCentralDateTime(
                      event.occurredAt
                    )}
                  </span>

                  <span>
                    <strong className="audit-action">
                      {event.actionLabel}
                    </strong>

                    <small className="audit-summary">
                      {event.summary}
                    </small>
                  </span>

                  <AuditPartyDisplay
                    party={
                      event.actor
                    }
                  />

                  <AuditPartyDisplay
                    party={
                      event.target
                    }
                  />

                  <span className="audit-result-cell">
                    <span
                      className={
                        event.success
                          ? "audit-result success"
                          : "audit-result failed"
                      }
                    >
                      {event.success
                        ? "Success"
                        : "Failed"}
                    </span>

                    <svg
                      className="audit-row-arrow"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        d="m9 6 6 6-6 6"
                      />
                    </svg>
                  </span>
                </button>
              )
            )}
          </div>
        )}
      </section>

      {selectedEvent && (
        <div
          className="audit-overlay"
          role="presentation"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
              event.currentTarget
            ) {
              setSelectedEvent(
                null
              );
            }
          }}
        >
          <section
            className="audit-detail-panel"
            role="dialog"
            aria-modal="true"
            aria-label={
              selectedEvent.actionLabel +
              " details"
            }
          >
            <div className="audit-detail-header">
              <div>
                <span className="page-eyebrow">
                  Audit details
                </span>

                <h3>
                  {selectedEvent.actionLabel}
                </h3>

                <p>
                  {selectedEvent.summary}
                </p>
              </div>

              <button
                type="button"
                className="audit-close"
                onClick={() =>
                  setSelectedEvent(
                    null
                  )
                }
                aria-label="Close audit details"
              >
                ×
              </button>
            </div>

            <div className="audit-detail-body">
              <div className="audit-detail-facts">
                <div>
                  <span>
                    Performed by
                  </span>

                  <strong>
                    {selectedEvent.actor.label}
                  </strong>

                  {selectedEvent.actor.secondary && (
                    <small>
                      {selectedEvent.actor.secondary}
                    </small>
                  )}
                </div>

                <div>
                  <span>
                    Affected
                  </span>

                  <strong>
                    {selectedEvent.target.label}
                  </strong>

                  {selectedEvent.target.secondary && (
                    <small>
                      {selectedEvent.target.secondary}
                    </small>
                  )}
                </div>

                <div>
                  <span>
                    When
                  </span>

                  <strong>
                    {formatCentralDateTime(
                      selectedEvent.occurredAt
                    )}
                  </strong>
                </div>

                <div>
                  <span>
                    Result
                  </span>

                  <strong
                    className={
                      selectedEvent.success
                        ? "audit-detail-result success"
                        : "audit-detail-result failed"
                    }
                  >
                    {selectedEvent.success
                      ? "Successful"
                      : "Failed"}
                  </strong>

                  {!selectedEvent.success && (
                    <small>
                      Status {selectedEvent.statusCode}
                    </small>
                  )}
                </div>
              </div>

              <section className="audit-detail-section">
                <div className="audit-detail-section-heading">
                  <h4>
                    What changed
                  </h4>

                  <p>
                    Human-readable before and after values recorded for this action.
                  </p>
                </div>

                {selectedEvent.changes.length >
                0 ? (
                  <div className="audit-change-list">
                    {selectedEvent.changes.map(
                      (
                        change
                      ) => (
                        <div
                          key={
                            change.label
                          }
                          className="audit-change-row"
                        >
                          <strong>
                            {change.label}
                          </strong>

                          <div className="audit-change-values">
                            <span>
                              <small>
                                Before
                              </small>

                              {change.before ??
                                "—"}
                            </span>

                            <svg
                              viewBox="0 0 24 24"
                              aria-hidden="true"
                            >
                              <path
                                d="M5 12h14m-5-5 5 5-5 5"
                              />
                            </svg>

                            <span>
                              <small>
                                After
                              </small>

                              {change.after ??
                                "—"}
                            </span>
                          </div>
                        </div>
                      )
                    )}
                  </div>
                ) : (
                  <div className="audit-detail-empty">
                    {selectedEvent.success
                      ? "This event did not record a before-and-after data change."
                      : "The requested action failed, so no data change was applied."}
                  </div>
                )}
              </section>

              <section className="audit-detail-section">
                <div className="audit-detail-section-heading">
                  <h4>
                    Request source
                  </h4>

                  <p>
                    Connection information captured with the audit event.
                  </p>
                </div>

                <div className="audit-source-grid">
                  <div>
                    <span>
                      IP address
                    </span>

                    <strong>
                      {selectedEvent.source.ipAddress ??
                        "Not available"}
                    </strong>
                  </div>

                  <div>
                    <span>
                      Browser / device
                    </span>

                    <strong>
                      {selectedEvent.source.userAgent ??
                        "Not available"}
                    </strong>
                  </div>
                </div>
              </section>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default AuditPage;
