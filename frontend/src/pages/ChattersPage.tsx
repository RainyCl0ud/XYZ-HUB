import {
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

import type {
  KeyboardEvent,
} from "react";

import {
  useNavigate,
  useSearchParams,
} from "react-router-dom";

import {
  apiRequest,
  MODEL_CONTEXT_CHANGED_EVENT,
  MODEL_CONTEXT_STORAGE_KEY,
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import {
  ChatterPhoneList,
} from "../components/ChatterPhoneList";

import {
  ModelPickerSlotContext,
} from "../lib/model-picker-slot";

import {
  PHONE_QUERY,
  useMediaQuery,
} from "../lib/useMediaQuery";

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

  const isPhone =
    useMediaQuery(PHONE_QUERY);

  // Phones: the top bar's creator picker is drawn beside the search.
  const setModelPickerSlot =
    useContext(ModelPickerSlotContext);

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

  function chatterProfilePath(
    chatter:
      Pick<Chatter, "id">
  ) {
    return `/chatters/${encodeURIComponent(
      chatter.id
    )}?from=${encodeURIComponent(
      buildListPath()
    )}`;
  }

  function openChatter(
    chatter:
      Chatter
  ) {
    navigate(
      chatterProfilePath(
        chatter
      )
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

  // Shared by both layouts. Phones (720px and below) place them in a
  // shorter layout; desktop keeps the original header and table.
  const searchInput = (
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
  );

  // The top bar saves the chosen creator; "ALL" means every creator.
  const oneCreatorSelected = (() => {
    try {
      const saved =
        window.localStorage.getItem(
          MODEL_CONTEXT_STORAGE_KEY
        );

      return Boolean(saved && saved !== "ALL");
    } catch {
      return false;
    }
  })();

  const statusFilterGroup = (
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
            aria-pressed={
              statusFilter ===
              value
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
  );

  return (
    <div className={`page chatters-page${isPhone ? " chatters-page-phone" : ""}`}>
      {isPhone ? (
        <h2 className="chatters-sr-only">Chatters</h2>
      ) : (
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
        </header>
      )}

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      <section className={isPhone ? "chatters-phone-records" : "content-card"}>
        {isPhone ? (
          <div className="chatters-phone-toolbar">
            <div className="chatters-phone-search-row">
              {searchInput}

              {/* The top bar's creator picker is drawn here on phones. */}
              <div
                className="chatters-phone-creator"
                ref={setModelPickerSlot}
              />
            </div>

            {statusFilterGroup}
          </div>
        ) : (
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
              {searchInput}

              {statusFilterGroup}
            </div>
          </div>
        )}

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
                : statusFilter !== "ALL"
                  ? "Try another status filter."
                  : oneCreatorSelected
                    ? "No chatters are assigned to this creator yet."
                    : "Chatters appear here once someone in People has the Chatter or Trial Chatter role."}
            </span>
          </div>
        ) : isPhone ? (
          <ChatterPhoneList
            chatters={paginatedChatters}
            profilePath={chatterProfilePath}
            formatAdded={formatTexasDate}
          />
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
    </div>
  );
}

export default ChattersPage;
