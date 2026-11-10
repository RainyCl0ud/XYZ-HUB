import {
  useCallback,
  useEffect,
  useMemo,
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
  hasPortalPermission,
} from "../auth/portalAccess";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
  PEOPLE_CHANGED_EVENT,
} from "../lib/api";

import "./DashboardPage.css";

type PersonStatus =
  | "PENDING_SETUP"
  | "ACTIVE"
  | "DEACTIVATED";

type Person = {
  id: string;
  name: string;
  email: string;
  status: PersonStatus;
  createdAt: string;
  roles: {
    id: string;
    name: string;
  }[];
  models: {
    id: string;
    name: string;
  }[];
};

type PeopleResponse = {
  people:
    Person[];
};

type AgencyModel = {
  id: string;
  name: string;
  isActive: boolean;
  peopleCount: number;
  incidentCount: number;
};

type ModelsResponse = {
  models:
    AgencyModel[];
};

type QaDashboardResponse = {
  data: {
    counts: {
      openIncidents: number;
      resolvedIncidents: number;
      voidedIncidents: number;
      totalIncidents: number;
      activeChatters: number;
      activeRules: number;
    };

    recentIncidents: {
      id: string;
      occurredAt: string;
      ruleTitleSnapshot: string;
      severityNameSnapshot: string | null;
      status:
        "OPEN" |
        "RESOLVED" |
        "VOIDED";
      chatter: {
        id: string;
        name: string;
      };
      agencyModel: {
        id: string;
        name: string;
      } | null;
    }[];

    attentionIncidents: {
      id: string;
      occurredAt: string;
      ruleTitleSnapshot: string;
      severityNameSnapshot: string | null;
      status:
        "OPEN" |
        "RESOLVED" |
        "VOIDED";
      chatter: {
        id: string;
        name: string;
      };
      agencyModel: {
        id: string;
        name: string;
      } | null;
    }[];
  };
};

const CENTRAL_TIME_ZONE =
  "America/Chicago";

function formatCentralDate(
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
    }
  ).format(
    new Date(
      value
    )
  );
}

function statusLabel(
  status:
    PersonStatus
) {
  switch (
    status
  ) {
    case "PENDING_SETUP":
      return "Pending setup";

    case "DEACTIVATED":
      return "Deactivated";

    case "ACTIVE":
    default:
      return "Active";
  }
}

function DashboardPage() {
  const {
    access,
  } =
    useAuth();

  const capabilities =
    getPortalCapabilities(
      access
    );

  const [
    people,
    setPeople,
  ] =
    useState<
      Person[]
    >([]);

  const [
    models,
    setModels,
  ] =
    useState<
      AgencyModel[]
    >([]);

  const [
    qa,
    setQa,
  ] =
    useState<
      QaDashboardResponse["data"] |
      null
    >(null);

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

  const loadDashboard =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          const [
            peopleResponse,
            modelsResponse,
            qaResponse,
          ] =
            await Promise.all([
              capabilities.canManagePeople
                ? apiRequest<PeopleResponse>(
                    "/api/people"
                  )
                : Promise.resolve(
                    null
                  ),

              capabilities.canManageModels
                ? apiRequest<ModelsResponse>(
                    "/api/models"
                  )
                : Promise.resolve(
                    null
                  ),

              capabilities.canViewQa
                ? apiRequest<QaDashboardResponse>(
                    "/api/dashboard/summary"
                  )
                : Promise.resolve(
                    null
                  ),
            ]);

          setPeople(
            peopleResponse?.people ??
              []
          );

          setModels(
            modelsResponse?.models ??
              []
          );

          setQa(
            qaResponse?.data ??
              null
          );
        } catch (
          error
        ) {
          setError(
            error instanceof Error
              ? error.message
              : "Unable to load the dashboard."
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        capabilities.canManageModels,
        capabilities.canManagePeople,
        capabilities.canViewQa,
      ]
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
    [
      loadDashboard,
    ]
  );

  useEffect(
    () => {
      const handlePeopleChanged =
        () => {
          void loadDashboard();
        };

      window.addEventListener(
        PEOPLE_CHANGED_EVENT,
        handlePeopleChanged
      );

      return () => {
        window.removeEventListener(
          PEOPLE_CHANGED_EVENT,
          handlePeopleChanged
        );
      };
    },
    [
      loadDashboard,
    ]
  );

  useEffect(
    () => {
      const handleCreatorContextChange =
        () => {
          void loadDashboard();
        };

      window.addEventListener(
        MODEL_CONTEXT_CHANGED_EVENT,
        handleCreatorContextChange
      );

      return () => {
        window.removeEventListener(
          MODEL_CONTEXT_CHANGED_EVENT,
          handleCreatorContextChange
        );
      };
    },
    [
      loadDashboard,
    ]
  );

  const activePeople =
    people.filter(
      (
        person
      ) =>
        person.status ===
        "ACTIVE"
    ).length;

  const pendingPeople =
    people.filter(
      (
        person
      ) =>
        person.status ===
        "PENDING_SETUP"
    ).length;

  const activeCreators =
    models.filter(
      (
        model
      ) =>
        model.isActive
    );

  const currentIncidents =
    qa?.attentionIncidents ??
    [];

  const recentPeople =
    useMemo(
      () =>
        [
          ...people,
        ]
          .sort(
            (
              first,
              second
            ) =>
              new Date(
                second.createdAt
              ).getTime() -
              new Date(
                first.createdAt
              ).getTime()
          )
          .slice(
            0,
            5
          ),
      [
        people,
      ]
    );

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

  const hasAgencyOverview =
    capabilities.canManagePeople ||
    capabilities.canManageModels ||
    capabilities.canViewQa;

  return (
    <div className="page agency-dashboard-page">
      <header className="page-header agency-dashboard-header">
        <div>
          <p className="page-eyebrow">
            Agency overview
          </p>

          <h2>
            Dashboard
          </h2>

          <p className="page-description">
            A current view of people, creators, and quality activity available to your account.
          </p>
        </div>


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

      {hasAgencyOverview && (
        <section className="agency-metric-grid">
          {capabilities.canManagePeople && (
            <>
              <Link
                to="/people?status=ACTIVE"
                className="agency-metric-card"
              >
                <span>
                  Active people
                </span>

                <strong>
                  {loading
                    ? "—"
                    : activePeople}
                </strong>

                <small>
                  Current active accounts
                </small>
              </Link>

              <Link
                to="/people?status=PENDING_SETUP"
                className="agency-metric-card"
              >
                <span>
                  Pending setup
                </span>

                <strong>
                  {loading
                    ? "—"
                    : pendingPeople}
                </strong>

                <small>
                  Invitations awaiting completion
                </small>
              </Link>
            </>
          )}

          {capabilities.canManageModels && (
            <Link
              to="/models"
              className="agency-metric-card"
            >
              <span>
                Active creators
              </span>

              <strong>
                {loading
                  ? "—"
                  : activeCreators.length}
              </strong>

              <small>
                Available for assignments
              </small>
            </Link>
          )}

          {capabilities.canViewQa && (
            <Link
              to="/incidents"
              className="agency-metric-card"
            >
              <span>
                Open incidents
              </span>

              <strong>
                {loading
                  ? "—"
                  : qa?.counts.openIncidents ??
                    0}
              </strong>

              <small>
                Quality items requiring attention
              </small>
            </Link>
          )}
        </section>
      )}

      <div className="agency-dashboard-grid">
        {capabilities.canManagePeople && (
          <section className="content-card agency-dashboard-panel">
            <div className="card-header">
              <div>
                <h3>
                  Recently added people
                </h3>

                <p>
                  Latest accounts added to People Management.
                </p>
              </div>

              <Link
                to="/people"
                className="text-button"
              >
                View people
              </Link>
            </div>

            {loading ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  Loading people…
                </strong>
              </div>
            ) : recentPeople.length ===
              0 ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  No people yet
                </strong>
              </div>
            ) : (
              <div className="agency-people-list">
                {recentPeople.map(
                  (
                    person
                  ) => (
                    <Link
                      to="/people"
                      key={
                        person.id
                      }
                      className="agency-people-row"
                    >
                      <div className="agency-person-avatar">
                        {person.name
                          .trim()
                          .charAt(
                            0
                          )
                          .toUpperCase()}
                      </div>

                      <div className="agency-person-copy">
                        <strong>
                          {person.name}
                        </strong>

                        <span>
                          {person.roles
                            .map(
                              (
                                role
                              ) =>
                                role.name
                            )
                            .join(
                              ", "
                            ) ||
                            "Role not assigned"}
                        </span>
                      </div>

                      <div className="agency-person-meta">
                        <span
                          className={
                            `agency-person-status ${person.status.toLowerCase()}`
                          }
                        >
                          {statusLabel(
                            person.status
                          )}
                        </span>

                        <time>
                          {formatCentralDate(
                            person.createdAt
                          )}
                        </time>
                      </div>
                    </Link>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {capabilities.canManageModels && (
          <section className="content-card agency-dashboard-panel">
            <div className="card-header">
              <div>
                <h3>
                  Current creators
                </h3>

                <p>
                  Active creators and their current assignment load.
                </p>
              </div>

              <Link
                to="/models"
                className="text-button"
              >
                View creators
              </Link>
            </div>

            {loading ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  Loading creators…
                </strong>
              </div>
            ) : activeCreators.length ===
              0 ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  No active creators
                </strong>
              </div>
            ) : (
              <div className="agency-model-list">
                {activeCreators
                  .slice(
                    0,
                    6
                  )
                  .map(
                    (
                      model
                    ) => (
                      <Link
                        to="/models"
                        key={
                          model.id
                        }
                        className="agency-model-row"
                      >
                        <div>
                          <strong>
                            {model.name}
                          </strong>

                          <span>
                            {model.peopleCount} assigned
                          </span>
                        </div>

                        <div className="agency-model-stat">
                          <strong>
                            {model.incidentCount}
                          </strong>

                          <span>
                            incidents
                          </span>
                        </div>
                      </Link>
                    )
                  )}
              </div>
            )}
          </section>
        )}

        {capabilities.canViewQa && (
          <section className="content-card agency-dashboard-panel agency-dashboard-panel-wide">
            <div className="card-header">
              <div>
                <h3>
                  Open QA incidents
                </h3>

                <p>
                  QA incidents requiring attention in your current creator access.
                </p>
              </div>

              <Link
                to="/incidents"
                className="text-button"
              >
                View incidents
              </Link>
            </div>

            {loading ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  Loading current incidents…
                </strong>
              </div>
            ) : currentIncidents.length ===
              0 ? (
              <div className="empty-state dashboard-empty">
                <strong>
                  No open QA incidents
                </strong>

                <span>
                  New QA records requiring attention will appear here.
                </span>
              </div>
            ) : (
              <div className="agency-incident-list">
                {currentIncidents.map(
                  (
                    incident
                  ) => (
                    <Link
                      key={
                        incident.id
                      }
                      to="/incidents"
                      className="agency-incident-row"
                    >
                      <div className="agency-incident-person">
                        <strong>
                          {incident.chatter.name}
                        </strong>

                        <span>
                          {incident.agencyModel?.name ??
                            "Unassigned creator"}
                        </span>
                      </div>

                      <div className="agency-incident-violation">
                        <span>
                          Violation
                        </span>

                        <strong>
                          {incident.ruleTitleSnapshot}
                        </strong>
                      </div>

                      <div className="agency-incident-state">
                        <strong>
                          Open incident
                        </strong>

                        <span>
                          {incident.severityNameSnapshot ??
                            "No severity"}
                        </span>
                      </div>
                    </Link>
                  )
                )}
              </div>
            )}
          </section>
        )}

        {!hasAgencyOverview && (
          <section className="content-card agency-dashboard-panel agency-access-panel">
            <div className="card-header">
              <div>
                <h3>
                  Your account
                </h3>

                <p>
                  Current access assigned to your XYZ Management account.
                </p>
              </div>
            </div>

            <div className="agency-access-summary">
              <div>
                <span>
                  Roles
                </span>

                <strong>
                  {roleNames}
                </strong>
              </div>

              <div>
                <span>
                  Data scope
                </span>

                <strong>
                  {access?.effectiveDataScope ??
                    "—"}
                </strong>
              </div>

              <div>
                <span>
                  Creator access
                </span>

                <strong>
                  {access?.canSeeAllModels
                    ? "All creators"
                    : `${access?.assignedModelIds.length ?? 0} assigned`}
                </strong>
              </div>
            </div>
          </section>
        )}
        {hasPortalPermission(access, "dashboard.upcoming.view") && (
          <section className="content-card agency-dashboard-panel agency-access-panel">
            <div className="card-header"><h3>Coming later</h3></div>
            <div className="agency-access-summary">
              <div><span>Schedule</span><strong>Coming later</strong></div>
              <div><span>Revenue</span><strong>Coming later</strong></div>
              <div><span>Commission sheets</span><strong>Coming later</strong></div>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

export default DashboardPage;
