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
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
} from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";

import {
  useToast,
} from "../components/ToastProvider";

type IncidentStatus =
  | "OPEN"
  | "RESOLVED"
  | "VOIDED";

type StrikeActivityStatus =
  | "ACTIVE"
  | "EXPIRED"
  | "NOT_APPLICABLE";

type Chatter = {
  id: string;
  name: string;
  status:
    | "ACTIVE"
    | "INACTIVE";
};

type RuleVersion = {
  id: string;
  ruleId: string;
  versionNumber: number;
  title: string;
  definition: string;

  severityNameSnapshot:
    | string
    | null;

  weightNameSnapshot:
    | string
    | null;

  weightValueSnapshot:
    | number
    | null;
};

type Rule = {
  id: string;
  isActive: boolean;

  currentVersion:
    | RuleVersion
    | null;
};

type Incident = {
  id: string;

  chatterId: string;
  ruleVersionId: string;
  modelId: string | null;

  agencyModel: {
    id: string;
    name: string;
    isActive: boolean;
  } | null;

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
  expiresAt: string;

  strikeActivityStatus:
    StrikeActivityStatus;

  details: string;

  evidenceUrl:
    | string
    | null;

  status: IncidentStatus;

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

  chatter: Chatter;

  ruleVersion: {
    id: string;
    ruleId: string;
    versionNumber: number;
  };

  createdAt?: string;
  updatedAt?: string;
};

type IncidentListResponse = {
  data: Incident[];
};

type IncidentDetailResponse = {
  data: Incident;
};

type ChatterListResponse = {
  data: Chatter[];
};

type RuleListResponse = {
  data: Rule[];
};

type StrikeLadderVersion = {
  id: string;
  versionNumber: number;
  durationDays: number;
  isCurrent: boolean;
};

type StrikeLadderResponse = {
  data: StrikeLadderVersion;
};

type IncidentMutationResponse = {
  message: string;
  data: Incident;
};

type IncidentFilter =
  | "ALL"
  | IncidentStatus;

type StrikeActivityFilter =
  | "ALL"
  | "ACTIVE"
  | "EXPIRED";

type ActionType =
  | "resolve"
  | "void";

type LogIncidentPayload = {
  chatterId: string;
  ruleId: string;
  details: string;

  evidenceUrl:
    | string
    | null;
};

type PendingConfirmation =
  | {
      type: "log";
      payload: LogIncidentPayload;
    }
  | {
      type: "action";
      action:
        | "resolve"
        | "void";
      incident: Incident;
      notes: string;
    };

function IncidentsPage() {
  const toast = useToast();

  const [
    incidents,
    setIncidents,
  ] = useState<Incident[]>([]);

  const [
    activeChatters,
    setActiveChatters,
  ] = useState<Chatter[]>([]);

  const [
    allChatters,
    setAllChatters,
  ] = useState<Chatter[]>([]);

  const [
    activeRules,
    setActiveRules,
  ] = useState<Rule[]>([]);

  const [
    allRules,
    setAllRules,
  ] = useState<Rule[]>([]);

  const [
    currentStrikeLadder,
    setCurrentStrikeLadder,
  ] =
    useState<StrikeLadderVersion | null>(
      null
    );

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<IncidentFilter>(
      "ALL"
    );

  const [
    strikeActivityFilter,
    setStrikeActivityFilter,
  ] =
    useState<StrikeActivityFilter>(
      "ALL"
    );

  const [
    chatterFilter,
    setChatterFilter,
  ] = useState("");

  const [
    ruleFilter,
    setRuleFilter,
  ] = useState("");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    dependenciesLoading,
    setDependenciesLoading,
  ] = useState(true);

  const [
    pageError,
    setPageError,
  ] = useState("");

  const [
    modelContextRevision,
    setModelContextRevision,
  ] = useState(0);

  /*
   * =========================================================
   * LOG INCIDENT
   * =========================================================
   */

  const [
    showLogModal,
    setShowLogModal,
  ] = useState(false);

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    formError,
    setFormError,
  ] = useState("");

  const [
    chatterId,
    setChatterId,
  ] = useState("");

  const [
    ruleId,
    setRuleId,
  ] = useState("");

  const [
    details,
    setDetails,
  ] = useState("");

  const [
    evidenceUrl,
    setEvidenceUrl,
  ] = useState("");

  /*
   * =========================================================
   * INCIDENT DETAILS
   * =========================================================
   */

  const [
    selectedIncident,
    setSelectedIncident,
  ] =
    useState<Incident | null>(
      null
    );

  const [
    detailLoading,
    setDetailLoading,
  ] = useState(false);

  /*
   * =========================================================
   * RESOLVE / VOID
   * =========================================================
   */

  const [
    actionType,
    setActionType,
  ] =
    useState<ActionType | null>(
      null
    );

  const [
    actionIncident,
    setActionIncident,
  ] =
    useState<Incident | null>(
      null
    );

  const [
    actionNotes,
    setActionNotes,
  ] = useState("");

  const [
    actionError,
    setActionError,
  ] = useState("");

  const [
    actionSaving,
    setActionSaving,
  ] = useState(false);

  /*
   * =========================================================
   * CONFIRMATION
   * =========================================================
   */

  const [
    pendingConfirmation,
    setPendingConfirmation,
  ] =
    useState<PendingConfirmation | null>(
      null
    );

  /*
   * =========================================================
   * LOAD DEPENDENCIES
   * =========================================================
   */

  const loadDependencies =
    useCallback(async () => {
      try {
        setDependenciesLoading(
          true
        );

        setPageError("");

        const [
          chatterResponse,
          ruleResponse,
          ladderResponse,
        ] = await Promise.all([
          apiRequest<ChatterListResponse>(
            "/api/chatters"
          ),

          apiRequest<RuleListResponse>(
            "/api/rules"
          ),

          apiRequest<StrikeLadderResponse>(
            "/api/strike-ladder"
          ),
        ]);

        const completeChatters =
          chatterResponse.data;

        const completeRules =
          ruleResponse.data.filter(
            (rule) =>
              rule.currentVersion !==
              null
          );

        setAllChatters(
          completeChatters
        );

        setAllRules(
          completeRules
        );

        setCurrentStrikeLadder(
          ladderResponse.data
        );

        setActiveChatters(
          completeChatters.filter(
            (chatter) =>
              chatter.status ===
              "ACTIVE"
          )
        );

        setActiveRules(
          completeRules.filter(
            (rule) =>
              rule.isActive
          )
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load incident dependencies";

        setPageError(message);

        toast.error(
          message,
          "Unable to load incident data"
        );
      } finally {
        setDependenciesLoading(
          false
        );
      }
    }, [
      toast,
      modelContextRevision,
    ]);

  /*
   * =========================================================
   * LOAD INCIDENTS
   * =========================================================
   */

  const loadIncidents =
    useCallback(async () => {
      try {
        setIsLoading(true);

        setPageError("");

        const params =
          new URLSearchParams();

        if (
          statusFilter !== "ALL"
        ) {
          params.set(
            "status",
            statusFilter
          );
        }

        if (chatterFilter) {
          params.set(
            "chatterId",
            chatterFilter
          );
        }

        if (ruleFilter) {
          params.set(
            "ruleId",
            ruleFilter
          );
        }

        const query =
          params.toString();

        const response =
          await apiRequest<IncidentListResponse>(
            `/api/incidents${
              query
                ? `?${query}`
                : ""
            }`
          );

        setIncidents(
          response.data
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load incidents";

        setPageError(message);

        toast.error(
          message,
          "Unable to load incidents"
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      statusFilter,
      chatterFilter,
      ruleFilter,
      toast,
      modelContextRevision,
    ]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  useEffect(() => {
    const handleModelContextChange =
      () => {
        setChatterFilter("");
        setChatterId("");
        setRuleId("");
        setFormError("");
        setShowLogModal(false);
        setSelectedIncident(null);
        setActionType(null);
        setActionIncident(null);
        setActionNotes("");
        setActionError("");
        setPendingConfirmation(null);

        setModelContextRevision(
          (current) =>
            current + 1
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
  }, []);

  /*
   * =========================================================
   * SELECTED RULE / CHATTER
   * =========================================================
   */

  const selectedRule =
    useMemo(
      () =>
        activeRules.find(
          (rule) =>
            rule.id === ruleId
        ) ?? null,
      [
        activeRules,
        ruleId,
      ]
    );

  const selectedChatter =
    useMemo(
      () =>
        activeChatters.find(
          (chatter) =>
            chatter.id ===
            chatterId
        ) ?? null,
      [
        activeChatters,
        chatterId,
      ]
    );

  /*
   * =========================================================
   * SEARCH + STRIKE FILTER
   * =========================================================
   */

  const visibleIncidents =
    useMemo(() => {
      const query = search
        .trim()
        .toLowerCase();

      return incidents.filter(
        (incident) => {
          if (
            strikeActivityFilter !==
              "ALL" &&
            incident
              .strikeActivityStatus !==
              strikeActivityFilter
          ) {
            return false;
          }

          if (!query) {
            return true;
          }

          const searchable = [
            incident.chatter.name,

            incident.agencyModel?.name,

            incident
              .ruleTitleSnapshot,

            incident
              .ruleDefinitionSnapshot,

            incident.details,

            incident
              .severityNameSnapshot,

            incident
              .weightNameSnapshot,

            incident.status,

            formatStatus(
              incident.status
            ),

            incident
              .strikeActivityStatus,

            formatStrikeActivityStatus(
              incident
                .strikeActivityStatus
            ),

            incident.occurredAt,

            formatCentralDateTime(incident.occurredAt),

            incident.expiresAt,

            formatCentralDateTime(incident.expiresAt),

            incident
              .resolutionNotes,

            incident.voidReason,
          ]
            .filter(Boolean)
            .join(" ")
            .toLowerCase();

          return searchable.includes(
            query
          );
        }
      );
    }, [
      incidents,
      search,
      strikeActivityFilter,
    ]);

  /*
   * =========================================================
   * LOG INCIDENT
   * =========================================================
   */

  function resetLogForm() {
    setChatterId("");

    setRuleId("");

    setDetails("");

    setEvidenceUrl("");

    setFormError("");
  }

  function openLogIncident() {
    resetLogForm();

    setPageError("");

    setShowLogModal(true);
  }

  function closeLogIncident() {
    if (isSaving) {
      return;
    }

    setPendingConfirmation(
      null
    );

    setShowLogModal(false);

    resetLogForm();
  }

  function showLogError(
    message: string
  ) {
    setFormError(message);

    toast.error(
      message,
      "Check incident details"
    );
  }

  function handleLogIncident(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!chatterId) {
      showLogError(
        "Please select a chatter."
      );

      return;
    }

    if (!ruleId) {
      showLogError(
        "Please select a rule."
      );

      return;
    }

    const trimmedDetails =
      details.trim();

    if (!trimmedDetails) {
      showLogError(
        "Incident details are required."
      );

      return;
    }

    const trimmedEvidenceUrl =
      evidenceUrl.trim();

    if (trimmedEvidenceUrl) {
      let parsedUrl: URL;

      try {
        parsedUrl =
          new URL(
            trimmedEvidenceUrl
          );
      } catch {
        showLogError(
          "Evidence URL must be a valid URL."
        );

        return;
      }

      if (
        parsedUrl.protocol !==
          "http:" &&
        parsedUrl.protocol !==
          "https:"
      ) {
        showLogError(
          "Evidence URL must begin with http:// or https://."
        );

        return;
      }
    }

    setFormError("");

    setPendingConfirmation({
      type: "log",

      payload: {
        chatterId,

        ruleId,

        details:
          trimmedDetails,

        evidenceUrl:
          trimmedEvidenceUrl ||
          null,
      },
    });
  }

  async function confirmLogIncident(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "log";
      }
    >
  ) {
    try {
      setIsSaving(true);

      setFormError("");

      setPageError("");

      const response =
        await apiRequest<IncidentMutationResponse>(
          "/api/incidents",
          {
            method: "POST",

            body:
              JSON.stringify(
                confirmation.payload
              ),
          }
        );

      setPendingConfirmation(
        null
      );

      setShowLogModal(false);

      resetLogForm();

      toast.success(
        response.message,
        "Incident logged"
      );

      await Promise.all([
        loadIncidents(),
        loadDependencies(),
      ]);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to log incident";

      setPendingConfirmation(
        null
      );

      setFormError(message);

      toast.error(
        message,
        "Incident not logged"
      );
    } finally {
      setIsSaving(false);
    }
  }

  /*
   * =========================================================
   * INCIDENT DETAILS
   * =========================================================
   */

  async function openIncidentDetails(
    incident: Incident
  ) {
    try {
      setDetailLoading(true);

      setPageError("");

      const response =
        await apiRequest<IncidentDetailResponse>(
          `/api/incidents/${incident.id}`
        );

      setSelectedIncident(
        response.data
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load incident";

      setPageError(message);

      toast.error(
        message,
        "Unable to load incident"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function closeIncidentDetails() {
    if (detailLoading) {
      return;
    }

    setSelectedIncident(null);
  }

  /*
   * =========================================================
   * RESOLVE / VOID
   * =========================================================
   */

  function openAction(
    type: ActionType,
    incident: Incident
  ) {
    setActionType(type);

    setActionIncident(
      incident
    );

    setActionNotes("");

    setActionError("");

    setPendingConfirmation(
      null
    );
  }

  function closeAction() {
    if (actionSaving) {
      return;
    }

    setPendingConfirmation(
      null
    );

    setActionType(null);

    setActionIncident(null);

    setActionNotes("");

    setActionError("");
  }

  function showActionError(
    message: string
  ) {
    setActionError(message);

    toast.error(
      message,
      "Check incident action"
    );
  }

  function handleAction(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      !actionIncident ||
      !actionType
    ) {
      return;
    }

    const trimmedNotes =
      actionNotes.trim();

    if (
      actionType === "void" &&
      !trimmedNotes
    ) {
      showActionError(
        "A reason is required when voiding an incident."
      );

      return;
    }

    setActionError("");

    setPendingConfirmation({
      type: "action",

      action:
        actionType,

      incident:
        actionIncident,

      notes:
        trimmedNotes,
    });
  }

  async function confirmIncidentAction(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "action";
      }
    >
  ) {
    const {
      incident,
      action,
      notes,
    } = confirmation;

    try {
      setActionSaving(true);

      setActionError("");

      setPageError("");

      let response:
        IncidentMutationResponse;

      if (
        action === "resolve"
      ) {
        response =
          await apiRequest<IncidentMutationResponse>(
            `/api/incidents/${incident.id}/resolve`,
            {
              method: "PATCH",

              body:
                JSON.stringify({
                  resolutionNotes:
                    notes || null,
                }),
            }
          );
      } else {
        response =
          await apiRequest<IncidentMutationResponse>(
            `/api/incidents/${incident.id}/void`,
            {
              method: "PATCH",

              body:
                JSON.stringify({
                  reason:
                    notes,
                }),
            }
          );
      }

      setPendingConfirmation(
        null
      );

      setActionType(null);

      setActionIncident(null);

      setActionNotes("");

      setActionError("");

      if (
        selectedIncident?.id ===
        incident.id
      ) {
        setSelectedIncident(
          null
        );
      }

      toast.success(
        response.message,
        action === "resolve"
          ? "Incident resolved"
          : "Incident voided"
      );

      await loadIncidents();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update incident";

      setPendingConfirmation(
        null
      );

      setActionError(message);

      toast.error(
        message,
        "Incident not updated"
      );
    } finally {
      setActionSaving(false);
    }
  }

  /*
   * =========================================================
   * CONFIRMATION
   * =========================================================
   */

  async function confirmPendingAction() {
    if (
      !pendingConfirmation
    ) {
      return;
    }

    if (
      pendingConfirmation.type ===
      "log"
    ) {
      await confirmLogIncident(
        pendingConfirmation
      );

      return;
    }

    await confirmIncidentAction(
      pendingConfirmation
    );
  }

  function cancelConfirmation() {
    if (
      isSaving ||
      actionSaving
    ) {
      return;
    }

    setPendingConfirmation(
      null
    );
  }

  const confirmationContent =
    useMemo(() => {
      if (
        !pendingConfirmation
      ) {
        return null;
      }

      if (
        pendingConfirmation.type ===
        "log"
      ) {
        const chatter =
          activeChatters.find(
            (item) =>
              item.id ===
              pendingConfirmation
                .payload
                .chatterId
          );

        const rule =
          activeRules.find(
            (item) =>
              item.id ===
              pendingConfirmation
                .payload
                .ruleId
          );

        return {
          title:
            "Log Incident?",

          message:
            `Log this incident for "${
              chatter?.name ??
              "the selected chatter"
            }" under "${
              rule
                ?.currentVersion
                ?.title ??
              "the selected rule"
            }"?`,

          confirmLabel:
            "Log Incident",

          danger: false,
        };
      }

      if (
        pendingConfirmation.action ===
        "resolve"
      ) {
        return {
          title:
            "Resolve Incident?",

          message:
            `Mark the "${pendingConfirmation.incident.ruleTitleSnapshot}" incident for "${pendingConfirmation.incident.chatter.name}" as resolved?`,

          confirmLabel:
            "Resolve Incident",

          danger: false,
        };
      }

      return {
        title:
          "Void Incident?",

        message:
          `Void the "${pendingConfirmation.incident.ruleTitleSnapshot}" incident for "${pendingConfirmation.incident.chatter.name}"? The record will remain in the historical log as voided.`,

        confirmLabel:
          "Void Incident",

        danger: true,
      };
    }, [
      pendingConfirmation,
      activeChatters,
      activeRules,
    ]);

  const confirmationBusy =
    pendingConfirmation?.type ===
    "log"
      ? isSaving
      : pendingConfirmation?.type ===
          "action"
        ? actionSaving
        : false;

  /*
   * =========================================================
   * DISPLAY HELPERS
   * =========================================================
   */

  function getStatusClass(
    status: IncidentStatus
  ) {
    if (
      status === "OPEN"
    ) {
      return "incident-status open";
    }

    if (
      status === "RESOLVED"
    ) {
      return "incident-status resolved";
    }

    return "incident-status voided";
  }

  function formatStatus(
    status: IncidentStatus
  ) {
    if (
      status === "OPEN"
    ) {
      return "Open";
    }

    if (
      status === "RESOLVED"
    ) {
      return "Resolved";
    }

    return "Voided";
  }

  function getStrikeActivityClass(
    status: StrikeActivityStatus
  ) {
    if (
      status === "ACTIVE"
    ) {
      return "incident-status resolved";
    }

    if (
      status === "EXPIRED"
    ) {
      return "incident-status open";
    }

    return "";
  }

  function formatStrikeActivityStatus(
    status: StrikeActivityStatus
  ) {
    if (
      status === "ACTIVE"
    ) {
      return "Active";
    }

    if (
      status === "EXPIRED"
    ) {
      return "Expired";
    }

    return "â€”";
  }

  function formatExpiryLabel(
    status: StrikeActivityStatus
  ) {
    if (
      status === "NOT_APPLICABLE"
    ) {
      return "Expiry";
    }

    return status === "EXPIRED"
      ? "Expired"
      : "Expires";
  }

  /*
   * =========================================================
   * PAGE
   * =========================================================
   */

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            QA Records
          </p>

          <h2>
            Incidents
          </h2>

          <p className="page-description">
            Manage chatter
            incidents, preserve
            historical rule data,
            and track each strike
            through its automatic{" "}
            {currentStrikeLadder
              ? `${currentStrikeLadder.durationDays}-day`
              : "configured"}{" "}
            lifecycle.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={
            openLogIncident
          }
          disabled={
            dependenciesLoading ||
            !currentStrikeLadder ||
            activeChatters.length ===
              0 ||
            activeRules.length ===
              0
          }
        >
          Log Incident
        </button>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      {!dependenciesLoading &&
        (activeChatters.length ===
          0 ||
          activeRules.length ===
            0) && (
          <div className="dependency-warning">
            <strong>
              Incident logging is
              not available yet.
            </strong>

            <span>
              {activeChatters.length ===
                0 &&
                " Add at least one active chatter."}

              {activeRules.length ===
                0 &&
                " Add at least one active rule."}
            </span>
          </div>
        )}

      <section className="content-card">
        <div className="card-header incident-toolbar">
          <div>
            <h3>
              Incident Records
            </h3>

            <p>
              Review current and
              historical incident
              records.
            </p>
          </div>

          <div className="incident-toolbar-controls">
            <input
              className="search-input"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search incidents..."
              aria-label="Search incidents"
            />

            <select
              className="toolbar-select"
              value={
                chatterFilter
              }
              onChange={(event) =>
                setChatterFilter(
                  event.target.value
                )
              }
              aria-label="Filter by chatter"
            >
              <option value="">
                All Chatters
              </option>

              {allChatters.map(
                (chatter) => (
                  <option
                    key={
                      chatter.id
                    }
                    value={
                      chatter.id
                    }
                  >
                    {
                      chatter.name
                    }

                    {chatter.status ===
                    "INACTIVE"
                      ? " (Inactive)"
                      : ""}
                  </option>
                )
              )}
            </select>

            <select
              className="toolbar-select"
              value={
                ruleFilter
              }
              onChange={(event) =>
                setRuleFilter(
                  event.target.value
                )
              }
              aria-label="Filter by rule"
            >
              <option value="">
                All Rules
              </option>

              {allRules.map(
                (rule) => (
                  <option
                    key={
                      rule.id
                    }
                    value={
                      rule.id
                    }
                  >
                    {rule
                      .currentVersion
                      ?.title ??
                      "Untitled Rule"}

                    {!rule.isActive
                      ? " (Archived)"
                      : ""}
                  </option>
                )
              )}
            </select>

            <select
              className="toolbar-select"
              value={
                strikeActivityFilter
              }
              onChange={(event) =>
                setStrikeActivityFilter(
                  event.target
                    .value as StrikeActivityFilter
                )
              }
              aria-label="Filter by strike status"
            >
              <option value="ALL">
                All Strike Statuses
              </option>

              <option value="ACTIVE">
                Active Strikes
              </option>

              <option value="EXPIRED">
                Expired Strikes
              </option>
            </select>

            <div className="filter-group">
              {(
                [
                  [
                    "ALL",
                    "All",
                  ],
                  [
                    "OPEN",
                    "Open",
                  ],
                  [
                    "RESOLVED",
                    "Resolved",
                  ],
                  [
                    "VOIDED",
                    "Voided",
                  ],
                ] as const
              ).map(
                ([
                  value,
                  label,
                ]) => (
                  <button
                    key={
                      value
                    }
                    type="button"
                    className={
                      statusFilter ===
                      value
                        ? "filter-button active"
                        : "filter-button"
                    }
                    onClick={() =>
                      setStatusFilter(
                        value
                      )
                    }
                  >
                    {label}
                  </button>
                )
              )}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>
              Loading incidents...
            </strong>
          </div>
        ) : visibleIncidents.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching incidents
            </strong>

            <span>
              {search.trim() ||
              chatterFilter ||
              ruleFilter ||
              statusFilter !==
                "ALL" ||
              strikeActivityFilter !==
                "ALL"
                ? "No incident records match the current search or filters."
                : "Incident records will appear here after they are logged."}
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table incidents-table">
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
                {visibleIncidents.map(
                  (incident) => {
                    const isExpired =
                      incident
                        .strikeActivityStatus ===
                      "EXPIRED";

                    return (
                      <tr
                        key={
                          incident.id
                        }
                        className={[
                          "incident-clickable-row",
                          isExpired
                            ? "incident-row-expired"
                            : "",
                        ]
                          .filter(
                            Boolean
                          )
                          .join(" ")}
                        tabIndex={0}
                        role="button"
                        aria-label={`View ${incident.ruleTitleSnapshot} incident for ${incident.chatter.name}`}
                        onClick={() =>
                          void openIncidentDetails(
                            incident
                          )
                        }
                        onKeyDown={(
                          event
                        ) => {
                          if (
                            event.key ===
                              "Enter" ||
                            event.key ===
                              " "
                          ) {
                            event.preventDefault();

                            void openIncidentDetails(
                              incident
                            );
                          }
                        }}
                      >
                        <td>
                          <div className="primary-cell">
                            {
                              incident
                                .chatter
                                .name
                            }
                          </div>
                        </td>

                        <td>
                          {incident.agencyModel?.name ??
                            "Legacy / unassigned"}
                        </td>

                        <td>
                          <span className="incident-rule-inline">
                            <strong>
                              {
                                incident
                                  .ruleTitleSnapshot
                              }
                            </strong>

                            <sup className="incident-rule-version">
                              v
                              {
                                incident
                                  .ruleVersion
                                  .versionNumber
                              }
                            </sup>
                          </span>
                        </td>

                        <td>
                          {incident
                            .severityNameSnapshot ??
                            "â€”"}
                        </td>

                        <td>
                          {incident
                            .weightNameSnapshot ? (
                            <div className="weight-display">
                              <span>
                                {
                                  incident
                                    .weightNameSnapshot
                                }
                              </span>

                              {incident
                                .weightValueSnapshot !==
                                null && (
                                <span className="weight-value">
                                  {
                                    incident
                                      .weightValueSnapshot
                                  }
                                </span>
                              )}
                            </div>
                          ) : (
                            "â€”"
                          )}
                        </td>

                        <td className="incident-date-cell">
                          {formatCentralDateTime(incident.occurredAt)}
                        </td>

                        <td className="incident-date-cell">
                          {incident
                            .strikeActivityStatus ===
                          "NOT_APPLICABLE" ? (
                            <span>
                              â€”
                            </span>
                          ) : (
                            <span className="incident-expiry-date">
                              <span className="incident-expiry-label">
                                {incident
                                  .strikeActivityStatus ===
                                "EXPIRED"
                                  ? "Expired"
                                  : "Expires"}
                              </span>

                              <span>
                                {formatCentralDateTime(incident.expiresAt)}
                              </span>
                            </span>
                          )}
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
                          {incident
                            .strikeActivityStatus ===
                          "NOT_APPLICABLE" ? (
                            <span>
                              â€”
                            </span>
                          ) : (
                            <span
                              className={getStrikeActivityClass(
                                incident
                                  .strikeActivityStatus
                              )}
                            >
                              {formatStrikeActivityStatus(
                                incident
                                  .strikeActivityStatus
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  }
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* =====================================================
          LOG INCIDENT MODAL
          ===================================================== */}

      {showLogModal && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeLogIncident
          }
        >
          <div
            className="modal modal-wide"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Log Incident
                </h3>

                <p>
                  Select a chatter
                  and rule.
                  Severity, weight,
                  the exact rule
                  version, and the{" "}
                  {currentStrikeLadder
                    ? `${currentStrikeLadder.durationDays}-day`
                    : "configured"}{" "}
                  strike expiry are
                  captured
                  automatically.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeLogIncident
                }
                aria-label="Close"
                disabled={
                  isSaving
                }
              >
                Ã—
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={
                handleLogIncident
              }
              noValidate
            >
              <div className="form-stack">
                <div className="form-grid">
                  <label className="form-field">
                    <span>
                      Chatter
                    </span>

                    <select
                      value={
                        chatterId
                      }
                      onChange={(
                        event
                      ) => {
                        setChatterId(
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
                      disabled={
                        isSaving
                      }
                    >
                      <option value="">
                        Select chatter
                      </option>

                      {activeChatters.map(
                        (
                          chatter
                        ) => (
                          <option
                            key={
                              chatter.id
                            }
                            value={
                              chatter.id
                            }
                          >
                            {
                              chatter.name
                            }
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>
                      Rule / Strike
                      Reason
                    </span>

                    <select
                      value={
                        ruleId
                      }
                      onChange={(
                        event
                      ) => {
                        setRuleId(
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
                      disabled={
                        isSaving
                      }
                    >
                      <option value="">
                        Select rule
                      </option>

                      {activeRules.map(
                        (rule) => (
                          <option
                            key={
                              rule.id
                            }
                            value={
                              rule.id
                            }
                          >
                            {rule
                              .currentVersion
                              ?.title ??
                              "Untitled Rule"}
                          </option>
                        )
                      )}
                    </select>
                  </label>
                </div>

                {selectedRule?.currentVersion && (
                  <div className="rule-preview">
                    <div className="rule-preview-header">
                      <div>
                        <span className="preview-label">
                          Selected
                          Rule
                        </span>

                        <strong>
                          {
                            selectedRule
                              .currentVersion
                              .title
                          }
                        </strong>
                      </div>

                      <span className="version-badge">
                        v
                        {
                          selectedRule
                            .currentVersion
                            .versionNumber
                        }
                      </span>
                    </div>

                    <p>
                      {
                        selectedRule
                          .currentVersion
                          .definition
                      }
                    </p>

                    <div className="rule-preview-meta">
                      <span>
                        Severity:{" "}

                        <strong>
                          {selectedRule
                            .currentVersion
                            .severityNameSnapshot ??
                            "None"}
                        </strong>
                      </span>

                      <span>
                        Weight:{" "}

                        <strong>
                          {selectedRule
                            .currentVersion
                            .weightNameSnapshot ??
                            "None"}
                        </strong>

                        {selectedRule
                          .currentVersion
                          .weightValueSnapshot !==
                          null &&
                          ` (${selectedRule.currentVersion.weightValueSnapshot})`}
                      </span>
                    </div>
                  </div>
                )}

                <label className="form-field">
                  <span>
                    Incident Details
                  </span>

                  <textarea
                    value={
                      details
                    }
                    onChange={(
                      event
                    ) => {
                      setDetails(
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
                    placeholder="Describe what happened..."
                    maxLength={
                      5000
                    }
                    rows={7}
                    disabled={
                      isSaving
                    }
                  />

                  <small className="form-helper">
                    {
                      details.length
                    }
                    /5000
                    characters
                  </small>
                </label>

                <label className="form-field">
                  <span>
                    Evidence URL{" "}

                    <em className="optional-label">
                      Optional
                    </em>
                  </span>

                  <input
                    type="url"
                    value={
                      evidenceUrl
                    }
                    onChange={(
                      event
                    ) => {
                      setEvidenceUrl(
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
                    placeholder="https://..."
                    maxLength={
                      2000
                    }
                    disabled={
                      isSaving
                    }
                  />
                </label>
              </div>

              {formError && (
                <div className="alert alert-error">
                  {formError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={
                    closeLogIncident
                  }
                  disabled={
                    isSaving
                  }
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={
                    isSaving
                  }
                >
                  {isSaving
                    ? "Logging..."
                    : "Log Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          INCIDENT DETAIL MODAL
          ===================================================== */}

      {(selectedIncident ||
        detailLoading) && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeIncidentDetails
          }
        >
          <div
            className={[
              "modal",
              "modal-history",
              "incident-detail-modal-card",
              selectedIncident
                ?.strikeActivityStatus ===
              "EXPIRED"
                ? "incident-detail-modal-card--expired"
                : "",
            ]
              .filter(Boolean)
              .join(" ")}
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            {selectedIncident
              ?.strikeActivityStatus ===
              "EXPIRED" && (
              <div
                className="incident-expired-watermark"
                aria-hidden="true"
              >
                EXPIRED
              </div>
            )}

            <div className="incident-detail-modal-content">
              <div className="modal-header">
                <div>
                  <h3>
                    {selectedIncident
                      ?.ruleTitleSnapshot ??
                      "Incident Details"}
                  </h3>

                  <p>
                    Incident record
                    for{" "}

                    <strong>
                      {selectedIncident
                        ?.chatter
                        .name}
                    </strong>
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={
                    closeIncidentDetails
                  }
                  disabled={
                    detailLoading
                  }
                  aria-label="Close"
                >
                  Ã—
                </button>
              </div>

              {detailLoading ? (
                <div className="empty-state">
                  <strong>
                    Loading incident...
                  </strong>
                </div>
              ) : (
                selectedIncident && (
                  <div className="incident-detail">
                    <div className="incident-detail-top">
                      <div>
                        <span className="detail-label">
                          Chatter
                        </span>

                        <strong>
                          {
                            selectedIncident
                              .chatter
                              .name
                          }
                        </strong>
                      </div>

                      <div
                        style={{
                          display:
                            "flex",
                          alignItems:
                            "center",
                          gap:
                            "8px",
                          flexWrap:
                            "wrap",
                          justifyContent:
                            "flex-end",
                        }}
                      >
                        <span
                          className={getStatusClass(
                            selectedIncident.status
                          )}
                          title="Incident workflow status"
                        >
                          {formatStatus(
                            selectedIncident.status
                          )}
                        </span>

                        {selectedIncident
                          .strikeActivityStatus !==
                          "NOT_APPLICABLE" && (
                          <span
                            className={getStrikeActivityClass(
                              selectedIncident
                                .strikeActivityStatus
                            )}
                            title="Current strike activity status"
                          >
                            {formatStrikeActivityStatus(
                              selectedIncident
                                .strikeActivityStatus
                            )}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="detail-section">
                      <span className="detail-label">
                        Rule Snapshot
                      </span>

                      <h4>
                        {
                          selectedIncident
                            .ruleTitleSnapshot
                        }
                      </h4>

                      <p>
                        {
                          selectedIncident
                            .ruleDefinitionSnapshot
                        }
                      </p>

                      <div className="detail-meta-grid">
                        <div>
                          <span>
                            Model
                          </span>

                          <strong>
                            {selectedIncident.agencyModel?.name ??
                              "Legacy / unassigned"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Rule Version
                          </span>

                          <strong>
                            v
                            {
                              selectedIncident
                                .ruleVersion
                                .versionNumber
                            }
                          </strong>
                        </div>

                        <div>
                          <span>
                            Severity
                          </span>

                          <strong>
                            {selectedIncident
                              .severityNameSnapshot ??
                              "None"}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Weight
                          </span>

                          <strong>
                            {selectedIncident
                              .weightNameSnapshot ??
                              "None"}

                            {selectedIncident
                              .weightValueSnapshot !==
                              null &&
                              ` (${selectedIncident.weightValueSnapshot})`}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Occurred
                          </span>

                          <strong>
                            {formatCentralDateTime(selectedIncident.occurredAt)}
                          </strong>
                        </div>

                        <div>
                          <span>
                            {formatExpiryLabel(
                              selectedIncident
                                .strikeActivityStatus
                            )}
                          </span>

                          <strong>
                            {selectedIncident
                              .strikeActivityStatus ===
                            "NOT_APPLICABLE"
                              ? "Not applicable"
                              : formatCentralDateTime(selectedIncident.expiresAt)}
                          </strong>
                        </div>

                        <div>
                          <span>
                            Strike Status
                          </span>

                          <strong>
                            {selectedIncident
                              .strikeActivityStatus ===
                            "NOT_APPLICABLE"
                              ? "â€”"
                              : formatStrikeActivityStatus(
                                  selectedIncident
                                    .strikeActivityStatus
                                )}
                          </strong>
                        </div>
                      </div>
                    </div>

                    <div className="detail-section">
                      <span className="detail-label">
                        Incident Details
                      </span>

                      <p className="detail-body">
                        {
                          selectedIncident.details
                        }
                      </p>
                    </div>

                    <div className="detail-section">
                      <span className="detail-label">
                        Evidence
                      </span>

                      {selectedIncident.evidenceUrl ? (
                        <a
                          className="incident-evidence-link"
                          href={
                            selectedIncident.evidenceUrl
                          }
                          target="_blank"
                          rel="noreferrer"
                          title={
                            selectedIncident.evidenceUrl
                          }
                        >
                          <span className="incident-evidence-url">
                            {
                              selectedIncident.evidenceUrl
                            }
                          </span>

                          <svg
                            className="incident-evidence-icon"
                            viewBox="0 0 20 20"
                            fill="none"
                            aria-hidden="true"
                          >
                            <path
                              d="M8 4H5.5A1.5 1.5 0 0 0 4 5.5v9A1.5 1.5 0 0 0 5.5 16h9a1.5 1.5 0 0 0 1.5-1.5V12"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                            />

                            <path
                              d="M11 4h5v5M16 4l-7 7"
                              stroke="currentColor"
                              strokeWidth="1.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        </a>
                      ) : (
                        <p className="detail-body">
                          No evidence URL
                          is included in
                          this log.
                        </p>
                      )}
                    </div>

                    {selectedIncident.status ===
                      "RESOLVED" && (
                      <div className="detail-section lifecycle-section resolved">
                        <span className="detail-label">
                          Resolution
                        </span>

                        <p>
                          {selectedIncident
                            .resolutionNotes ||
                            "No resolution notes provided."}
                        </p>

                        {selectedIncident.resolvedAt && (
                          <small>
                            Resolved{" "}

                            {formatCentralDateTime(selectedIncident.resolvedAt)}
                          </small>
                        )}
                      </div>
                    )}

                    {selectedIncident.status ===
                      "VOIDED" && (
                      <div className="detail-section lifecycle-section voided">
                        <span className="detail-label">
                          Void Reason
                        </span>

                        <p>
                          {selectedIncident
                            .voidReason ||
                            "No void reason recorded."}
                        </p>

                        {selectedIncident.voidedAt && (
                          <small>
                            Voided{" "}

                            {formatCentralDateTime(selectedIncident.voidedAt)}
                          </small>
                        )}
                      </div>
                    )}

                    <div className="incident-detail-actions">
                      {selectedIncident.status ===
                        "OPEN" && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => {
                            const incident =
                              selectedIncident;

                            setSelectedIncident(
                              null
                            );

                            openAction(
                              "resolve",
                              incident
                            );
                          }}
                        >
                          Resolve
                        </button>
                      )}

                      {selectedIncident.status !==
                        "VOIDED" && (
                        <button
                          type="button"
                          className="danger-button"
                          onClick={() => {
                            const incident =
                              selectedIncident;

                            setSelectedIncident(
                              null
                            );

                            openAction(
                              "void",
                              incident
                            );
                          }}
                        >
                          Void Incident
                        </button>
                      )}
                    </div>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}

      {/* =====================================================
          RESOLVE / VOID MODAL
          ===================================================== */}

      {actionType &&
        actionIncident && (
          <div
            className="modal-backdrop"
            onMouseDown={
              closeAction
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
                    {actionType ===
                    "resolve"
                      ? "Resolve Incident"
                      : "Void Incident"}
                  </h3>

                  <p>
                    {actionType ===
                    "resolve"
                      ? "Mark this incident as resolved and optionally record the outcome."
                      : "Void this incident while preserving it in the historical record."}
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={
                    closeAction
                  }
                  disabled={
                    actionSaving
                  }
                  aria-label="Close"
                >
                  Ã—
                </button>
              </div>

              <form
                className="modal-form"
                onSubmit={
                  handleAction
                }
                noValidate
              >
                <div className="action-context">
                  <span>
                    {
                      actionIncident
                        .chatter
                        .name
                    }
                  </span>

                  <strong>
                    {
                      actionIncident
                        .ruleTitleSnapshot
                    }
                  </strong>
                </div>

                <label className="form-field">
                  <span>
                    {actionType ===
                    "resolve"
                      ? "Resolution Notes"
                      : "Reason for Voiding"}
                  </span>

                  <textarea
                    value={
                      actionNotes
                    }
                    onChange={(
                      event
                    ) => {
                      setActionNotes(
                        event.target
                          .value
                      );

                      if (
                        actionError
                      ) {
                        setActionError(
                          ""
                        );
                      }
                    }}
                    placeholder={
                      actionType ===
                      "resolve"
                        ? "Describe the resolution or action taken..."
                        : "Explain why this incident should be voided..."
                    }
                    maxLength={
                      2000
                    }
                    rows={5}
                    autoFocus
                    disabled={
                      actionSaving
                    }
                  />

                  <small className="form-helper">
                    {actionType ===
                    "resolve"
                      ? `Optional Â· ${actionNotes.length}/2000 characters`
                      : `${actionNotes.length}/2000 characters`}
                  </small>
                </label>

                {actionError && (
                  <div className="alert alert-error">
                    {
                      actionError
                    }
                  </div>
                )}

                <div className="modal-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={
                      closeAction
                    }
                    disabled={
                      actionSaving
                    }
                  >
                    Cancel
                  </button>

                  <button
                    type="submit"
                    className={
                      actionType ===
                      "void"
                        ? "danger-button"
                        : "primary-button"
                    }
                    disabled={
                      actionSaving
                    }
                  >
                    {actionSaving
                      ? "Saving..."
                      : actionType ===
                          "resolve"
                        ? "Resolve Incident"
                        : "Void Incident"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

      {/* =====================================================
          FINAL CONFIRMATION MODAL
          ===================================================== */}

      {pendingConfirmation &&
        confirmationContent && (
          <div
            className="modal-backdrop confirmation-backdrop"
            onMouseDown={
              cancelConfirmation
            }
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
              aria-labelledby="incident-confirmation-title"
            >
              <div className="modal-header">
                <div>
                  <h3 id="incident-confirmation-title">
                    {
                      confirmationContent.title
                    }
                  </h3>

                  <p>
                    Please confirm
                    before continuing.
                  </p>
                </div>

                <button
                  type="button"
                  className="modal-close"
                  onClick={
                    cancelConfirmation
                  }
                  disabled={
                    confirmationBusy
                  }
                  aria-label="Close confirmation"
                >
                  Ã—
                </button>
              </div>

              <div className="confirmation-body">
                <p>
                  {
                    confirmationContent.message
                  }
                </p>

                {pendingConfirmation.type ===
                  "log" && (
                  <div className="confirmation-summary">
                    <div>
                      <span>
                        Chatter
                      </span>

                      <strong>
                        {selectedChatter
                          ?.name ??
                          "â€”"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Rule
                      </span>

                      <strong>
                        {selectedRule
                          ?.currentVersion
                          ?.title ??
                          "â€”"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Severity
                      </span>

                      <strong>
                        {selectedRule
                          ?.currentVersion
                          ?.severityNameSnapshot ??
                          "None"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Weight
                      </span>

                      <strong>
                        {selectedRule
                          ?.currentVersion
                          ?.weightNameSnapshot ??
                          "None"}

                        {selectedRule
                          ?.currentVersion
                          ?.weightValueSnapshot !==
                          null &&
                        selectedRule
                          ?.currentVersion
                          ?.weightValueSnapshot !==
                          undefined
                          ? ` (${selectedRule.currentVersion.weightValueSnapshot})`
                          : ""}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Strike Duration
                      </span>

                      <strong>
                        {currentStrikeLadder
                          ? `${currentStrikeLadder.durationDays} ${
                              currentStrikeLadder.durationDays ===
                              1
                                ? "day"
                                : "days"
                            }`
                          : "â€”"}
                      </strong>
                    </div>

                    <div>
                      <span>
                        Evidence URL
                      </span>

                      <strong
                        title={
                          pendingConfirmation
                            .payload
                            .evidenceUrl ??
                          undefined
                        }
                      >
                        {pendingConfirmation
                          .payload
                          .evidenceUrl ??
                          "No evidence URL is included in this log."}
                      </strong>
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    cancelConfirmation
                  }
                  disabled={
                    confirmationBusy
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
                  onClick={() =>
                    void confirmPendingAction()
                  }
                  disabled={
                    confirmationBusy
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

export default IncidentsPage;
