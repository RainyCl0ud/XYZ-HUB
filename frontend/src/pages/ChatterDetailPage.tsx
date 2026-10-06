import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
} from "../lib/api";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import {
  useToast,
} from "../components/ToastProvider";

import "./ChattersPage.css";

type ChatterStatus =
  | "ACTIVE"
  | "INACTIVE";

type IncidentStatus =
  | "OPEN"
  | "RESOLVED"
  | "VOIDED";

type Chatter = {
  id: string;
  name: string;
  status: ChatterStatus;
  createdAt: string;
  updatedAt: string;
};

type ChatterIncident = {
  id: string;
  chatterId: string;
  ruleVersionId: string;
  ruleTitleSnapshot: string;
  ruleDefinitionSnapshot: string;

  severityNameSnapshot:
    | string
    | null;

  weightNameSnapshot:
    | string
    | null;

  weightValueSnapshot:
    | number
    | null;

  occurredAt: string;
  details: string;

  evidenceUrl:
    | string
    | null;

  status:
    IncidentStatus;

  resolutionNotes:
    | string
    | null;

  resolvedAt:
    | string
    | null;

  voidReason:
    | string
    | null;

  voidedAt:
    | string
    | null;

  ruleVersion: {
    id: string;
    ruleId: string;
    versionNumber: number;
  };
};

type ChatterDetailResponse = {
  data: Chatter;
};

type IncidentListResponse = {
  data:
    ChatterIncident[];
};

type ChatterMutationResponse = {
  message: string;
  data: Chatter;
};

type LinkedStrike = {
  id: string;

  status:
    | "ACTIVE"
    | "EXPIRED"
    | "VOIDED";

  sourceIncidentId:
    | string
    | null;
};

type LinkedStrikeResponse = {
  data:
    | LinkedStrike
    | null;
};

type IncidentFilter =
  | "ALL"
  | IncidentStatus;

type PendingConfirmation =
  | {
      type:
        "edit";
      name:
        string;
    }
  | {
      type:
        "status";
      action:
        | "deactivate"
        | "reactivate";
    };

const TEXAS_TIME_ZONE =
  "America/Chicago";

const CHATTER_HISTORY_PAGE_SIZE =
  5;

function formatTexasDateTime(
  value:
    string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        TEXAS_TIME_ZONE,
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

function formatIncidentStatus(
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

function getIncidentStatusClass(
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

function formatLinkedStrikeStatus(
  status:
    LinkedStrike["status"]
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

function ChatterDetailPage() {
  const toast =
    useToast();

  const navigate =
    useNavigate();

  const {
    chatterId,
  } =
    useParams<{
      chatterId: string;
    }>();

  const [
    searchParams,
  ] =
    useSearchParams();

  const {
    access,
  } =
    useAuth();

  const {
    canConfigureQa,
    canViewStrikes,
  } =
    getPortalCapabilities(
      access
    );

  const [
    chatter,
    setChatter,
  ] =
    useState<
      Chatter |
      null
    >(null);

  const [
    incidents,
    setIncidents,
  ] =
    useState<
      ChatterIncident[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(true);

  const [
    error,
    setError,
  ] =
    useState("");

  const [
    modelContextRevision,
    setModelContextRevision,
  ] =
    useState(0);

  const [
    incidentFilter,
    setIncidentFilter,
  ] =
    useState<IncidentFilter>(
      "ALL"
    );

  const [
    expandedIncidentId,
    setExpandedIncidentId,
  ] =
    useState<
      string |
      null
    >(null);

  const [
    historyPage,
    setHistoryPage,
  ] =
    useState(1);

  const [
    showEdit,
    setShowEdit,
  ] =
    useState(false);

  const [
    name,
    setName,
  ] =
    useState("");

  const [
    formError,
    setFormError,
  ] =
    useState("");

  const [
    isSaving,
    setIsSaving,
  ] =
    useState(false);

  const [
    statusBusy,
    setStatusBusy,
  ] =
    useState(false);

  const [
    linkedStrikeByIncidentId,
    setLinkedStrikeByIncidentId,
  ] =
    useState<
      Record<
        string,
        LinkedStrike |
        null
      >
    >({});

  const [
    pendingConfirmation,
    setPendingConfirmation,
  ] =
    useState<
      PendingConfirmation |
      null
    >(null);

  const requestedReturnPath =
    searchParams.get(
      "from"
    );

  function getReturnPath() {
    if (
      requestedReturnPath ===
        "/chatters" ||
      requestedReturnPath
        ?.startsWith(
          "/chatters?"
        ) ||
      requestedReturnPath ===
        "/incidents" ||
      requestedReturnPath
        ?.startsWith(
          "/incidents?"
        )
    ) {
      return requestedReturnPath;
    }

    return "/chatters";
  }

  function getReturnLabel() {
    return getReturnPath().startsWith(
      "/incidents"
    )
      ? "← Back to Incidents"
      : "{getReturnLabel()}";
  }

  const loadDetails =
    useCallback(
      async (
        id:
          string
      ) => {
        try {
          setLoading(
            true
          );

          setError(
            ""
          );

          setChatter(
            null
          );

          setIncidents(
            []
          );

          const [
            chatterResponse,
            incidentResponse,
          ] =
            await Promise.all([
              apiRequest<ChatterDetailResponse>(
                `/api/chatters/${encodeURIComponent(
                  id
                )}`
              ),

              apiRequest<IncidentListResponse>(
                `/api/incidents?chatterId=${encodeURIComponent(
                  id
                )}`
              ),
            ]);

          setChatter(
            chatterResponse.data
          );

          setIncidents(
            incidentResponse.data
          );
        } catch (
          loadError
        ) {
          const message =
            loadError instanceof Error
              ? loadError.message
              : "Failed to load chatter details";

          setError(
            message
          );

          toast.error(
            message,
            "Unable to load chatter QA profile"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        toast,
      ]
    );

  useEffect(
    () => {
      if (
        !chatterId
      ) {
        return;
      }

      void loadDetails(
        chatterId
      );
    },
    [
      chatterId,
      modelContextRevision,
      loadDetails,
    ]
  );

  useEffect(
    () => {
      const handleModelContextChange =
        () => {
          setIncidentFilter(
            "ALL"
          );

          setExpandedIncidentId(
            null
          );

          setHistoryPage(
            1
          );

          setPendingConfirmation(
            null
          );

          setShowEdit(
            false
          );

          setLinkedStrikeByIncidentId(
            {}
          );

          setModelContextRevision(
            (
              current
            ) =>
              current +
              1
          );
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
    []
  );

  const incidentStats =
    useMemo(
      () => {
        const stats = {
          total:
            incidents.length,

          open:
            0,

          resolved:
            0,

          voided:
            0,
        };

        for (
          const incident of
          incidents
        ) {
          if (
            incident.status ===
              "OPEN"
          ) {
            stats.open +=
              1;
          }

          if (
            incident.status ===
              "RESOLVED"
          ) {
            stats.resolved +=
              1;
          }

          if (
            incident.status ===
              "VOIDED"
          ) {
            stats.voided +=
              1;
          }
        }

        return stats;
      },
      [
        incidents,
      ]
    );

  const filteredIncidents =
    useMemo(
      () =>
        incidents.filter(
          (
            incident
          ) =>
            incidentFilter ===
              "ALL" ||
            incident.status ===
              incidentFilter
        ),
      [
        incidents,
        incidentFilter,
      ]
    );

  const historyPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredIncidents.length /
          CHATTER_HISTORY_PAGE_SIZE
      )
    );

  const safeHistoryPage =
    Math.min(
      historyPage,
      historyPageCount
    );

  function selectIncidentFilter(
    filter:
      IncidentFilter
  ) {
    setIncidentFilter(
      filter
    );

    setHistoryPage(
      1
    );

    setExpandedIncidentId(
      null
    );
  }

  const visibleIncidents =
    useMemo(
      () =>
        filteredIncidents.slice(
          (
            safeHistoryPage -
            1
          ) *
            CHATTER_HISTORY_PAGE_SIZE,
          safeHistoryPage *
            CHATTER_HISTORY_PAGE_SIZE
        ),
      [
        filteredIncidents,
        safeHistoryPage,
      ]
    );

  useEffect(
    () => {
      if (
        !canViewStrikes ||
        visibleIncidents.length ===
          0
      ) {
        return;
      }

      const uncheckedIncidents =
        visibleIncidents.filter(
          (
            incident
          ) =>
            !Object.prototype
              .hasOwnProperty
              .call(
                linkedStrikeByIncidentId,
                incident.id
              )
        );

      if (
        uncheckedIncidents.length ===
          0
      ) {
        return;
      }

      let cancelled =
        false;

      void Promise.all(
        uncheckedIncidents.map(
          async (
            incident
          ) => {
            try {
              const response =
                await apiRequest<LinkedStrikeResponse>(
                  `/api/strikes/source-incident/${encodeURIComponent(
                    incident.id
                  )}`
                );

              return [
                incident.id,
                response.data,
              ] as const;
            } catch {
              /*
               * This lookup is supplemental QA context.
               * Do not break chatter history if an individual
               * Strike lookup cannot be completed.
               */
              return [
                incident.id,
                null,
              ] as const;
            }
          }
        )
      ).then(
        (
          entries
        ) => {
          if (
            cancelled
          ) {
            return;
          }

          setLinkedStrikeByIncidentId(
            (
              current
            ) => ({
              ...current,
              ...Object.fromEntries(
                entries
              ),
            })
          );
        }
      );

      return () => {
        cancelled =
          true;
      };
    },
    [
      canViewStrikes,
      visibleIncidents,
      linkedStrikeByIncidentId,
    ]
  );

  function openEdit() {
    if (
      !chatter
    ) {
      return;
    }

    setName(
      chatter.name
    );

    setFormError(
      ""
    );

    setShowEdit(
      true
    );
  }

  function closeEdit() {
    if (
      isSaving
    ) {
      return;
    }

    setShowEdit(
      false
    );

    setFormError(
      ""
    );

    setPendingConfirmation(
      null
    );
  }

  function handleEditSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !chatter
    ) {
      return;
    }

    const trimmed =
      name.trim();

    if (
      !trimmed
    ) {
      setFormError(
        "Chatter name is required."
      );

      return;
    }

    if (
      trimmed ===
        chatter.name.trim()
    ) {
      toast.info(
        "No chatter changes were detected.",
        "No changes"
      );

      return;
    }

    setFormError(
      ""
    );

    setPendingConfirmation({
      type:
        "edit",

      name:
        trimmed,
    });
  }

  function requestStatusChange(
    action:
      | "deactivate"
      | "reactivate"
  ) {
    setPendingConfirmation({
      type:
        "status",

      action,
    });
  }

  async function saveEdit(
    nextName:
      string
  ) {
    if (
      !chatter
    ) {
      return;
    }

    try {
      setIsSaving(
        true
      );

      const response =
        await apiRequest<ChatterMutationResponse>(
          `/api/chatters/${encodeURIComponent(
            chatter.id
          )}`,
          {
            method:
              "PATCH",

            body:
              JSON.stringify({
                name:
                  nextName,
              }),
          }
        );

      setChatter(
        response.data
      );

      setName(
        response.data.name
      );

      setPendingConfirmation(
        null
      );

      setShowEdit(
        false
      );

      toast.success(
        response.message,
        "Chatter updated"
      );
    } catch (
      saveError
    ) {
      const message =
        saveError instanceof Error
          ? saveError.message
          : "Failed to update chatter";

      setPendingConfirmation(
        null
      );

      setFormError(
        message
      );

      toast.error(
        message,
        "Chatter not updated"
      );
    } finally {
      setIsSaving(
        false
      );
    }
  }

  async function changeStatus(
    action:
      | "deactivate"
      | "reactivate"
  ) {
    if (
      !chatter
    ) {
      return;
    }

    try {
      setStatusBusy(
        true
      );

      const response =
        await apiRequest<ChatterMutationResponse>(
          `/api/chatters/${encodeURIComponent(
            chatter.id
          )}/${action}`,
          {
            method:
              "PATCH",
          }
        );

      setPendingConfirmation(
        null
      );

      toast.success(
        response.message,
        action ===
          "deactivate"
          ? "Chatter deactivated"
          : "Chatter reactivated"
      );

      navigate(
        getReturnPath()
      );
    } catch (
      statusError
    ) {
      const message =
        statusError instanceof Error
          ? statusError.message
          : "Failed to update chatter status";

      setPendingConfirmation(
        null
      );

      toast.error(
        message,
        "Chatter not updated"
      );
    } finally {
      setStatusBusy(
        false
      );
    }
  }

  async function confirmPendingAction() {
    if (
      !pendingConfirmation
    ) {
      return;
    }

    if (
      pendingConfirmation.type ===
        "edit"
    ) {
      await saveEdit(
        pendingConfirmation.name
      );

      return;
    }

    await changeStatus(
      pendingConfirmation.action
    );
  }

  const confirmationContent =
    useMemo(
      () => {
        if (
          !pendingConfirmation ||
          !chatter
        ) {
          return null;
        }

        if (
          pendingConfirmation.type ===
            "edit"
        ) {
          return {
            title:
              "Save Chatter Changes?",

            message:
              `Update this chatter's name to "${pendingConfirmation.name}"?`,

            confirmLabel:
              "Save Changes",

            danger:
              false,
          };
        }

        if (
          pendingConfirmation.action ===
            "deactivate"
        ) {
          return {
            title:
              "Deactivate Chatter?",

            message:
              `Deactivate "${chatter.name}"? They will no longer be available when logging new incidents, but all existing QA history will remain preserved.`,

            confirmLabel:
              "Deactivate",

            danger:
              true,
          };
        }

        return {
          title:
            "Reactivate Chatter?",

          message:
            `Reactivate "${chatter.name}"? They will become available for new incident logging again.`,

          confirmLabel:
            "Reactivate",

          danger:
            false,
        };
      },
      [
        pendingConfirmation,
        chatter,
      ]
    );

  const confirmationBusy =
    pendingConfirmation?.type ===
      "edit"
      ? isSaving
      : pendingConfirmation?.type ===
          "status"
        ? statusBusy
        : false;

  if (
    !chatterId
  ) {
    return (
      <div className="page">
        <div className="chatter-detail-page">
          <button
            type="button"
            className="secondary-button chatter-detail-back"
            onClick={() =>
              navigate(
                getReturnPath()
              )
            }
          >
            {getReturnLabel()}
          </button>

          <div className="alert alert-error">
            A valid chatter ID is required.
          </div>
        </div>
      </div>
    );
  }

  if (
    loading &&
    !chatter
  ) {
    return (
      <div className="page">
        <div className="chatter-detail-page">
          <button
            type="button"
            className="secondary-button chatter-detail-back"
            onClick={() =>
              navigate(
                getReturnPath()
              )
            }
          >
            {getReturnLabel()}
          </button>

          <section className="content-card chatter-detail-loading-card">
            <div className="empty-state">
              <strong>
                Loading chatter QA profile...
              </strong>
            </div>
          </section>
        </div>
      </div>
    );
  }

  if (
    error ||
    !chatter
  ) {
    return (
      <div className="page">
        <div className="chatter-detail-page">
          <button
            type="button"
            className="secondary-button chatter-detail-back"
            onClick={() =>
              navigate(
                getReturnPath()
              )
            }
          >
            {getReturnLabel()}
          </button>

          <div className="alert alert-error">
            {error ||
              "Chatter not found."}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page">
      <div className="chatter-detail-page">
        <button
          type="button"
          className="secondary-button chatter-detail-back"
          onClick={() =>
            navigate(
              getReturnPath()
            )
          }
          disabled={
            isSaving ||
            statusBusy ||
            showEdit
          }
        >
          {getReturnLabel()}
        </button>

        <section className="content-card chatter-detail-card">
          <div className="chatter-profile-header">
            <div className="chatter-profile-identity">
              <div>
                <div className="chatter-profile-title-row">
                  <h3>
                    {chatter.name}
                  </h3>

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
                </div>

                <p>
                  Chatter QA profile
                  and incident history
                </p>

              </div>
            </div>
          </div>

          <div className="chatter-profile-content">
            {canConfigureQa ? (
              <div className="chatter-profile-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    openEdit
                  }
                  disabled={
                    statusBusy
                  }
                >
                  Edit Chatter
                </button>

                {chatter.status ===
                "ACTIVE" ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      requestStatusChange(
                        "deactivate"
                      )
                    }
                    disabled={
                      statusBusy
                    }
                  >
                    {statusBusy
                      ? "Updating..."
                      : "Deactivate"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-button chatter-reactivate-button"
                    onClick={() =>
                      requestStatusChange(
                        "reactivate"
                      )
                    }
                    disabled={
                      statusBusy
                    }
                  >
                    {statusBusy
                      ? "Updating..."
                      : "Reactivate"}
                  </button>
                )}
              </div>
            ) : (
              <div className="alert alert-info">
                Read-only QA view. Chatter record changes require management access.
              </div>
            )}

            <section className="chatter-profile-section">
              <div className="chatter-profile-section-heading">
                <div>
                  <span>
                    QA Summary
                  </span>

                  <h4>
                    Incident Summary
                  </h4>
                </div>
              </div>

              <div className="chatter-stat-grid">
                <div className="chatter-stat-card">
                  <span>
                    Total Incidents
                  </span>

                  <strong>
                    {incidentStats.total}
                  </strong>
                </div>

                <div className="chatter-stat-card open">
                  <span>
                    Open
                  </span>

                  <strong>
                    {incidentStats.open}
                  </strong>
                </div>

                <div className="chatter-stat-card resolved">
                  <span>
                    Resolved
                  </span>

                  <strong>
                    {incidentStats.resolved}
                  </strong>
                </div>

                <div className="chatter-stat-card voided">
                  <span>
                    Voided
                  </span>

                  <strong>
                    {incidentStats.voided}
                  </strong>
                </div>
              </div>
            </section>

            <section className="chatter-profile-section chatter-incidents-section">
              <div className="chatter-profile-section-heading incident-history-heading">
                <div>
                  <span>
                    QA History
                  </span>

                  <h4>
                    Incidents
                  </h4>
                </div>

                <div className="chatter-history-controls">
                  <div className="filter-group chatter-incident-filters">
                    {(
                      [
                        "ALL",
                        "OPEN",
                        "RESOLVED",
                        "VOIDED",
                      ] as const
                    ).map(
                      (
                        value
                      ) => (
                        <button
                          key={
                            value
                          }
                          type="button"
                          className={
                            incidentFilter ===
                            value
                              ? "filter-button active"
                              : "filter-button"
                          }
                          onClick={() =>
                            selectIncidentFilter(
                              value
                            )
                          }
                        >
                          {value ===
                          "ALL"
                            ? "All"
                            : value ===
                                "OPEN"
                              ? "Open"
                              : value ===
                                  "RESOLVED"
                                ? "Resolved"
                                : "Voided"}
                        </button>
                      )
                    )}
                  </div>
                </div>
              </div>

              {visibleIncidents.length ===
                0 ? (
                <div className="chatter-profile-empty">
                  <strong>
                    {incidents.length ===
                    0
                      ? "No incidents recorded"
                      : "No incidents match these filters"}
                  </strong>

                  <span>
                    {incidents.length ===
                    0
                      ? "This chatter currently has no QA incident history."
                      : "Choose another incident status to view other records."}
                  </span>
                </div>
              ) : (
                <div className="chatter-incident-list">
                  {visibleIncidents.map(
                    (
                      incident
                    ) => {
                      const isExpanded =
                        expandedIncidentId ===
                        incident.id;

                      return (
                        <article
                          key={
                            incident.id
                          }
                          className={
                            isExpanded
                              ? "chatter-incident-item expanded"
                              : "chatter-incident-item"
                          }
                        >
                          <button
                            type="button"
                            className="chatter-incident-summary"
                            onClick={() =>
                              setExpandedIncidentId(
                                (
                                  current
                                ) =>
                                  current ===
                                  incident.id
                                    ? null
                                    : incident.id
                              )
                            }
                            aria-expanded={
                              isExpanded
                            }
                          >
                            <div className="chatter-incident-main">
                              <div className="chatter-incident-title-row">
                                <strong>
                                  {
                                    incident.ruleTitleSnapshot
                                  }
                                </strong>

                                <span
                                  className={getIncidentStatusClass(
                                    incident.status
                                  )}
                                >
                                  {formatIncidentStatus(
                                    incident.status
                                  )}
                                </span>
                              </div>

                              <div className="chatter-incident-meta">
                                <span>
                                  v
                                  {
                                    incident.ruleVersion.versionNumber
                                  }
                                </span>

                                <span>
                                  {incident.severityNameSnapshot ??
                                    "No severity"}
                                </span>

                                <span>
                                  {incident.weightNameSnapshot
                                    ? `${incident.weightNameSnapshot}${
                                        incident.weightValueSnapshot !==
                                        null
                                          ? ` (${incident.weightValueSnapshot})`
                                          : ""
                                      }`
                                    : "No weight"}
                                </span>

                                <time>
                                  Occurred{" "}
                                  {formatTexasDateTime(
                                    incident.occurredAt
                                  )}
                                </time>
                              </div>
                            </div>

                            <span
                              className={
                                isExpanded
                                  ? "chatter-incident-chevron expanded"
                                  : "chatter-incident-chevron"
                              }
                              aria-hidden="true"
                            >
                              <svg
                                viewBox="0 0 20 20"
                                fill="none"
                              >
                                <path
                                  d="M5.5 7.5L10 12L14.5 7.5"
                                  stroke="currentColor"
                                  strokeWidth="1.7"
                                  strokeLinecap="round"
                                  strokeLinejoin="round"
                                />
                              </svg>
                            </span>
                          </button>

                          {canViewStrikes &&
                            linkedStrikeByIncidentId[
                              incident.id
                            ] && (
                            <div className="chatter-linked-strike-row">
                              <span className="chatter-linked-strike-badge">
                                Linked Strike ·{" "}
                                {formatLinkedStrikeStatus(
                                  linkedStrikeByIncidentId[
                                    incident.id
                                  ]!.status
                                )}
                              </span>

                              <button
                                type="button"
                                className="secondary-button chatter-linked-strike-button"
                                onClick={() => {
                                  const linkedStrike =
                                    linkedStrikeByIncidentId[
                                      incident.id
                                    ];

                                  if (
                                    !linkedStrike
                                  ) {
                                    return;
                                  }

                                  navigate(
                                    `/strikes?strikeId=${encodeURIComponent(
                                      linkedStrike.id
                                    )}`
                                  );
                                }}
                              >
                                View Strike
                              </button>
                            </div>
                          )}

                          {isExpanded && (
                            <div className="chatter-incident-details">
                              <div className="chatter-incident-detail-block">
                                <span>
                                  Rule Definition
                                </span>

                                <p>
                                  {
                                    incident.ruleDefinitionSnapshot
                                  }
                                </p>
                              </div>

                              <div className="chatter-incident-detail-block">
                                <span>
                                  Incident Details
                                </span>

                                <p>
                                  {
                                    incident.details
                                  }
                                </p>
                              </div>

                              {incident.evidenceUrl && (
                                <div className="chatter-incident-detail-block">
                                  <span>
                                    Evidence
                                  </span>

                                  <a
                                    href={
                                      incident.evidenceUrl
                                    }
                                    target="_blank"
                                    rel="noreferrer"
                                    className="evidence-link"
                                  >
                                    Open supporting evidence
                                  </a>
                                </div>
                              )}

                              {incident.status ===
                                "RESOLVED" && (
                                <div className="chatter-incident-lifecycle resolved">
                                  <span>
                                    Resolution
                                  </span>

                                  <p>
                                    {incident.resolutionNotes ||
                                      "No resolution notes were provided."}
                                  </p>

                                  {incident.resolvedAt && (
                                    <small>
                                      Resolved{" "}
                                      {formatTexasDateTime(
                                        incident.resolvedAt
                                      )}
                                    </small>
                                  )}
                                </div>
                              )}

                              {incident.status ===
                                "VOIDED" && (
                                <div className="chatter-incident-lifecycle voided">
                                  <span>
                                    Void Reason
                                  </span>

                                  <p>
                                    {incident.voidReason ||
                                      "No void reason was recorded."}
                                  </p>

                                  {incident.voidedAt && (
                                    <small>
                                      Voided{" "}
                                      {formatTexasDateTime(
                                        incident.voidedAt
                                      )}
                                    </small>
                                  )}
                                </div>
                              )}

                              <div className="chatter-incident-detail-actions">
                                <button
                                  type="button"
                                  className="secondary-button"
                                  onClick={() =>
                                    navigate(
                                      `/incidents?incidentId=${encodeURIComponent(
                                        incident.id
                                      )}`
                                    )
                                  }
                                >
                                  Open Incident
                                </button>
                              </div>
                            </div>
                          )}
                        </article>
                      );
                    }
                  )}
                </div>
              )}

              {filteredIncidents.length >
                0 &&
                historyPageCount >
                  1 && (
                <div
                  className="qa-history-pagination"
                  aria-label="Chatter QA history pagination"
                >
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setHistoryPage(
                        Math.max(
                          1,
                          safeHistoryPage -
                            1
                        )
                      )
                    }
                    disabled={
                      safeHistoryPage <=
                      1
                    }
                  >
                    Previous
                  </button>

                  <span>
                    Page {safeHistoryPage} of {historyPageCount}
                  </span>

                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() =>
                      setHistoryPage(
                        Math.min(
                          historyPageCount,
                          safeHistoryPage +
                            1
                        )
                      )
                    }
                    disabled={
                      safeHistoryPage >=
                      historyPageCount
                    }
                  >
                    Next
                  </button>
                </div>
              )}
            </section>
          </div>
        </section>
      </div>

      {showEdit &&
        canConfigureQa && (
        <div
          className="modal-backdrop chatter-edit-backdrop"
          onMouseDown={
            closeEdit
          }
        >
          <div
            className="modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Edit Chatter
                </h3>

                <p>
                  Update the chatter's
                  display name.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeEdit
                }
                aria-label="Close"
                disabled={
                  isSaving
                }
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={
                handleEditSubmit
              }
            >
              <label className="form-field">
                <span>
                  Chatter Name
                </span>

                <input
                  type="text"
                  value={name}
                  onChange={(
                    event
                  ) => {
                    setName(
                      event.target
                        .value
                    );

                    if (
                      formError
                    ) {
                      setFormError(
                        ""
                      );
                    }
                  }}
                  autoFocus
                  maxLength={100}
                  disabled={
                    isSaving
                  }
                />
              </label>

              {formError && (
                <div className="alert alert-error">
                  {formError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    closeEdit
                  }
                  disabled={
                    isSaving
                  }
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={
                    isSaving
                  }
                >
                  {isSaving
                    ? "Saving..."
                    : "Save Changes"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingConfirmation &&
        confirmationContent && (
        <div
          className="modal-backdrop confirmation-backdrop"
          onMouseDown={() => {
            if (
              !confirmationBusy
            ) {
              setPendingConfirmation(
                null
              );
            }
          }}
        >
          <div
            className="modal confirmation-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
            role="dialog"
            aria-modal="true"
          >
            <div className="modal-header">
              <div>
                <h3>
                  {
                    confirmationContent.title
                  }
                </h3>

                <p>
                  Please confirm
                  before continuing.
                </p>
              </div>
            </div>

            <div className="confirmation-body">
              <p>
                {
                  confirmationContent.message
                }
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={
                  confirmationBusy
                }
                onClick={() =>
                  setPendingConfirmation(
                    null
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  confirmationContent.danger
                    ? "danger-button"
                    : "primary-button"
                }
                disabled={
                  confirmationBusy
                }
                onClick={() =>
                  void confirmPendingAction()
                }
              >
                {confirmationBusy
                  ? "Processing..."
                  : confirmationContent.confirmLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChatterDetailPage;
