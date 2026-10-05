import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
  KeyboardEvent,
} from "react";

import {
  useNavigate,
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

type StrikeSummary = {
  activeStrikeCount: number;
  standingLabel: string;
  deductionPercent: number;
  nextExpiryAt:
    | string
    | null;
  ladderVersionId: string;
  ladderVersion: number;
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

  ruleVersion: {
    id: string;
    ruleId: string;
    versionNumber: number;
  };
};

type ChatterListResponse = {
  data: Chatter[];
};

type ChatterDetailResponse = {
  data: Chatter & {
    strikeSummary:
      StrikeSummary;
  };
};

type IncidentListResponse = {
  data: ChatterIncident[];
};

type ChatterMutationResponse = {
  message: string;
  data: Chatter;
};

type StatusFilter =
  | "ALL"
  | ChatterStatus;

type IncidentFilter =
  | "ALL"
  | IncidentStatus;


type ChatterPayload = {
  name: string;
};

type PendingConfirmation =
  | {
      type: "save";
      mode:
        | "create"
        | "edit";
      payload: ChatterPayload;
    }
  | {
      type: "status";
      action:
        | "deactivate"
        | "reactivate";
      chatter: Chatter;
    };

const TEXAS_TIME_ZONE =
  "America/Chicago";

const CHATTER_HISTORY_PAGE_SIZE = 5;
const CHATTER_LIST_PAGE_SIZE = 7;

function formatTexasDate(
  value: string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        TEXAS_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
    }
  ).format(new Date(value));
}

function formatTexasDateTime(
  value: string
) {
  return new Intl.DateTimeFormat(
    "en-US",
    {
      timeZone:
        TEXAS_TIME_ZONE,
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZoneName: "short",
    }
  ).format(new Date(value));
}

function formatPercentage(
  value: number
) {
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(
        /0+$/,
        ""
      ).replace(
        /\.$/,
        ""
      );
}

function ChattersPage() {
  const toast = useToast();
  const navigate =
    useNavigate();
  const [
    searchParams,
    setSearchParams,
  ] = useSearchParams();
  const requestedChatterId =
    searchParams.get(
      "chatterId"
    );

  const {
    access,
  } = useAuth();

  const canConfigureQa =
    getPortalCapabilities(
      access
    ).canConfigureQa;

  const [
    chatters,
    setChatters,
  ] = useState<Chatter[]>([]);

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>("ALL");

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] = useState("");

  const [
    chatterPage,
    setChatterPage,
  ] = useState(1);

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    pageError,
    setPageError,
  ] = useState("");

  /*
   * Add / Edit
   */

  const [
    showForm,
    setShowForm,
  ] = useState(false);

  const [
    editingChatter,
    setEditingChatter,
  ] =
    useState<Chatter | null>(null);

  const [
    name,
    setName,
  ] = useState("");

  const [
    formError,
    setFormError,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  /*
   * Chatter profile
   */

  const [
    selectedChatter,
    setSelectedChatter,
  ] =
    useState<Chatter | null>(null);

  const [
    chatterStrikeSummary,
    setChatterStrikeSummary,
  ] =
    useState<StrikeSummary | null>(
      null
    );

  const [
    chatterIncidents,
    setChatterIncidents,
  ] = useState<
    ChatterIncident[]
  >([]);

  const [
    detailsLoading,
    setDetailsLoading,
  ] = useState(false);

  const [
    detailsError,
    setDetailsError,
  ] = useState("");

  const [
    modelContextRevision,
    setModelContextRevision,
  ] = useState(0);

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
    useState<string | null>(
      null
    );

  const [
    historyPage,
    setHistoryPage,
  ] = useState(1);

  /*
   * Actions / confirmation
   */

  const [
    actionId,
    setActionId,
  ] =
    useState<string | null>(
      null
    );

  const [
    pendingConfirmation,
    setPendingConfirmation,
  ] =
    useState<PendingConfirmation | null>(
      null
    );

  /*
   * Search debounce
   */

  useEffect(() => {
    const timer =
      window.setTimeout(() => {
        setDebouncedSearch(
          search.trim()
        );
      }, 250);

    return () => {
      window.clearTimeout(timer);
    };
  }, [search]);

  /*
   * Load chatter list
   */

  const loadChatters =
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

        if (debouncedSearch) {
          params.set(
            "search",
            debouncedSearch
          );
        }

        const query =
          params.toString();

        const endpoint = query
          ? `/api/chatters?${query}`
          : "/api/chatters";

        const response =
          await apiRequest<ChatterListResponse>(
            endpoint
          );

        setChatters(
          response.data
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load chatters";

        setPageError(message);

        toast.error(
          message,
          "Unable to load chatters"
        );
      } finally {
        setIsLoading(false);
      }
    }, [
      statusFilter,
      debouncedSearch,
      toast,
    ]);

  useEffect(() => {
    void loadChatters();
  }, [
    loadChatters,
    modelContextRevision,
  ]);

  useEffect(() => {
    const handleModelContextChange =
      () => {
        setSelectedChatter(null);
        setChatterStrikeSummary(null);
        setChatterIncidents([]);
        setDetailsError("");
        setIncidentFilter("ALL");
                setExpandedIncidentId(null);
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
   * Chatter profile
   */

  function resetChatterProfile() {
    setSelectedChatter(
      null
    );

    setChatterStrikeSummary(
      null
    );

    setChatterIncidents([]);

    setDetailsError("");

    setIncidentFilter(
      "ALL"
    );

    setExpandedIncidentId(
      null
    );

    setHistoryPage(1);
  }

  async function openChatterDetails(
    chatter: Chatter
  ) {
    setSelectedChatter(
      chatter
    );

    setChatterStrikeSummary(
      null
    );

    setChatterIncidents([]);

    setIncidentFilter(
      "ALL"
    );

    setExpandedIncidentId(
      null
    );

    setHistoryPage(1);

    setDetailsError("");

    try {
      setDetailsLoading(true);

      const [
        chatterResponse,
        incidentResponse,
      ] = await Promise.all([
        apiRequest<ChatterDetailResponse>(
          `/api/chatters/${chatter.id}`
        ),

        apiRequest<IncidentListResponse>(
          `/api/incidents?chatterId=${encodeURIComponent(
            chatter.id
          )}`
        ),
      ]);

      setSelectedChatter(
        chatterResponse.data
      );

      setChatterStrikeSummary(
        chatterResponse.data
          .strikeSummary
      );

      setChatterIncidents(
        incidentResponse.data
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load chatter details";

      setDetailsError(
        message
      );

      toast.error(
        message,
        "Unable to load chatter profile"
      );
    } finally {
      setDetailsLoading(false);
    }
  }

  useEffect(() => {
    if (
      !requestedChatterId ||
      isLoading ||
      selectedChatter?.id ===
        requestedChatterId
    ) {
      return;
    }

    const requestedChatter =
      chatters.find(
        (chatter) =>
          chatter.id ===
          requestedChatterId
      );

    if (
      requestedChatter
    ) {
      void openChatterDetails(
        requestedChatter
      );
    }
    // The detail loader is intentionally driven by the URL + loaded list.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    requestedChatterId,
    isLoading,
    chatters,
    selectedChatter?.id,
  ]);

  function closeChatterDetails() {
    if (
      actionId !== null ||
      showForm
    ) {
      return;
    }

    resetChatterProfile();

    if (requestedChatterId) {
      const nextParams =
        new URLSearchParams(
          searchParams
        );
      nextParams.delete(
        "chatterId"
      );
      setSearchParams(
        nextParams,
        {
          replace: true,
        }
      );
    }
  }

  function handleRowKeyDown(
    event:
      KeyboardEvent<HTMLTableRowElement>,
    chatter: Chatter
  ) {
    if (
      event.key === "Enter" ||
      event.key === " "
    ) {
      event.preventDefault();

      void openChatterDetails(
        chatter
      );
    }
  }

  /*
   * Incident statistics
   */

  const incidentStats =
    useMemo(() => {
      const stats = {
        total:
          chatterIncidents.length,

        open: 0,
        resolved: 0,
        voided: 0,
      };

      for (
        const incident of
        chatterIncidents
      ) {
        if (
          incident.status ===
          "OPEN"
        ) {
          stats.open += 1;
        }

        if (
          incident.status ===
          "RESOLVED"
        ) {
          stats.resolved += 1;
        }

        if (
          incident.status ===
          "VOIDED"
        ) {
          stats.voided += 1;
        }

      }

      return stats;
    }, [chatterIncidents]);

  const filteredIncidents =
    useMemo(() => {
      return chatterIncidents.filter(
        (incident) =>
          incidentFilter === "ALL" ||
          incident.status ===
            incidentFilter
      );
    }, [
      chatterIncidents,
      incidentFilter,
    ]);

  const historyPageCount =
    Math.max(
      1,
      Math.ceil(
        filteredIncidents.length /
        CHATTER_HISTORY_PAGE_SIZE
      )
    );

  const visibleIncidents =
    useMemo(() => {
      const start =
        (historyPage - 1) *
        CHATTER_HISTORY_PAGE_SIZE;

      return filteredIncidents.slice(
        start,
        start +
          CHATTER_HISTORY_PAGE_SIZE
      );
    }, [
      filteredIncidents,
      historyPage,
    ]);

  useEffect(() => {
    setHistoryPage(1);
    setExpandedIncidentId(
      null
    );
  }, [
    incidentFilter,
    selectedChatter?.id,
  ]);

  useEffect(() => {
    if (
      historyPage >
      historyPageCount
    ) {
      setHistoryPage(
        historyPageCount
      );
    }
  }, [
    historyPage,
    historyPageCount,
  ]);

  function selectIncidentFilter(
    filter: IncidentFilter
  ) {
    setIncidentFilter(filter);
  }

  /*
   * Form
   */

  function resetForm() {
    setEditingChatter(null);

    setName("");

    setFormError("");
  }

  function openAddForm() {
    resetForm();

    setPageError("");

    setShowForm(true);
  }

  function openEditForm(
    chatter: Chatter
  ) {
    setEditingChatter(
      chatter
    );

    setName(
      chatter.name
    );

    setFormError("");

    setPageError("");

    setShowForm(true);
  }

  /*
   * IMPORTANT:
   * We no longer close the profile.
   *
   * The edit dialog opens ABOVE the chatter
   * profile. Cancel returns to the profile.
   */
  function editSelectedChatter() {
    if (!selectedChatter) {
      return;
    }

    openEditForm(
      selectedChatter
    );
  }

  function closeForm() {
    if (isSaving) {
      return;
    }

    setShowForm(false);

    setPendingConfirmation(
      null
    );

    resetForm();

    /*
     * If a profile is already open,
     * it remains open underneath.
     */
  }

  function showFormError(
    message: string
  ) {
    setFormError(message);

    toast.error(
      message,
      "Check chatter details"
    );
  }

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedName =
      name.trim();

    if (!trimmedName) {
      showFormError(
        "Chatter name is required."
      );

      return;
    }

    if (
      editingChatter &&
      editingChatter.name.trim() ===
        trimmedName
    ) {
      setFormError("");

      toast.info(
        "No chatter changes were detected.",
        "No changes"
      );

      return;
    }

    setFormError("");

    setPendingConfirmation({
      type: "save",

      mode:
        editingChatter
          ? "edit"
          : "create",

      payload: {
        name: trimmedName,
      },
    });
  }

  async function saveChatter(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "save";
      }
    >
  ) {
    try {
      setIsSaving(true);

      setFormError("");
      setPageError("");

      let response:
        ChatterMutationResponse;

      if (
        confirmation.mode ===
          "edit" &&
        editingChatter
      ) {
        response =
          await apiRequest<ChatterMutationResponse>(
            `/api/chatters/${editingChatter.id}`,
            {
              method: "PATCH",

              body:
                JSON.stringify(
                  confirmation.payload
                ),
            }
          );
      } else {
        response =
          await apiRequest<ChatterMutationResponse>(
            "/api/chatters",
            {
              method: "POST",

              body:
                JSON.stringify(
                  confirmation.payload
                ),
            }
          );
      }

      setPendingConfirmation(
        null
      );

      /*
       * Update the chatter profile if we
       * edited the chatter from inside it.
       */
      if (
        confirmation.mode ===
          "edit"
      ) {
        setSelectedChatter(
          (current) =>
            current?.id ===
            response.data.id
              ? response.data
              : current
        );
      }

      if (
        response.message ===
        "No chatter changes were detected"
      ) {
        toast.info(
          response.message,
          "No changes"
        );

        setShowForm(false);

        resetForm();

        return;
      }

      toast.success(
        response.message,

        confirmation.mode ===
        "edit"
          ? "Chatter updated"
          : "Chatter added"
      );

      setShowForm(false);

      resetForm();

      await loadChatters();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save chatter";

      setPendingConfirmation(
        null
      );

      setFormError(message);

      toast.error(
        message,
        "Chatter not saved"
      );
    } finally {
      setIsSaving(false);
    }
  }

  /*
   * Deactivate / reactivate
   */

  function requestStatusChange(
    chatter: Chatter,
    action:
      | "deactivate"
      | "reactivate"
  ) {
    setPendingConfirmation({
      type: "status",
      action,
      chatter,
    });
  }

  async function changeStatus(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "status";
      }
    >
  ) {
    const {
      chatter,
      action,
    } = confirmation;

    try {
      setActionId(
        chatter.id
      );

      setPageError("");

      const response =
        await apiRequest<ChatterMutationResponse>(
          `/api/chatters/${chatter.id}/${action}`,
          {
            method: "PATCH",
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

      /*
       * IMPORTANT:
       *
       * After a status mutation initiated
       * from the chatter profile, return
       * directly to the table.
       */
      resetChatterProfile();

      await loadChatters();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update chatter status";

      setPendingConfirmation(
        null
      );

      setPageError(message);

      toast.error(
        message,
        "Chatter not updated"
      );
    } finally {
      setActionId(null);
    }
  }

  /*
   * Confirmation
   */

  async function confirmPendingAction() {
    if (
      !pendingConfirmation
    ) {
      return;
    }

    if (
      pendingConfirmation.type ===
      "save"
    ) {
      await saveChatter(
        pendingConfirmation
      );

      return;
    }

    await changeStatus(
      pendingConfirmation
    );
  }

  function cancelConfirmation() {
    if (
      isSaving ||
      actionId !== null
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
        "save"
      ) {
        if (
          pendingConfirmation.mode ===
          "create"
        ) {
          return {
            title:
              "Add Chatter?",

            message:
              `Add "${pendingConfirmation.payload.name}" as a new chatter?`,

            confirmLabel:
              "Add Chatter",

            danger: false,
          };
        }

        return {
          title:
            "Save Chatter Changes?",

          message:
            `Update this chatter's name to "${pendingConfirmation.payload.name}"?`,

          confirmLabel:
            "Save Changes",

          danger: false,
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
            `Deactivate "${pendingConfirmation.chatter.name}"? They will no longer be available when logging new incidents, but all existing incident history will remain preserved.`,

          confirmLabel:
            "Deactivate",

          danger: true,
        };
      }

      return {
        title:
          "Reactivate Chatter?",

        message:
          `Reactivate "${pendingConfirmation.chatter.name}"? They will become available for new incident logging again.`,

        confirmLabel:
          "Reactivate",

        danger: false,
      };
    }, [pendingConfirmation]);

  const confirmationBusy =
    pendingConfirmation?.type ===
    "save"
      ? isSaving
      : pendingConfirmation?.type ===
          "status"
        ? actionId ===
          pendingConfirmation
            .chatter.id
        : false;

  /*
   * Display helpers
   */

  function formatIncidentStatus(
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

  function getIncidentStatusClass(
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

  function toggleIncident(
    incidentId: string
  ) {
    setExpandedIncidentId(
      (current) =>
        current === incidentId
          ? null
          : incidentId
    );
  }

  const chatterPageCount = Math.max(
    1,
    Math.ceil(
      chatters.length /
        CHATTER_LIST_PAGE_SIZE
    )
  );

  const safeChatterPage = Math.min(
    chatterPage,
    chatterPageCount
  );

  const paginatedChatters = chatters.slice(
    (safeChatterPage - 1) *
      CHATTER_LIST_PAGE_SIZE,
    safeChatterPage *
      CHATTER_LIST_PAGE_SIZE
  );

  const chatterRangeStart =
    chatters.length === 0
      ? 0
      : (safeChatterPage - 1) *
          CHATTER_LIST_PAGE_SIZE +
        1;

  const chatterRangeEnd = Math.min(
    safeChatterPage *
      CHATTER_LIST_PAGE_SIZE,
    chatters.length
  );

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Team Management
          </p>

          <h2>
            Chatters
          </h2>

          <p className="page-description">
            Manage chatter records
            and review their QA and
            incident history.
          </p>
        </div>

        {canConfigureQa && (
          <button
            className="primary-button"
            type="button"
            onClick={
              openAddForm
            }
          >
            Add Chatter
          </button>
        )}
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      <section className="content-card">
        <div className="card-header chatter-table-header">
          <div>
            <h3>
              Chatter Records
            </h3>

            <p>
              Select a chatter to
              view their profile
              and complete incident
              history.
            </p>
          </div>

          <div className="toolbar-controls">
            <input
              className="search-input"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(
                  event.target.value
                )
              }
              placeholder="Search chatters..."
              aria-label="Search chatters"
              maxLength={150}
            />

            <div className="filter-group">
              <button
                type="button"
                className={
                  statusFilter ===
                  "ALL"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() =>
                  setStatusFilter(
                    "ALL"
                  )
                }
              >
                All
              </button>

              <button
                type="button"
                className={
                  statusFilter ===
                  "ACTIVE"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() =>
                  setStatusFilter(
                    "ACTIVE"
                  )
                }
              >
                Active
              </button>

              <button
                type="button"
                className={
                  statusFilter ===
                  "INACTIVE"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() =>
                  setStatusFilter(
                    "INACTIVE"
                  )
                }
              >
                Inactive
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>
              Loading chatters...
            </strong>
          </div>
        ) : chatters.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              {search.trim()
                ? "No chatters match your search"
                : "No chatters found"}
            </strong>

            <span>
              {search.trim()
                ? "Try another search or adjust the status filter."
                : "Add a chatter or choose a different status filter."}
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table chatter-table">
              <thead>
                <tr>
                  <th>
                    Name
                  </th>

                  <th>
                    Status
                  </th>

                  <th>
                    Added
                  </th>
                </tr>
              </thead>

              <tbody>
                {paginatedChatters.map(
                  (chatter) => (
                    <tr
                      key={
                        chatter.id
                      }
                      className="chatter-clickable-row"
                      tabIndex={0}
                      aria-label={`Open ${chatter.name} profile`}
                      onClick={() =>
                        void openChatterDetails(
                          chatter
                        )
                      }
                      onKeyDown={(
                        event
                      ) =>
                        handleRowKeyDown(
                          event,
                          chatter
                        )
                      }
                    >
                      <td>
                        <div className="chatter-name-cell">
                          <div className="chatter-name-content">
                            <strong>
                              {
                                chatter.name
                              }
                            </strong>

                            <span>
                              View profile
                              and incident
                              history
                            </span>
                          </div>
                        </div>
                      </td>

                      <td>
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
                      </td>

                      <td>
                        {formatTexasDate(
                          chatter.createdAt
                        )}
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {!isLoading &&
          chatters.length > 0 &&
          chatterPageCount > 1 && (
          <div
            className="compact-table-pagination"
            aria-label="Chatter table pagination"
          >
            <span>
              {chatterRangeStart}–{chatterRangeEnd} of {chatters.length}
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                disabled={safeChatterPage <= 1}
                onClick={() =>
                  setChatterPage(
                    Math.max(1, safeChatterPage - 1)
                  )
                }
              >
                Previous
              </button>

              <strong>
                Page {safeChatterPage} of {chatterPageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                disabled={safeChatterPage >= chatterPageCount}
                onClick={() =>
                  setChatterPage(
                    Math.min(chatterPageCount, safeChatterPage + 1)
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {/* CHATTER PROFILE */}

      {selectedChatter && (
        <div
          className="modal-backdrop chatter-profile-backdrop"
          onMouseDown={
            closeChatterDetails
          }
        >
          <div
            className="modal chatter-profile-modal"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="chatter-profile-header">
              <div className="chatter-profile-identity">
                <div>
                  <div className="chatter-profile-title-row">
                    <h3>
                      {
                        selectedChatter.name
                      }
                    </h3>

                    <span
                      className={
                        selectedChatter.status ===
                        "ACTIVE"
                          ? "status-badge active"
                          : "status-badge inactive"
                      }
                    >
                      {selectedChatter.status ===
                      "ACTIVE"
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </div>

                  <p>
                    Chatter profile
                    and QA incident
                    history
                  </p>

                  <span className="chatter-profile-member-since">
                    Added{" "}
                    {formatTexasDate(
                      selectedChatter.createdAt
                    )}
                  </span>
                </div>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeChatterDetails
                }
                disabled={
                  actionId !== null ||
                  showForm
                }
                aria-label="Close chatter profile"
              >
                ×
              </button>
            </div>

            <div className="chatter-profile-content">
              {canConfigureQa && (
                <div className="chatter-profile-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={
                    editSelectedChatter
                  }
                  disabled={
                    actionId !== null
                  }
                >
                  Edit Chatter
                </button>

                {selectedChatter.status ===
                "ACTIVE" ? (
                  <button
                    type="button"
                    className="danger-button"
                    onClick={() =>
                      requestStatusChange(
                        selectedChatter,
                        "deactivate"
                      )
                    }
                    disabled={
                      actionId ===
                      selectedChatter.id
                    }
                  >
                    {actionId ===
                    selectedChatter.id
                      ? "Updating..."
                      : "Deactivate"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="secondary-button chatter-reactivate-button"
                    onClick={() =>
                      requestStatusChange(
                        selectedChatter,
                        "reactivate"
                      )
                    }
                    disabled={
                      actionId ===
                      selectedChatter.id
                    }
                  >
                    {actionId ===
                    selectedChatter.id
                      ? "Updating..."
                      : "Reactivate"}
                  </button>
                )}
                </div>
              )}

              {!canConfigureQa && (
                <div className="alert alert-info">
                  Read-only QA view. Chatter record changes require management access.
                </div>
              )}

              {detailsError && (
                <div className="alert alert-error">
                  {detailsError}
                </div>
              )}

              <section className="chatter-profile-section chatter-standing-section">
                <div className="chatter-profile-section-heading">
                  <div>
                    <span>
                      Strike Standing
                    </span>

                    <h4>
                      Current Standing
                    </h4>
                  </div>

                  {!detailsLoading &&
                    chatterStrikeSummary && (
                      <span className="chatter-ladder-version-badge">
                        Ladder v
                        {
                          chatterStrikeSummary.ladderVersion
                        }
                      </span>
                    )}
                </div>

                {detailsLoading ? (
                  <div className="chatter-profile-loading">
                    Loading current
                    strike standing...
                  </div>
                ) : chatterStrikeSummary ? (
                  <div className="chatter-standing-panel">
                    <div className="chatter-standing-primary">
                      <span>
                        Current Standing
                      </span>

                      <strong>
                        {
                          chatterStrikeSummary.standingLabel
                        }
                      </strong>

                      <p>
                        Based on{" "}
                        {
                          chatterStrikeSummary.activeStrikeCount
                        }{" "}
                        active{" "}
                        {chatterStrikeSummary.activeStrikeCount ===
                        1
                          ? "strike"
                          : "strikes"}{" "}
                        under the current
                        ladder.
                      </p>
                    </div>

                    <div className="chatter-standing-metrics">
                      <div className="chatter-standing-metric">
                        <span>
                          Active Strikes
                        </span>

                        <strong>
                          {
                            chatterStrikeSummary.activeStrikeCount
                          }
                        </strong>
                      </div>

                      <div className="chatter-standing-metric">
                        <span>
                          Commission
                          Deduction
                        </span>

                        <strong>
                          {formatPercentage(
                            chatterStrikeSummary.deductionPercent
                          )}
                          %
                        </strong>
                      </div>

                      <div className="chatter-standing-metric chatter-standing-next-expiry">
                        <span>
                          Next Expiry
                        </span>

                        <strong>
                          {chatterStrikeSummary.nextExpiryAt
                            ? formatTexasDateTime(
                                chatterStrikeSummary.nextExpiryAt
                              )
                            : "—"}
                        </strong>

                        <small>
                          {chatterStrikeSummary.nextExpiryAt
                            ? "Earliest active strike expiry"
                            : "No active strike expiry"}
                        </small>
                      </div>

                    </div>
                  </div>
                ) : (
                  <div className="chatter-profile-empty chatter-standing-empty">
                    <strong>
                      Standing unavailable
                    </strong>

                    <span>
                      The current strike
                      standing could not be
                      loaded.
                    </span>
                  </div>
                )}
              </section>

              <section className="chatter-profile-section">
                <div className="chatter-profile-section-heading">
                  <div>
                    <span>
                      QA Overview
                    </span>

                    <h4>
                      Incident Summary
                    </h4>
                  </div>
                </div>

                {detailsLoading ? (
                  <div className="chatter-profile-loading">
                    Loading incident
                    summary...
                  </div>
                ) : (
                  <div className="chatter-stat-grid">
                    <div className="chatter-stat-card">
                      <span>
                        Total
                        Incidents
                      </span>

                      <strong>
                        {
                          incidentStats.total
                        }
                      </strong>
                    </div>

                    <div className="chatter-stat-card open">
                      <span>
                        Open
                      </span>

                      <strong>
                        {
                          incidentStats.open
                        }
                      </strong>
                    </div>

                    <div className="chatter-stat-card resolved">
                      <span>
                        Resolved
                      </span>

                      <strong>
                        {
                          incidentStats.resolved
                        }
                      </strong>
                    </div>

                    <div className="chatter-stat-card voided">
                      <span>
                        Voided
                      </span>

                      <strong>
                        {
                          incidentStats.voided
                        }
                      </strong>
                    </div>

                  </div>
                )}
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
                      <button
                        type="button"
                        className={
                          incidentFilter ===
                          "ALL"
                            ? "filter-button active"
                            : "filter-button"
                        }
                        onClick={() =>
                          selectIncidentFilter(
                            "ALL"
                          )
                        }
                      >
                        All
                      </button>

                      <button
                        type="button"
                        className={
                          incidentFilter ===
                          "OPEN"
                            ? "filter-button active"
                            : "filter-button"
                        }
                        onClick={() =>
                          selectIncidentFilter(
                            "OPEN"
                          )
                        }
                      >
                        Open
                      </button>

                      <button
                        type="button"
                        className={
                          incidentFilter ===
                          "RESOLVED"
                            ? "filter-button active"
                            : "filter-button"
                        }
                        onClick={() =>
                          selectIncidentFilter(
                            "RESOLVED"
                          )
                        }
                      >
                        Resolved
                      </button>

                      <button
                        type="button"
                        className={
                          incidentFilter ===
                          "VOIDED"
                            ? "filter-button active"
                            : "filter-button"
                        }
                        onClick={() =>
                          selectIncidentFilter(
                            "VOIDED"
                          )
                        }
                      >
                        Voided
                      </button>
                    </div>
                  </div>
                </div>

                {detailsLoading ? (
                  <div className="chatter-profile-loading chatter-history-loading">
                    Loading incident
                    history...
                  </div>
                ) : visibleIncidents.length ===
                  0 ? (
                  <div className="chatter-profile-empty">
                    <strong>
                      {chatterIncidents.length ===
                      0
                        ? "No incidents recorded"
                        : "No incidents match these filters"}
                    </strong>

                    <span>
                      {chatterIncidents.length ===
                      0
                        ? "This chatter currently has no incident history."
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
                              onClick={() => {
                                toggleIncident(
                                  incident.id
                                );
                                navigate(
                                  `/incidents?incidentId=${encodeURIComponent(
                                    incident.id
                                  )}`
                                );
                              }}
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
                                      incident
                                        .ruleVersion
                                        .versionNumber
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
                                  xmlns="http://www.w3.org/2000/svg"
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

                            {isExpanded && (
                              <div className="chatter-incident-details">
                                <div className="chatter-incident-detail-block">
                                  <span>
                                    Rule
                                    Definition
                                  </span>

                                  <p>
                                    {
                                      incident.ruleDefinitionSnapshot
                                    }
                                  </p>
                                </div>

                                <div className="chatter-incident-detail-block">
                                  <span>
                                    Incident
                                    Details
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
                                      Open
                                      supporting
                                      evidence
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
                                      Void
                                      Reason
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
                              </div>
                            )}
                          </article>
                        );
                      }
                    )}
                  </div>
                )}

                {!detailsLoading &&
                  filteredIncidents.length > 0 &&
                  historyPageCount > 1 && (
                  <div className="qa-history-pagination" aria-label="Chatter QA history pagination">
                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPage(
                          (current) =>
                            Math.max(
                              1,
                              current - 1
                            )
                        )
                      }
                      disabled={
                        historyPage <= 1
                      }
                    >
                      Previous
                    </button>

                    <span>
                      Page {historyPage} of {historyPageCount}
                    </span>

                    <button
                      type="button"
                      className="secondary-button"
                      onClick={() =>
                        setHistoryPage(
                          (current) =>
                            Math.min(
                              historyPageCount,
                              current + 1
                            )
                        )
                      }
                      disabled={
                        historyPage >=
                        historyPageCount
                      }
                    >
                      Next
                    </button>
                  </div>
                )}
              </section>
            </div>
          </div>
        </div>
      )}

      {/* ADD / EDIT */}

      {showForm && canConfigureQa && (
        <div
          className={
            selectedChatter &&
            editingChatter
              ? "modal-backdrop chatter-edit-backdrop"
              : "modal-backdrop"
          }
          onMouseDown={
            closeForm
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
                  {editingChatter
                    ? "Edit Chatter"
                    : "Add Chatter"}
                </h3>

                <p>
                  {editingChatter
                    ? "Update the chatter's display name."
                    : "Create a chatter record for incident tracking."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeForm
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
                handleSubmit
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
                  placeholder="Enter chatter name"
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
                    closeForm
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
                    : editingChatter
                      ? "Save Changes"
                      : "Add Chatter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* CONFIRMATION */}

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
              aria-labelledby="chatter-confirmation-title"
            >
              <div className="modal-header">
                <div>
                  <h3 id="chatter-confirmation-title">
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
                  ×
                </button>
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

export default ChattersPage;
