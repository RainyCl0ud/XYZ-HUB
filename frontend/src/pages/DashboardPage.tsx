import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
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

import {
  useClockReviewCount,
} from "../components/ClockReviewCountContext";

import {
  buildAttentionRows,
  failedAttendanceState,
  type AttendanceOverview,
  type AttendanceState,
} from "../lib/dashboard-attention";

import {
  NeedsAttentionCard,
  OnTheClockCard,
} from "../components/DashboardAttention";

import "./DashboardPage.css";
import { formatDataScope } from "../lib/data-scope";

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

const ATTENDANCE_REFRESH_MS =
  60_000;

const ATTENDANCE_OVERVIEW_PERMISSIONS = [
  "clock.overview.agency",
  "clock.overview.team",
  "clock.overview.chatters",
] as const;

// Same list as ClockReviewCountProvider, which supplies the count.
const CORRECTION_REVIEW_PERMISSIONS = [
  "clock.corrections.assigned",
  "clock.corrections.ops",
  "clock.corrections.all",
] as const;

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
    user,
    access,
  } =
    useAuth();

  const capabilities =
    getPortalCapabilities(
      access
    );

  const reviewCount =
    useClockReviewCount();

  const clockEnabled =
    import.meta.env.VITE_BLOCK2_CLOCK_ENABLED ===
    "true";

  const canViewAttendance =
    clockEnabled &&
    hasPortalPermission(
      access,
      "clock.access"
    ) &&
    ATTENDANCE_OVERVIEW_PERMISSIONS.some(
      (
        permission
      ) =>
        hasPortalPermission(
          access,
          permission
        )
    );

  // Same rule as the sidebar's review badge (ClockReviewCountProvider),
  // so the Dashboard and the badge always show the same number.
  const canReviewCorrections =
    clockEnabled &&
    hasPortalPermission(
      access,
      "clock.self.view"
    ) &&
    CORRECTION_REVIEW_PERMISSIONS.some(
      (
        permission
      ) =>
        hasPortalPermission(
          access,
          permission
        )
    );

  const isOwner =
    access?.roles.some(
      (
        role
      ) =>
        role.systemKey ===
        "OWNER"
    ) ??
    false;

  // The Clock page needs clock.self.view. Owners open the agency
  // overview; everyone else opens the Team tab of their own Clock page.
  const attendanceHref =
    clockEnabled &&
    hasPortalPermission(
      access,
      "clock.self.view"
    )
      ? isOwner
        ? "/clock"
        : "/clock?tab=team"
      : null;

  // A snapshot belongs to one account and its access. After a different
  // sign-in, role, permission or creator assignment it is never shown,
  // and a fresh load starts straight away.
  const attendanceScope =
    canViewAttendance &&
    access
      ? [
          user?.id ??
            "",
          access.roles
            .map(
              (
                role
              ) =>
                `${role.id}:${role.systemKey ?? ""}`
            )
            .sort()
            .join(
              ","
            ),
          [
            ...access.permissions,
          ]
            .sort()
            .join(
              ","
            ),
          [
            ...access.assignedModelIds,
          ]
            .sort()
            .join(
              ","
            ),
        ].join(
          "|"
        )
      : "";

  const [
    storedAttendance,
    setStoredAttendance,
  ] =
    useState<{
      scope: string;
      state: AttendanceState;
    }>({
      scope:
        "",
      state: {
        status:
          "loading",
      },
    });

  const attendance: AttendanceState =
    storedAttendance.scope ===
    attendanceScope
      ? storedAttendance.state
      : {
          status:
            "loading",
        };

  const attendanceRequest =
    useRef<AbortController | null>(
      null
    );

  const loadAttendance =
    useCallback(
      async () => {
        if (
          !attendanceScope
        ) {
          return;
        }

        attendanceRequest.current?.abort();

        const controller =
          new AbortController();

        attendanceRequest.current =
          controller;

        try {
          const data =
            await apiRequest<AttendanceOverview>(
              "/api/clock/overview",
              {
                signal:
                  controller.signal,
              }
            );

          if (
            !controller.signal.aborted
          ) {
            setStoredAttendance({
              scope:
                attendanceScope,
              state: {
                status:
                  "ready",
                data,
                stale:
                  false,
              },
            });
          }
        } catch (
          error
        ) {
          if (
            controller.signal.aborted
          ) {
            return;
          }

          // 403/404 hide the card; other failures keep a loaded snapshot
          // marked out of date, or show an error on a first load.
          setStoredAttendance(
            (
              previous
            ) => ({
              scope:
                attendanceScope,
              state:
                failedAttendanceState(
                  previous.scope ===
                    attendanceScope
                    ? previous.state
                    : {
                        status:
                          "loading",
                      },
                  error
                ),
            })
          );
        }
      },
      [
        attendanceScope,
      ]
    );

  useEffect(
    () => {
      if (
        !attendanceScope
      ) {
        return;
      }

      const readIfVisible =
        () => {
          if (
            document.visibilityState ===
            "visible"
          ) {
            void loadAttendance();
          }
        };

      const initial =
        window.setTimeout(
          () => {
            void loadAttendance();
          },
          0
        );

      const interval =
        window.setInterval(
          readIfVisible,
          ATTENDANCE_REFRESH_MS
        );

      window.addEventListener(
        "focus",
        readIfVisible
      );

      document.addEventListener(
        "visibilitychange",
        readIfVisible
      );

      return () => {
        window.clearTimeout(
          initial
        );

        window.clearInterval(
          interval
        );

        window.removeEventListener(
          "focus",
          readIfVisible
        );

        document.removeEventListener(
          "visibilitychange",
          readIfVisible
        );

        attendanceRequest.current?.abort();
      };
    },
    [
      attendanceScope,
      loadAttendance,
    ]
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

  const showAttendance =
    canViewAttendance &&
    attendance.status !==
      "unavailable";

  const attentionRows =
    buildAttentionRows({
      canReviewCorrections,
      reviewCount,
      showAttendance,
      attendance:
        attendance.status === "ready"
          ? attendance.data
          : null,
      attendanceHref,
      canViewQa:
        capabilities.canViewQa,
      // "—", not a reassuring 0, while the summary loads or if it failed.
      openIncidents:
        loading || !qa
          ? null
          : qa.counts.openIncidents,
    });

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
          <h2>
            Dashboard
          </h2>

          <p className="page-description">
            What needs attention across your people, attendance and quality.
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

      {(attentionRows.length > 0 ||
        showAttendance) && (
        <div className="agency-attention-grid">
          {attentionRows.length > 0 && (
            <NeedsAttentionCard
              rows={
                attentionRows
              }
            />
          )}

          {showAttendance && (
            <OnTheClockCard
              state={
                attendance
              }
              href={
                attendanceHref
              }
              onRetry={() => {
                void loadAttendance();
              }}
            />
          )}
        </div>
      )}

      <div className="agency-dashboard-grid">
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
                            {model.incidentCount === 1
                              ? "incident"
                              : "incidents"}
                          </span>
                        </div>
                      </Link>
                    )
                  )}
              </div>
            )}
          </section>
        )}

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
                  {access?.effectiveDataScope
                    ? formatDataScope(access.effectiveDataScope)
                    : "—"}
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
          <section className="content-card agency-dashboard-panel agency-access-panel agency-upcoming-panel">
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
