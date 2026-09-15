import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { apiRequest } from "../lib/api";

type IncidentStatus = "OPEN" | "RESOLVED" | "VOIDED";

type StrikeActivityStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "NOT_APPLICABLE";

type RecentIncident = {
  id: string;

  ruleTitleSnapshot: string;
  severityNameSnapshot: string | null;
  weightNameSnapshot: string | null;
  weightValueSnapshot: number | null;

  occurredAt: string;
  expiresAt: string;

  status: IncidentStatus;
  strikeActivityStatus: StrikeActivityStatus;

  chatter: {
    id: string;
    name: string;
  };

  ruleVersion: {
    versionNumber: number;
  };
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

function DashboardPage() {
  const [dashboard, setDashboard] =
    useState<DashboardResponse["data"] | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState("");

  const loadDashboard = useCallback(async () => {
    try {
      setIsLoading(true);
      setError("");

      const response =
        await apiRequest<DashboardResponse>(
          "/api/dashboard/summary"
        );

      setDashboard(response.data);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Failed to load dashboard"
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  function getStatusClass(status: IncidentStatus) {
    if (status === "OPEN") {
      return "incident-status open";
    }

    if (status === "RESOLVED") {
      return "incident-status resolved";
    }

    return "incident-status voided";
  }

  function formatStatus(status: IncidentStatus) {
    if (status === "OPEN") {
      return "Open";
    }

    if (status === "RESOLVED") {
      return "Resolved";
    }

    return "Voided";
  }

  function getStrikeStatusClass(
    status: StrikeActivityStatus
  ) {
    if (status === "ACTIVE") {
      return "status-badge active";
    }

    return "status-badge inactive";
  }

  function formatStrikeStatus(
    status: StrikeActivityStatus
  ) {
    if (status === "ACTIVE") {
      return "Active";
    }

    if (status === "EXPIRED") {
      return "Expired";
    }

    return "—";
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Overview</p>

          <h2>Dashboard</h2>

          <p className="page-description">
            Monitor QA activity, active chatters, rules, and
            recent incidents.
          </p>
        </div>

        <Link
          to="/incidents"
          className="primary-button"
        >
          View Incidents
        </Link>
      </header>

      {error && (
        <div className="alert alert-error page-alert dashboard-error">
          <span>{error}</span>

          <button
            type="button"
            className="text-button danger"
            onClick={() => void loadDashboard()}
          >
            Retry
          </button>
        </div>
      )}

      <section className="dashboard-stat-grid">
        <div className="stat-card">
          <span className="stat-label">
            Open Incidents
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.openIncidents ?? 0}
          </strong>

          <span className="stat-help">
            Incidents requiring review
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active Chatters
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.activeChatters ?? 0}
          </strong>

          <span className="stat-help">
            Available for incident logging
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active Rules
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.activeRules ?? 0}
          </strong>

          <span className="stat-help">
            Current strike reasons
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Total Incidents
          </span>

          <strong className="stat-value">
            {isLoading
              ? "—"
              : dashboard?.counts.totalIncidents ?? 0}
          </strong>

          <span className="stat-help">
            All historical records
          </span>
        </div>
      </section>

      <section className="dashboard-secondary-grid dashboard-secondary-grid-single">
        <div className="content-card">
          <div className="card-header">
            <div>
              <h3>Incident Status</h3>

              <p>
                Current breakdown of all incident records.
              </p>
            </div>
          </div>

          <div className="status-summary">
            <div className="status-summary-item">
              <div>
                <span className="status-dot open" />
                <span>Open</span>
              </div>

              <strong>
                {isLoading
                  ? "—"
                  : dashboard?.counts.openIncidents ?? 0}
              </strong>
            </div>

            <div className="status-summary-item">
              <div>
                <span className="status-dot resolved" />
                <span>Resolved</span>
              </div>

              <strong>
                {isLoading
                  ? "—"
                  : dashboard?.counts.resolvedIncidents ?? 0}
              </strong>
            </div>

            <div className="status-summary-item">
              <div>
                <span className="status-dot voided" />
                <span>Voided</span>
              </div>

              <strong>
                {isLoading
                  ? "—"
                  : dashboard?.counts.voidedIncidents ?? 0}
              </strong>
            </div>
          </div>
        </div>
      </section>

      <section className="content-card dashboard-recent-card">
        <div className="card-header">
          <div>
            <h3>Recent Activity</h3>

            <p>
              The six most recently occurring incidents.
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
            <strong>Loading recent activity...</strong>
          </div>
        ) : !dashboard ||
          dashboard.recentIncidents.length === 0 ? (
          <div className="empty-state dashboard-empty">
            <strong>No incident activity yet</strong>

            <span>
              Recent records will appear here after incidents
              are logged.
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table dashboard-table">
              <thead>
                <tr>
                  <th>Chatter</th>
                  <th>Rule</th>
                  <th>Severity</th>
                  <th>Weight</th>
                  <th>Occurred</th>
                  <th>Expires</th>
                  <th>Incident Status</th>
                  <th>Strike Status</th>
                </tr>
              </thead>

              <tbody>
                {dashboard.recentIncidents.map(
                  (incident) => (
                    <tr key={incident.id}>
                      <td>
                        <div className="primary-cell">
                          {incident.chatter.name}
                        </div>
                      </td>

                      <td>
                        <div className="dashboard-rule-cell">
                          <strong>
                            {incident.ruleTitleSnapshot}
                          </strong>

                          <span>
                            v
                            {
                              incident.ruleVersion
                                .versionNumber
                            }
                          </span>
                        </div>
                      </td>

                      <td>
                        {incident.severityNameSnapshot ??
                          "—"}
                      </td>

                      <td>
                        {incident.weightNameSnapshot ? (
                          <div className="weight-display">
                            <span>
                              {
                                incident.weightNameSnapshot
                              }
                            </span>

                            {incident.weightValueSnapshot !==
                              null && (
                              <span className="weight-value">
                                {
                                  incident.weightValueSnapshot
                                }
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>
                        {new Date(
                          incident.occurredAt
                        ).toLocaleString()}
                      </td>

                      <td>
                        {incident.strikeActivityStatus ===
                        "NOT_APPLICABLE"
                          ? "—"
                          : new Date(
                              incident.expiresAt
                            ).toLocaleString()}
                      </td>

                      <td>
                        <span
                          className={getStatusClass(
                            incident.status
                          )}
                        >
                          {formatStatus(
                            incident.status
                          )}
                        </span>
                      </td>

                      <td>
                        {incident.strikeActivityStatus ===
                        "NOT_APPLICABLE" ? (
                          <span
                            aria-label="Not applicable"
                            title="Voided incidents are invalidated and do not have a strike status."
                          >
                            —
                          </span>
                        ) : (
                          <span
                            className={getStrikeStatusClass(
                              incident.strikeActivityStatus
                            )}
                          >
                            {formatStrikeStatus(
                              incident.strikeActivityStatus
                            )}
                          </span>
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

export default DashboardPage;
