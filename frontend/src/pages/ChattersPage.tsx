import {
  useCallback,
  useEffect,
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

type Chatter = {
  id: string;
  name: string;
  status: ChatterStatus;
  createdAt: string;
  updatedAt: string;
};

type ChatterListResponse = {
  data: Chatter[];
};

type ChatterMutationResponse = {
  message: string;
  data: Chatter;
};

type StatusFilter =
  | "ALL"
  | ChatterStatus;

const TEXAS_TIME_ZONE =
  "America/Chicago";

const CHATTER_LIST_PAGE_SIZE =
  7;

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
  ).format(
    new Date(value)
  );
}

function readStatusFilter(
  value:
    string |
    null
): StatusFilter {
  if (
    value === "ACTIVE" ||
    value === "INACTIVE"
  ) {
    return value;
  }

  return "ALL";
}

function readPage(
  value:
    string |
    null
) {
  const parsed =
    Number.parseInt(
      value ?? "1",
      10
    );

  return Number.isInteger(
    parsed
  ) &&
    parsed > 0
    ? parsed
    : 1;
}

function ChattersPage() {
  const toast =
    useToast();

  const navigate =
    useNavigate();

  const [
    searchParams,
    setSearchParams,
  ] =
    useSearchParams();

  const {
    access,
  } =
    useAuth();

  const canManageQaProfiles =
    getPortalCapabilities(
      access
    ).canManageQaProfiles;

  const [
    chatters,
    setChatters,
  ] =
    useState<Chatter[]>([]);

  const [
    statusFilter,
    setStatusFilter,
  ] =
    useState<StatusFilter>(
      () =>
        readStatusFilter(
          searchParams.get(
            "status"
          )
        )
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      () =>
        searchParams.get(
          "search"
        ) ?? ""
    );

  const [
    debouncedSearch,
    setDebouncedSearch,
  ] =
    useState(
      () =>
        searchParams.get(
          "search"
        ) ?? ""
    );

  const [
    chatterPage,
    setChatterPage,
  ] =
    useState(
      () =>
        readPage(
          searchParams.get(
            "page"
          )
        )
    );

  const [
    isLoading,
    setIsLoading,
  ] =
    useState(true);

  const [
    pageError,
    setPageError,
  ] =
    useState("");

  const [
    modelContextRevision,
    setModelContextRevision,
  ] =
    useState(0);

  const [
    showForm,
    setShowForm,
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
    pendingAdd,
    setPendingAdd,
  ] =
    useState<
      string |
      null
    >(null);

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            setDebouncedSearch(
              search.trim()
            );
          },
          250
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      search,
    ]
  );

  useEffect(
    () => {
      const next =
        new URLSearchParams();

      if (
        statusFilter !==
          "ALL"
      ) {
        next.set(
          "status",
          statusFilter
        );
      }

      if (
        debouncedSearch
      ) {
        next.set(
          "search",
          debouncedSearch
        );
      }

      if (
        chatterPage > 1
      ) {
        next.set(
          "page",
          String(
            chatterPage
          )
        );
      }

      if (
        next.toString() !==
        searchParams.toString()
      ) {
        setSearchParams(
          next,
          {
            replace: true,
          }
        );
      }
    },
    [
      statusFilter,
      debouncedSearch,
      chatterPage,
      searchParams,
      setSearchParams,
    ]
  );

  const loadChatters =
    useCallback(
      async () => {
        try {
          setIsLoading(
            true
          );

          setPageError(
            ""
          );

          const params =
            new URLSearchParams();

          if (
            statusFilter !==
              "ALL"
          ) {
            params.set(
              "status",
              statusFilter
            );
          }

          if (
            debouncedSearch
          ) {
            params.set(
              "search",
              debouncedSearch
            );
          }

          const query =
            params.toString();

          const response =
            await apiRequest<ChatterListResponse>(
              query
                ? `/api/chatters?${query}`
                : "/api/chatters"
            );

          setChatters(
            response.data
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load chatters";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load chatters"
          );
        } finally {
          setIsLoading(
            false
          );
        }
      },
      [
        statusFilter,
        debouncedSearch,
        toast,
      ]
    );

  useEffect(
    () => {
      void loadChatters();
    },
    [
      loadChatters,
      modelContextRevision,
    ]
  );

  useEffect(
    () => {
      const handleModelContextChange =
        () => {
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

  const chatterPageCount =
    Math.max(
      1,
      Math.ceil(
        chatters.length /
          CHATTER_LIST_PAGE_SIZE
      )
    );

  const safeChatterPage =
    Math.min(
      chatterPage,
      chatterPageCount
    );

  useEffect(
    () => {
      if (
        chatterPage >
          chatterPageCount
      ) {
        setChatterPage(
          chatterPageCount
        );
      }
    },
    [
      chatterPage,
      chatterPageCount,
    ]
  );

  const paginatedChatters =
    chatters.slice(
      (
        safeChatterPage -
        1
      ) *
        CHATTER_LIST_PAGE_SIZE,
      safeChatterPage *
        CHATTER_LIST_PAGE_SIZE
    );

  const chatterRangeStart =
    chatters.length === 0
      ? 0
      : (
          safeChatterPage -
          1
        ) *
          CHATTER_LIST_PAGE_SIZE +
        1;

  const chatterRangeEnd =
    Math.min(
      safeChatterPage *
        CHATTER_LIST_PAGE_SIZE,
      chatters.length
    );

  function buildListPath() {
    const params =
      new URLSearchParams();

    if (
      statusFilter !==
        "ALL"
    ) {
      params.set(
        "status",
        statusFilter
      );
    }

    const currentSearch =
      search.trim();

    if (
      currentSearch
    ) {
      params.set(
        "search",
        currentSearch
      );
    }

    if (
      safeChatterPage >
        1
    ) {
      params.set(
        "page",
        String(
          safeChatterPage
        )
      );
    }

    const query =
      params.toString();

    return query
      ? `/chatters?${query}`
      : "/chatters";
  }

  function openChatter(
    chatter:
      Chatter
  ) {
    const from =
      buildListPath();

    navigate(
      `/chatters/${encodeURIComponent(
        chatter.id
      )}?from=${encodeURIComponent(
        from
      )}`
    );
  }

  function handleRowKeyDown(
    event:
      KeyboardEvent<HTMLTableRowElement>,
    chatter:
      Chatter
  ) {
    if (
      event.key ===
        "Enter" ||
      event.key ===
        " "
    ) {
      event.preventDefault();

      openChatter(
        chatter
      );
    }
  }

  function openAddForm() {
    setName(
      ""
    );

    setFormError(
      ""
    );

    setPageError(
      ""
    );

    setShowForm(
      true
    );
  }

  function closeForm() {
    if (
      isSaving
    ) {
      return;
    }

    setShowForm(
      false
    );

    setPendingAdd(
      null
    );

    setName(
      ""
    );

    setFormError(
      ""
    );
  }

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

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

    setFormError(
      ""
    );

    setPendingAdd(
      trimmed
    );
  }

  async function addChatter() {
    if (
      !pendingAdd
    ) {
      return;
    }

    try {
      setIsSaving(
        true
      );

      const response =
        await apiRequest<ChatterMutationResponse>(
          "/api/chatters",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                name:
                  pendingAdd,
              }),
          }
        );

      toast.success(
        response.message,
        "Chatter added"
      );

      setPendingAdd(
        null
      );

      setShowForm(
        false
      );

      setName(
        ""
      );

      await loadChatters();
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save chatter";

      setPendingAdd(
        null
      );

      setFormError(
        message
      );

      toast.error(
        message,
        "Chatter not saved"
      );
    } finally {
      setIsSaving(
        false
      );
    }
  }

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
            and review their QA
            incident history.
          </p>
        </div>

        {canManageQaProfiles && (
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
              open their QA profile
              and incident history.
            </p>
          </div>

          <div className="toolbar-controls">
            <input
              className="search-input"
              type="search"
              value={search}
              onChange={(
                event
              ) => {
                setSearch(
                  event.target
                    .value
                );

                setChatterPage(
                  1
                );
              }}
              placeholder="Search chatters..."
              aria-label="Search chatters"
              maxLength={150}
            />

            <div className="filter-group">
              {(
                [
                  "ALL",
                  "ACTIVE",
                  "INACTIVE",
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
                      statusFilter ===
                      value
                        ? "filter-button active"
                        : "filter-button"
                    }
                    onClick={() => {
                      setStatusFilter(
                        value
                      );

                      setChatterPage(
                        1
                      );
                    }}
                  >
                    {value ===
                    "ALL"
                      ? "All"
                      : value ===
                          "ACTIVE"
                        ? "Active"
                        : "Inactive"}
                  </button>
                )
              )}
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
                  (
                    chatter
                  ) => (
                    <tr
                      key={
                        chatter.id
                      }
                      className="chatter-clickable-row"
                      tabIndex={0}
                      aria-label={`Open ${chatter.name} QA profile`}
                      onClick={() =>
                        openChatter(
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
                              View QA
                              incident
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
          chatters.length >
            0 &&
          chatterPageCount >
            1 && (
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
                disabled={
                  safeChatterPage <=
                  1
                }
                onClick={() =>
                  setChatterPage(
                    Math.max(
                      1,
                      safeChatterPage -
                        1
                    )
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
                disabled={
                  safeChatterPage >=
                  chatterPageCount
                }
                onClick={() =>
                  setChatterPage(
                    Math.min(
                      chatterPageCount,
                      safeChatterPage +
                        1
                    )
                  )
                }
              >
                Next
              </button>
            </div>
          </div>
        )}
      </section>

      {showForm &&
        canManageQaProfiles && (
        <div
          className="modal-backdrop"
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
                  Add Chatter
                </h3>

                <p>
                  Create a chatter
                  record for QA
                  incident tracking.
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
                    : "Add Chatter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {pendingAdd && (
        <div
          className="modal-backdrop confirmation-backdrop"
          onMouseDown={() => {
            if (
              !isSaving
            ) {
              setPendingAdd(
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
                  Add Chatter?
                </h3>

                <p>
                  Please confirm
                  before continuing.
                </p>
              </div>
            </div>

            <div className="confirmation-body">
              <p>
                Add "{pendingAdd}" as
                a new chatter?
              </p>
            </div>

            <div className="modal-actions">
              <button
                type="button"
                className="secondary-button"
                disabled={
                  isSaving
                }
                onClick={() =>
                  setPendingAdd(
                    null
                  )
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className="primary-button"
                disabled={
                  isSaving
                }
                onClick={() =>
                  void addChatter()
                }
              >
                {isSaving
                  ? "Processing..."
                  : "Add Chatter"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChattersPage;
