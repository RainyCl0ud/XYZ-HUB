import {
  useCallback,
  useEffect,
  useState,
} from "react";

import {
  Link,
} from "react-router-dom";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
} from "../lib/api";

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
  modelId: string | null;
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

    recentIncidents:
      RecentIncident[];
  };
};

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
      timeZoneName:
        "short",
    }
  ).format(
    new Date(
      value
    )
  );
}

function DashboardPage() {
  const {
    user,
    access,
  } =
    useAuth();

  const capabilities =
    getPortalCapabilities(
      access
    );

  const [
    dashboard,
    setDashboard,
  ] =
    useState<
      DashboardResponse["data"] |
      null
    >(null);

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(
      capabilities.canViewQa
    );

  const [
    error,
    setError,
  ] =
    useState(
      ""
    );

  const loadDashboard =
    useCallback(
      async () => {
        if (
          !capabilities.canViewQa
        ) {
          setDashboard(
            null
          );
          setIsLoading(
            false
          );
          setError(
            ""
          );

          return;
        }

        try {
          setIsLoading(
            true
          );
          setError(
            ""
          );

          const response =
            await apiRequest<DashboardResponse>(
              "/api/dashboard/summary"
            );

          setDashboard(
            response.data
          );
        } catch (
          error
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Failed to load QA overview"
          );
        } finally {
          setIsLoading(
            false
          );
        }
      },
      [
        capabilities.canViewQa,
      ]
    );

  useEffect(
    () => {
      void loadDashboard();
    },
    [
      loadDashboard,
    ]
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
    [
      loadDashboard,
    ]
  );

  if (
    !capabilities.canViewQa
  ) {
    const roleNames =
      access?.roles
        .map(
          (
            role
          ) =>
            role.name
        )
        .join(
          ", "
        ) ||
      "No role assigned";

    const systemKeys =
      new Set(
        access?.roles
          .map(
            (
              role
            ) =>
              role.systemKey
          )
          .filter(
            (
              value
            ): value is string =>
              Boolean(
                value
              )
          ) ??
          []
      );

    const homeProfile =
      systemKeys.has(
        "TRIAL_CHATTER"
      )
        ? {
            label:
              "Trial Chatter",
            title:
              "Account setup complete",
            description:
              "Your trial account is active. The Login Gate has verified your identity, role, and assigned access.",
            next:
              "No operational workspace is enabled for this role in the current build.",
          }
        : systemKeys.has(
              "CHATTER"
            )
          ? {
              label:
                "Chatter",
              title:
                "Your portal access is active",
              description:
                "Your account, roles and model assignments are active through the Login Gate.",
              next:
                "No chatter operations workspace is enabled in the current build.",
            }
          : systemKeys.has(
                "ACCOUNTANT"
              )
            ? {
                label:
                  "Accountant",
                title:
                  "Finance role ready",
                description:
                  "Your finance role is active in the Login Gate access system.",
                next:
                  "No finance workspace is enabled in the current build.",
              }
            : systemKeys.has(
                  "MODEL"
                )
              ? {
                  label:
                    "Model",
                  title:
                    "Your XYZ Hub account is active",
                  description:
                    "Your role and own-data scope are active through the Login Gate.",
                  next:
                    "No model-facing operational workspace is enabled in the current build.",
                }
              : systemKeys.has(
                    "GENERAL_STAFF"
                  )
                ? {
                    label:
                      "General Staff",
                    title:
                      "Your staff account is active",
                    description:
                      "Your staff account and access profile are active through the Login Gate.",
                    next:
                      "Only workspaces enabled for this role are shown.",
                  }
                : {
                    label:
                      "XYZ Hub",
                    title:
                      "Your portal access is active",
                    description:
                      "Your Login Gate access is active. No operational workspace is enabled for your current role in this build.",
                    next:
                      "Access is granted through centralized roles, permissions, and model scope.",
                  };

    return (
      <div className="page">
        <header className="page-header">
          <div>
            <p className="page-eyebrow">
              {homeProfile.label}
            </p>

            <h2>
              {homeProfile.title}{user?.name
                ? `, ${user.name}`
                : ""}
            </h2>

            <p className="page-description">
              {homeProfile.description}
            </p>
          </div>
        </header>

        <section className="portal-home-grid">
          <div className="content-card portal-home-card">
            <span className="stat-label">
              Assigned roles
            </span>

            <strong>
              {roleNames}
            </strong>

            <span>
              Roles stack. Effective access is the union of permissions granted by all assigned roles.
            </span>
          </div>

          <div className="content-card portal-home-card">
            <span className="stat-label">
              Data scope
            </span>

            <strong>
              {access?.effectiveDataScope ??
                "—"}
            </strong>

            <span>
              The access layer combines this scope with model assignments where a module supports model-scoped data.
            </span>
          </div>

          <div className="content-card portal-home-card">
            <span className="stat-label">
              Model access
            </span>

            <strong>
              {access?.canSeeAllModels
                ? "All models"
                : `${access?.assignedModelIds.length ?? 0} assigned`}
            </strong>

            <span>
              {homeProfile.next}
            </span>
          </div>
        </section>
      </div>
    );
  }

  function getStatusClass(
    status:
      IncidentStatus
  ) {
    if (
      status ===
      "OPEN"
    ) {
      return "incident-status open";
    }

    if (
      status ===
      "RESOLVED"
    ) {
      return "incident-status resolved";
    }

    return "incident-status voided";
  }

  function formatStatus(
    status:
      IncidentStatus
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

  function getStrikeStatusClass(
    status:
      StrikeActivityStatus
  ) {
    if (
      status ===
      "ACTIVE"
    ) {
      return "status-badge active";
    }

    return "status-badge inactive";
  }

  function formatStrikeStatus(
    status:
      StrikeActivityStatus
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

    return "—";
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Quality
          </p>

          <h2>
            QA & Incident Overview
          </h2>

          <p className="page-description">
            Current QA, incident, and strike activity follows the model context selected in the sidebar.
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
            Visible in the current model scope
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
            Visible historical records
          </span>
        </div>
      </section>

      <section className="dashboard-secondary-grid dashboard-secondary-grid-single">
        <div className="content-card">
          <div className="card-header">
            <div>
              <h3>
                Incident Status
              </h3>

              <p>
                Current breakdown inside your visible model scope.
              </p>
            </div>
          </div>

          <div className="status-summary">
            <div className="status-summary-item">
              <div>
                <span className="status-dot open" />
                <span>
                  Open
                </span>
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
                <span>
                  Resolved
                </span>
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
                <span>
                  Voided
                </span>
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
            <h3>
              Recent Incident Activity
            </h3>

            <p>
              The six most recent incidents in the current model scope.
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
              Loading recent activity...
            </strong>
          </div>
        ) : !dashboard ||
          dashboard.recentIncidents.length ===
            0 ? (
          <div className="empty-state dashboard-empty">
            <strong>
              No incident activity yet
            </strong>

            <span>
              Recent visible records will appear here after incidents are logged.
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table dashboard-table">
              <thead>
                <tr>
                  <th>
                    Chatter
                  </th>
                  <th>
                    Model
                  </th>
                  <th>
                    Rule
                  </th>
                  <th>
                    Severity
                  </th>
                  <th>
                    Weight
                  </th>
                  <th>
                    Occurred
                  </th>
                  <th>
                    Expires
                  </th>
                  <th>
                    Incident Status
                  </th>
                  <th>
                    Strike Status
                  </th>
                </tr>
              </thead>

              <tbody>
                {dashboard.recentIncidents.map(
                  (
                    incident
                  ) => (
                    <tr
                      key={
                        incident.id
                      }
                    >
                      <td>
                        <div className="primary-cell">
                          {incident.chatter.name}
                        </div>
                      </td>

                      <td>
                        {incident.agencyModel?.name ??
                          "Legacy / unassigned"}
                      </td>

                      <td>
                        <div className="dashboard-rule-cell">
                          <strong>
                            {incident.ruleTitleSnapshot}
                          </strong>

                          <span>
                            v{incident.ruleVersion.versionNumber}
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
                              {incident.weightNameSnapshot}
                            </span>

                            {incident.weightValueSnapshot !==
                              null && (
                              <span className="weight-value">
                                {incident.weightValueSnapshot}
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>
                        {formatCentralDateTime(
                          incident.occurredAt
                        )}
                      </td>

                      <td>
                        {incident.strikeActivityStatus ===
                        "NOT_APPLICABLE"
                          ? "—"
                          : formatCentralDateTime(
                              incident.expiresAt
                            )}
                      </td>

                      <td>
                        <span
                          className={
                            getStatusClass(
                              incident.status
                            )
                          }
                        >
                          {formatStatus(
                            incident.status
                          )}
                        </span>
                      </td>

                      <td>
                        {incident.strikeActivityStatus ===
                        "NOT_APPLICABLE" ? (
                          <span>
                            —
                          </span>
                        ) : (
                          <span
                            className={
                              getStrikeStatusClass(
                                incident.strikeActivityStatus
                              )
                            }
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
