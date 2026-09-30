import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
} from "../lib/api";

import "./DashboardPage.css";

const CENTRAL_TIME_ZONE =
  "America/Chicago";

type IncidentStatus =
  | "OPEN"
  | "RESOLVED"
  | "VOIDED";

type StrikeActivityStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "NOT_APPLICABLE";

type RecentIncident = {
  id: string;
  ruleTitleSnapshot: string;
  severityNameSnapshot: string | null;
  occurredAt: string;
  status: IncidentStatus;
  strikeActivityStatus: StrikeActivityStatus;
  chatter: {
    id: string;
    name: string;
  };
  agencyModel: {
    id: string;
    name: string;
  } | null;
};

type DashboardResponse = {
  data: {
    counts: {
      openIncidents: number;
      resolvedIncidents: number;
      voidedIncidents: number;
      totalIncidents: number;
      activeChatters: number;
      activeRules: number;
    };
    recentIncidents: RecentIncident[];
  };
};

function formatCentralDateTime(
  value: string
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
      hour:
        "numeric",
      minute:
        "2-digit",
    }
  ).format(
    new Date(value)
  );
}

function formatIncidentStatus(
  status: IncidentStatus
) {
  return status
    .toLowerCase()
    .replace(
      /^./,
      (letter) =>
        letter.toUpperCase()
    );
}

function QaOverviewPage() {
  const [
    dashboard,
    setDashboard,
  ] = useState<
    DashboardResponse["data"] |
    null
  >(null);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    error,
    setError,
  ] = useState("");

  const loadDashboard =
    useCallback(
      async () => {
        try {
          setIsLoading(true);
          setError("");

          const response =
            await apiRequest<DashboardResponse>(
              "/api/dashboard/summary"
            );

          setDashboard(
            response.data
          );
        } catch (caught) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Unable to load the quality overview."
          );
        } finally {
          setIsLoading(false);
        }
      },
      []
    );

  useEffect(
    () => {
      const timeoutId =
        window.setTimeout(
          () => {
            void loadDashboard();
          },
          0
        );

      return () => {
        window.clearTimeout(
          timeoutId
        );
      };
    },
    [loadDashboard]
  );

  useEffect(
    () => {
      const handleModelContextChange =
        () => {
          void loadDashboard();
        };

      window.addEventListener(
        MODEL_CONTEXT_CHANGED_EVENT,
        handleModelContextChange
      );

      return () => {
        window.removeEventListener(
          MODEL_CONTEXT_CHANGED_EVENT,
          handleModelContextChange
        );
      };
    },
    [loadDashboard]
  );

  return (
    <div className="page qa-overview-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Quality operations
          </p>

          <h2>
            Quality & Incidents
          </h2>

          <p className="page-description">
            Review current quality workload, active chatters, strike rules, and recent incident activity.
          </p>
        </div>

        <Link
          to="/incidents"
          className="primary-button"
        >
          View incidents
        </Link>
      </header>

      {error && (
        <div className="alert alert-error page-alert dashboard-error">
          <span>
            {error}
          </span>

          <button
            type="button"
            className="text-button danger"
            onClick={() => {
              void loadDashboard();
            }}
          >
            Retry
          </button>
        </div>
      )}

      <section className="dashboard-stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            Open incidents
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.openIncidents ?? 0}
          </strong>

          <span className="stat-help">
            Requiring review or action
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active chatters
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.activeChatters ?? 0}
          </strong>

          <span className="stat-help">
            In the selected creator scope
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active rules
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.activeRules ?? 0}
          </strong>

          <span className="stat-help">
            Available strike reasons
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Incident history
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.totalIncidents ?? 0}
          </strong>

          <span className="stat-help">
            Visible records in scope
          </span>
        </div>
      </section>

      <section className="content-card dashboard-recent-card">
        <div className="card-header">
          <div>
            <h3>
              Recent incident activity
            </h3>

            <p>
              Latest incidents for the creator context selected in the header.
            </p>
          </div>

          <Link
            to="/incidents"
            className="text-button"
          >
            View all
          </Link>
        </div>

        {isLoading ? (
          <div className="empty-state dashboard-empty">
            <strong>
              Loading recent activity…
            </strong>
          </div>
        ) : !dashboard ||
          dashboard.recentIncidents.length === 0 ? (
          <div className="empty-state dashboard-empty">
            <strong>
              No incident activity yet
            </strong>

            <span>
              New incidents will appear here as they are recorded.
            </span>
          </div>
        ) : (
          <div className="qa-activity-list">
            {dashboard.recentIncidents.map(
              (incident) => (
                <Link
                  to="/incidents"
                  key={incident.id}
                  className="qa-activity-row"
                >
                  <div className="qa-activity-primary">
                    <strong>
                      {incident.chatter.name}
                    </strong>

                    <span>
                      {incident.agencyModel?.name ??
                        "Unassigned creator"}
                    </span>
                  </div>

                  <div className="qa-activity-rule">
                    <strong>
                      {incident.ruleTitleSnapshot}
                    </strong>

                    <span>
                      {incident.severityNameSnapshot ??
                        "No severity"}
                    </span>
                  </div>

                  <div className="qa-activity-meta">
                    <span
                      className={`incident-status ${incident.status.toLowerCase()}`}
                    >
                      {formatIncidentStatus(
                        incident.status
                      )}
                    </span>

                    <time>
                      {formatCentralDateTime(
                        incident.occurredAt
                      )}
                    </time>
                  </div>
                </Link>
              )
            )}
          </div>
        )}
      </section>
    </div>
  );
}

export default QaOverviewPage;
