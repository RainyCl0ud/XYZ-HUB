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
  ApiError,
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
  PEOPLE_CHANGED_EVENT,
} from "../lib/api";

import {
  useClockReviewCount,
} from "../components/ClockReviewCountContext";

import {
  attentionOrder,
  describeShift,
  type AttendanceOverview,
} from "../lib/dashboard-attention";

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

type AttendanceState =
  | { status: "loading" }
  | { status: "ready"; data: AttendanceOverview }
  | { status: "error"; message: string }
  | { status: "unavailable" };

const CENTRAL_TIME_ZONE =
  "America/Chicago";

const ATTENDANCE_REFRESH_MS =
  60_000;

const ATTENDANCE_ROWS =
  5;

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

  const [
    attendance,
    setAttendance,
  ] =
    useState<AttendanceState>({
      status:
        "loading",
    });

  const attendanceRequest =
    useRef<AbortController | null>(
      null
    );

  const loadAttendance =
    useCallback(
      async () => {
        if (
          !canViewAttendance
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
            setAttendance({
              status:
                "ready",
              data,
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

          if (
            error instanceof ApiError &&
            [
              403,
              404,
            ].includes(
              error.status
            )
          ) {
            setAttendance({
              status:
                "unavailable",
            });

            return;
          }

          // A failed background refresh keeps the last good snapshot;
          // the next refresh replaces it.
          setAttendance(
            (
              previous
            ) =>
              previous.status ===
              "ready"
                ? previous
                : {
                    status:
                      "error",
                    message:
                      "Attendance couldn't load.",
                  }
          );
        }
      },
      [
        canViewAttendance,
      ]
    );

  useEffect(
    () => {
      if (
        !canViewAttendance
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
      canViewAttendance,
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

  const attendanceData =
    attendance.status === "ready"
      ? attendance.data
      : null;

  const shiftRows =
    useMemo(
      () =>
        attendanceData
          ? attentionOrder(
              attendanceData
            )
          : [],
      [
        attendanceData,
      ]
    );

  const showAttendance =
    canViewAttendance &&
    attendance.status !==
      "unavailable";

  const attentionRows: {
    key: string;
    label: string;
    helper: string;
    count: number | null;
    href: string | null;
  }[] = [];

  if (
    canReviewCorrections
  ) {
    attentionRows.push({
      key:
        "corrections",
      label:
        "Corrections to review",
      helper:
        "Waiting for your approval",
      count:
        reviewCount,
      href:
        "/clock?tab=review",
    });
  }

  // Shows "—" while attendance loads or fails, and stays hidden only if
  // the snapshot comes from a backend that doesn't count long shifts yet.
  if (
    showAttendance &&
    (attendanceData === null ||
      attendanceData.counts.longShifts !==
        undefined)
  ) {
    attentionRows.push({
      key:
        "long-shifts",
      label:
        "Long shifts",
      helper:
        "Clocked in 14 hours or more",
      count:
        attendanceData?.counts.longShifts ??
        null,
      href:
        attendanceHref,
    });
  }

  if (
    capabilities.canViewQa
  ) {
    attentionRows.push({
      key:
        "incidents",
      label:
        "Open QA incidents",
      helper:
        "Across your creators",
      count:
        loading
          ? null
          : qa?.counts.openIncidents ??
            0,
      href:
        "/incidents",
    });
  }

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
            <section className="content-card agency-dashboard-panel agency-attention-panel">
              <div className="card-header">
                <div>
                  <h3>
                    Needs attention
                  </h3>

                  <p>
                    What is waiting on you right now.
                  </p>
                </div>
              </div>

              <div className="agency-attention-list">
                {attentionRows.map(
                  (
                    row
                  ) => {
                    const className =
                      `agency-attention-row${row.count ? " has-items" : ""}`;

                    const content = (
                      <>
                        <strong className="agency-attention-count">
                          {row.count ??
                            "—"}
                        </strong>

                        <span className="agency-attention-copy">
                          <span>
                            {row.label}
                          </span>

                          <small>
                            {row.helper}
                          </small>
                        </span>
                      </>
                    );

                    return row.href ? (
                      <Link
                        key={
                          row.key
                        }
                        to={
                          row.href
                        }
                        className={
                          className
                        }
                      >
                        {content}
                      </Link>
                    ) : (
                      <div
                        key={
                          row.key
                        }
                        className={
                          className
                        }
                      >
                        {content}
                      </div>
                    );
                  }
                )}
              </div>
            </section>
          )}

          {showAttendance && (
            <section className="content-card agency-dashboard-panel agency-clock-panel">
              <div className="card-header">
                <div>
                  <h3>
                    On the clock now
                  </h3>

                  <p>
                    Who is working, on a break or not clocked in.
                  </p>
                </div>

                {attendanceHref && (
                  <Link
                    to={
                      attendanceHref
                    }
                    className="text-button"
                  >
                    View attendance
                  </Link>
                )}
              </div>

              {attendance.status ===
              "loading" ? (
                <div className="empty-state dashboard-empty">
                  <strong>
                    Loading attendance…
                  </strong>
                </div>
              ) : attendance.status ===
                "error" ? (
                <div className="empty-state dashboard-empty agency-clock-error">
                  <strong>
                    {attendance.message}
                  </strong>

                  <button
                    type="button"
                    className="text-button"
                    onClick={() => {
                      void loadAttendance();
                    }}
                  >
                    Retry
                  </button>
                </div>
              ) : attendanceData && (
                <>
                  <dl className="agency-clock-counts">
                    <div>
                      <dt>
                        Clocked in
                      </dt>

                      <dd>
                        {attendanceData.counts.clockedInStaff}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        On break
                      </dt>

                      <dd>
                        {attendanceData.counts.staffOnBreak}
                      </dd>
                    </div>

                    <div>
                      <dt>
                        Not clocked in
                      </dt>

                      <dd>
                        {attendanceData.counts.notClockedInStaff}
                      </dd>
                    </div>
                  </dl>

                  {shiftRows.length ===
                  0 ? (
                    <div className="empty-state dashboard-empty">
                      <strong>
                        No one is clocked in right now
                      </strong>
                    </div>
                  ) : (
                    <div className="agency-clock-list">
                      {shiftRows
                        .slice(
                          0,
                          ATTENDANCE_ROWS
                        )
                        .map(
                          (
                            row
                          ) => {
                            const {
                              state,
                              tag,
                            } =
                              describeShift(
                                row
                              );

                            const content = (
                              <>
                                <span className="agency-clock-person">
                                  <strong>
                                    {row.personName}
                                  </strong>

                                  <span>
                                    {row.teamName}
                                  </span>
                                </span>

                                <span className="agency-clock-state">
                                  <span>
                                    {state}
                                  </span>

                                  {tag && (
                                    <span
                                      className={
                                        `agency-clock-tag${row.isLong ? " long" : ""}`
                                      }
                                    >
                                      {tag}
                                    </span>
                                  )}
                                </span>
                              </>
                            );

                            return attendanceHref ? (
                              <Link
                                key={
                                  row.id
                                }
                                to={
                                  attendanceHref
                                }
                                className="agency-clock-row"
                              >
                                {content}
                              </Link>
                            ) : (
                              <div
                                key={
                                  row.id
                                }
                                className="agency-clock-row"
                              >
                                {content}
                              </div>
                            );
                          }
                        )}
                    </div>
                  )}
                </>
              )}
            </section>
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
