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

type AuditEvent = {
  id: string;
  occurredAt: string;
  action: string;
  success: boolean;
  statusCode: number;
  actorUserId: string | null;
  actorLabel: string | null;
  targetType: string | null;
  targetId: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata: Record<string, unknown> | null;
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

function formatAction(
  value:
    string
) {
  return value
    .replace(
      /[._]/g,
      " "
    )
    .replace(
      /\b\w/g,
      (
        character
      ) =>
        character.toUpperCase()
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
    knownActions,
    setKnownActions,
  ] =
    useState<
      string[]
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
    useState<SuccessFilter>(
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
            await apiRequest<AuditResponse>(
              `/api/audit?${params.toString()}`
            );

          setEvents(
            response.events
          );

          setKnownActions(
            (
              current
            ) =>
              [
                ...new Set([
                  ...current,
                  ...response.events.map(
                    (
                      event
                    ) =>
                      event.action
                  ),
                ]),
              ].sort()
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

  const actionOptions =
    knownActions;

  return (
    <div className="page audit-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Login Gate
          </p>

          <h2>
            Audit Log
          </h2>

          <p className="page-description">
            Read-only security and access history. Times are displayed in US Central time.
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
          placeholder="Search actor, action, target or metadata"
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

          {actionOptions.map(
            (
              item
            ) => (
              <option
                key={
                  item
                }
                value={
                  item
                }
              >
                {formatAction(
                  item
                )}
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
          Append-only
        </strong>

        <span>
          XYZ Hub exposes no edit or delete action for audit entries.
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
                Actor
              </span>
              <span>
                Target
              </span>
              <span>
                Result
              </span>
              <span>
                Details
              </span>
            </div>

            {events.map(
              (
                event
              ) => (
                <div
                  key={
                    event.id
                  }
                  className="audit-table audit-table-row"
                >
                  <span className="audit-time">
                    {formatCentralDateTime(
                      event.occurredAt
                    )}
                  </span>

                  <span>
                    <strong className="audit-action">
                      {formatAction(
                        event.action
                      )}
                    </strong>

                    <small className="audit-code">
                      {event.action}
                    </small>
                  </span>

                  <span className="audit-muted">
                    {event.actorLabel ??
                      event.actorUserId ??
                      "System / unknown"}
                  </span>

                  <span className="audit-muted">
                    {event.targetType
                      ? `${event.targetType}${
                          event.targetId
                            ? ` · ${event.targetId}`
                            : ""
                        }`
                      : "—"}
                  </span>

                  <span>
                    <span
                      className={
                        event.success
                          ? "audit-result success"
                          : "audit-result failed"
                      }
                    >
                      {event.success
                        ? "Success"
                        : `Failed (${event.statusCode})`}
                    </span>
                  </span>

                  <span>
                    {event.metadata ? (
                      <details className="audit-details">
                        <summary>
                          View
                        </summary>

                        <pre>
                          {JSON.stringify(
                            event.metadata,
                            null,
                            2
                          )}
                        </pre>
                      </details>
                    ) : (
                      <span className="audit-muted">
                        —
                      </span>
                    )}
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default AuditPage;
