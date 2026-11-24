import { useNavigationFilter } from "../lib/useNavigationFilter";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import {
  apiRequest,
  PEOPLE_CHANGED_EVENT,
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import {
  useAuth,
} from "../auth/AuthContext";

import {
  getPortalCapabilities,
} from "../auth/portalAccess";

import {
  CreatorPhoneList,
  CreatorPhoneScreen,
} from "../components/CreatorPhoneViews";

import {
  PHONE_QUERY,
  useMediaQuery,
} from "../lib/useMediaQuery";

import "./ModelsPage.css";

type AgencyModel = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  peopleCount: number;
  incidentCount: number;
  hasLinkedAccount: boolean;
  creatorAccount: { id: string; name: string; status: string; hasCreatorRole: boolean } | null;
};

type ModelsResponse = {
  models:
    AgencyModel[];
};

type ModelMutationResponse = {
  model:
    AgencyModel;
};

type StatusFilter =
  | "ALL"
  | "ACTIVE"
  | "INACTIVE";

const TEXAS_TIME_ZONE =
  "America/Chicago";

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
    new Date(value)
  );
}

function ModelsPage() {
  const toast =
    useToast();

  const {
    access,
  } =
    useAuth();

  const {
    canCreateModels,
    canEditModels,
    canManageModelStatus,
  } =
    getPortalCapabilities(
      access
    );

  const [
    models,
    setModels,
  ] =
    useState<
      AgencyModel[]
    >([]);

  const [
    loading,
    setLoading,
  ] =
    useState(
      true
    );

  const [
    saving,
    setSaving,
  ] =
    useState(
      false
    );

  const [
    pageError,
    setPageError,
  ] =
    useState(
      ""
    );

  const [
    search,
    setSearch,
  ] =
    useState(
      ""
    );

  const [statusFilter, setStatusFilter] = useNavigationFilter<StatusFilter>(
    "status", ["ALL","ACTIVE","INACTIVE"], "ALL",
  );

  const [
    createOpen,
    setCreateOpen,
  ] =
    useState(
      false
    );

  const [
    createName,
    setCreateName,
  ] =
    useState(
      ""
    );

  const [
    editModel,
    setEditModel,
  ] =
    useState<
      AgencyModel | null
    >(
      null
    );

  const [
    editName,
    setEditName,
  ] =
    useState(
      ""
    );

  const [
    statusModel,
    setStatusModel,
  ] =
    useState<
      AgencyModel | null
    >(
      null
    );

  const isPhone =
    useMediaQuery(
      PHONE_QUERY
    );

  // Phones: the creator open on its own screen.
  const [
    phoneCreatorId,
    setPhoneCreatorId,
  ] =
    useState<
      string | null
    >(
      null
    );

  // The creator screen belongs to phones: crossing 720px closes it, so it
  // doesn't reappear later. (Adjusted while rendering, not in an effect.)
  const [
    creatorLayoutIsPhone,
    setCreatorLayoutIsPhone,
  ] =
    useState(
      isPhone
    );

  if (
    creatorLayoutIsPhone !==
    isPhone
  ) {
    setCreatorLayoutIsPhone(
      isPhone
    );

    setPhoneCreatorId(
      null
    );
  }

  const phoneBackRef =
    useRef<HTMLButtonElement>(
      null
    );

  // Phones: where focus goes once the creator screen or a window closes.
  const phoneReturnFocus =
    useRef<
      string | null
    >(
      null
    );

  const loadModels =
    useCallback(
      async () => {
        try {
          setLoading(
            true
          );

          setPageError(
            ""
          );

          const response =
            await apiRequest<
              ModelsResponse
            >(
              "/api/models"
            );

          setModels(
            response.models
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load creators.";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load creators"
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
      void loadModels();
    },
    [
      loadModels,
    ]
  );

  useEffect(() => {
    const refresh = () => { void loadModels(); };
    window.addEventListener(PEOPLE_CHANGED_EVENT, refresh);
    return () => window.removeEventListener(PEOPLE_CHANGED_EVENT, refresh);
  }, [loadModels]);

  const activeCount =
    models.filter(
      (
        model
      ) =>
        model.isActive
    ).length;

  const inactiveCount =
    models.length -
    activeCount;

  const totalAssignments =
    models.reduce(
      (
        total,
        model
      ) =>
        total +
        model.peopleCount,
      0
    );

  const filteredModels =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        return models.filter(
          (
            model
          ) => {
            if (
              statusFilter ===
                "ACTIVE" &&
              !model.isActive
            ) {
              return false;
            }

            if (
              statusFilter ===
                "INACTIVE" &&
              model.isActive
            ) {
              return false;
            }

            if (
              query &&
              !model.name
                .toLowerCase()
                .includes(
                  query
                )
            ) {
              return false;
            }

            return true;
          }
        );
      },
      [
        models,
        search,
        statusFilter,
      ]
    );

  // Phones: the tab counts follow the search, as in Strike Management.
  const phoneCounts =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        const matched =
          models.filter(
            (model) =>
              !query ||
              model.name
                .toLowerCase()
                .includes(
                  query
                )
          );

        const active =
          matched.filter(
            (model) =>
              model.isActive
          ).length;

        return {
          ALL: matched.length,
          ACTIVE: active,
          INACTIVE:
            matched.length -
            active,
        };
      },
      [
        models,
        search,
      ]
    );

  const phoneCreator =
    isPhone &&
    phoneCreatorId
      ? models.find(
          (model) =>
            model.id ===
            phoneCreatorId
        ) ?? null
      : null;

  // Which window is open, matching each window's own render condition, so
  // the creator screen is never left inert with nothing over it.
  const phoneWindow =
    canCreateModels &&
    createOpen
      ? "create"
      : canEditModels &&
          editModel
        ? "rename"
        : canManageModelStatus &&
            statusModel
          ? "status"
          : null;

  // Phones: focus goes to Back when the creator screen opens, into a window
  // when one opens, and back to what opened it once it closes.
  useEffect(
    () => {
      if (
        !isPhone
      ) {
        return;
      }

      if (
        phoneWindow
      ) {
        const overlay =
          document.querySelector<HTMLElement>(
            ".models-page-phone .models-overlay"
          );

        // The name fields already take focus themselves.
        if (
          overlay &&
          !overlay.contains(
            document.activeElement
          )
        ) {
          overlay
            .querySelector<HTMLElement>(
              "input, button"
            )
            ?.focus();
        }

        return;
      }

      const selector =
        phoneReturnFocus.current;

      if (
        selector
      ) {
        phoneReturnFocus.current =
          null;

        // If that button is gone, focus Add (or nothing) rather than the
        // search, which would raise the keyboard.
        (
          document.querySelector<HTMLElement>(
            selector
          ) ??
          document.querySelector<HTMLElement>(
            ".creator-phone-add"
          )
        )?.focus();

        return;
      }

      if (
        phoneCreatorId
      ) {
        phoneBackRef.current?.focus();
      }
    },
    [
      isPhone,
      phoneCreatorId,
      phoneWindow,
    ]
  );

  // Escape closes the creator screen when no window is open over it.
  useEffect(
    () => {
      if (
        !phoneCreator ||
        phoneWindow
      ) {
        return;
      }

      const creatorId =
        phoneCreator.id;

      const closeOnEscape = (
        event: KeyboardEvent
      ) => {
        if (
          event.key ===
          "Escape"
        ) {
          phoneReturnFocus.current =
            `[data-creator-id="${creatorId}"]`;

          setPhoneCreatorId(
            null
          );
        }
      };

      document.addEventListener(
        "keydown",
        closeOnEscape
      );

      return () =>
        document.removeEventListener(
          "keydown",
          closeOnEscape
        );
    },
    [
      phoneCreator,
      phoneWindow,
    ]
  );

  function closePhoneCreator() {
    if (
      phoneCreatorId
    ) {
      phoneReturnFocus.current =
        `[data-creator-id="${phoneCreatorId}"]`;
    }

    setPhoneCreatorId(
      null
    );
  }

  async function createModel(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !canCreateModels
    ) {
      return;
    }

    const name =
      createName.trim();

    if (!name) {
      toast.warning(
        "Enter a creator name.",
        "Creator name required"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      const response =
        await apiRequest<
          ModelMutationResponse
        >(
          "/api/models",
          {
            method:
              "POST",

            body:
              JSON.stringify({
                name,
              }),
          }
        );

      setModels(
        (
          current
        ) => [
          response.model,
          ...current,
        ]
      );

      setCreateName(
        ""
      );

      setCreateOpen(
        false
      );

      toast.success(
        "The creator was added and is ready for assignment.",
        "Creator added"
      );

      await loadModels();
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to create the creator.",
        "Creator not added"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  function openRename(
    model:
      AgencyModel
  ) {
    if (
      !canEditModels
    ) {
      return;
    }

    setEditModel(
      model
    );

    setEditName(
      model.name
    );
  }

  async function renameModel(
    event:
      FormEvent
  ) {
    event.preventDefault();

    if (
      !canEditModels ||
      !editModel
    ) {
      return;
    }

    const name =
      editName.trim();

    if (!name) {
      toast.warning(
        "Enter a creator name.",
        "Creator name required"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        `/api/models/${editModel.id}`,
        {
          method:
            "PUT",

          body:
            JSON.stringify({
              name,
            }),
        }
      );

      setEditModel(
        null
      );

      setEditName(
        ""
      );

      await loadModels();

      toast.success(
        "The creator name was updated.",
        "Creator updated"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the creator.",
        "Creator not updated"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function changeStatus() {
    if (
      !canManageModelStatus ||
      !statusModel
    ) {
      return;
    }

    const action =
      statusModel.isActive
        ? "deactivate"
        : "reactivate";

    try {
      setSaving(
        true
      );

      await apiRequest(
        `/api/models/${statusModel.id}/${action}`,
        {
          method:
            "POST",
        }
      );

      const wasActive =
        statusModel.isActive;

      setStatusModel(
        null
      );

      await loadModels();

      toast.success(
        wasActive
          ? "The creator is inactive. Existing assignments and history were preserved."
          : "The creator is active again and can be assigned.",
        wasActive
          ? "Creator deactivated"
          : "Creator reactivated"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to update the creator.",
        "Status not changed"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  return (
    <div className={`page models-page${isPhone ? " models-page-phone" : ""}`}>
      {isPhone ? (
        <>
          {/* Phones: the top bar already says Creators; the heading stays for screen readers. */}
          <h2 className="models-sr-only">
            Creator Management
          </h2>

          {/* While a creator's screen covers it, the list can't be reached by Tab or a screen reader. */}
          <section
            className="creator-phone-records"
            inert={
              phoneCreator
                ? true
                : undefined
            }
          >
            <div className="creator-phone-toolbar">
              <div className="creator-phone-search-row">
                <input
                  className="search-input"
                  type="search"
                  placeholder="Search creators"
                  aria-label="Search creators"
                  value={
                    search
                  }
                  onChange={(
                    event
                  ) =>
                    setSearch(
                      event.target.value
                    )
                  }
                />

                {canCreateModels && (
                  <button
                    type="button"
                    className="creator-phone-add"
                    aria-label="Add creator"
                    onClick={() => {
                      phoneReturnFocus.current =
                        ".creator-phone-add";

                      setCreateOpen(
                        true
                      );
                    }}
                  >
                    Add
                  </button>
                )}
              </div>

              {/* The number cards and filters become these tabs: tap one to filter. */}
              <div className="filter-group creator-phone-tabs">
                {(
                  [
                    "ALL",
                    "ACTIVE",
                    "INACTIVE",
                  ] as const
                ).map(
                  (value) => (
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
                      onClick={() =>
                        setStatusFilter(
                          value
                        )
                      }
                    >
                      {value ===
                      "ALL"
                        ? "All"
                        : value ===
                            "ACTIVE"
                          ? "Active"
                          : "Inactive"}{" "}
                      <span className="creator-phone-tab-count">
                        {phoneCounts[value]}
                      </span>
                    </button>
                  )
                )}
              </div>
            </div>

            {pageError && (
              <div className="models-inline-error">
                {pageError}
              </div>
            )}

            {loading ? (
              <div className="empty-state">
                <strong>
                  Loading creators…
                </strong>
              </div>
            ) : filteredModels.length ===
              0 ? (
              <div className="empty-state">
                <strong>
                  No matching creators
                </strong>

                <span>
                  Try another search or tab.
                </span>
              </div>
            ) : (
              <CreatorPhoneList
                creators={
                  filteredModels
                }
                onOpen={(
                  creator
                ) =>
                  setPhoneCreatorId(
                    creator.id
                  )
                }
              />
            )}

            <p className="creator-phone-note">
              {totalAssignments} user assignment{totalAssignments === 1 ? "" : "s"} in total. Creators are never deleted; deactivating keeps assignments and history.
            </p>
          </section>

          {phoneCreator && (
            <CreatorPhoneScreen
              key={
                phoneCreator.id
              }
              creator={
                phoneCreator
              }
              covered={
                Boolean(
                  phoneWindow
                )
              }
              backButtonRef={
                phoneBackRef
              }
              onBack={
                closePhoneCreator
              }
              onRename={
                canEditModels
                  ? () => {
                      phoneReturnFocus.current =
                        '[data-creator-action="rename"]';

                      openRename(
                        phoneCreator
                      );
                    }
                  : undefined
              }
              onChangeStatus={
                canManageModelStatus
                  ? () => {
                      phoneReturnFocus.current =
                        '[data-creator-action="status"]';

                      setStatusModel(
                        phoneCreator
                      );
                    }
                  : undefined
              }
            />
          )}
        </>
      ) : (
      <>
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Agency operations
          </p>

          <h2>
            Creator Management
          </h2>

          <p className="page-description">
            Maintain the agency creator catalog used by People Management and creator-scoped access control.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          hidden={
            !canCreateModels
          }
          onClick={() =>
            setCreateOpen(
              true
            )
          }
        >
          Add creator
        </button>
      </header>

      <section className="models-summary-grid">
        <div className="stat-card">
          <span className="stat-label">
            Total creators
          </span>

          <strong className="stat-value">
            {models.length}
          </strong>

          <span className="stat-help">
            Active and inactive catalog records.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Active
          </span>

          <strong className="stat-value">
            {activeCount}
          </strong>

          <span className="stat-help">
            Available for new assignments.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Inactive
          </span>

          <strong className="stat-value">
            {inactiveCount}
          </strong>

          <span className="stat-help">
            Preserved but unavailable for new assignments.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            User assignments
          </span>

          <strong className="stat-value">
            {totalAssignments}
          </strong>

          <span className="stat-help">
            Current person-to-creator assignment records.
          </span>
        </div>
      </section>

      <section className="content-card">
        <div className="models-toolbar">
          <input
            className="search-input"
            type="search"
            placeholder="Search creator name"
            aria-label="Search creators"
            value={
              search
            }
            onChange={(
              event
            ) =>
              setSearch(
                event.target.value
              )
            }
          />

          <div className="filter-group">
            {[
              {
                key:
                  "ALL",
                label:
                  "All",
              },
              {
                key:
                  "ACTIVE",
                label:
                  "Active",
              },
              {
                key:
                  "INACTIVE",
                label:
                  "Inactive",
              },
            ].map(
              (
                option
              ) => (
                <button
                  key={
                    option.key
                  }
                  type="button"
                  className={
                    statusFilter ===
                    option.key
                      ? "filter-button active"
                      : "filter-button"
                  }
                  onClick={() =>
                    setStatusFilter(
                      option.key as
                        StatusFilter
                    )
                  }
                >
                  {option.label}
                </button>
              )
            )}
          </div>
        </div>

        {pageError && (
          <div className="models-inline-error">
            {pageError}
          </div>
        )}

        {loading ? (
          <div className="empty-state">
            <strong>
              Loading creators…
            </strong>
          </div>
        ) : filteredModels.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching creators
            </strong>

            <span>
              Try another search or status filter.
            </span>
          </div>
        ) : (
          <div className="models-table-wrap">
            <div className="models-table models-table-head">
              <span>
                Creator
              </span>

              <span>
                Status
              </span>

              <span>
                People
              </span>

              <span>
                Incidents
              </span>

              <span>
                Updated
              </span>

              <span>
                Actions
              </span>
            </div>

            {filteredModels.map(
              (
                model
              ) => (
                <div
                  key={
                    model.id
                  }
                  className="models-table models-table-row"
                >
                  <span className="models-name-cell">
                    <strong>
                      {model.name}
                    </strong>

                    <small>
                      {model.creatorAccount
                        ? "Account: " + model.creatorAccount.name + (model.creatorAccount.hasCreatorRole ? "" : " (Creator role removed)")
                        : model.hasLinkedAccount ? "Creator account connected" : "No creator account connected"}
                    </small>
                    {model.creatorAccount?.status === "PENDING_SETUP" && <small>Account pending setup</small>}
                    {model.creatorAccount?.status === "DEACTIVATED" && <small>Login account deactivated</small>}
                    <small>
                      Created {formatTexasDateTime(
                        model.createdAt
                      )}
                    </small>
                  </span>

                  <span>
                    <span
                      className={
                        model.isActive
                          ? "models-status active"
                          : "models-status inactive"
                      }
                    >
                      {model.isActive
                        ? "Active"
                        : "Inactive"}
                    </span>
                  </span>

                  <span className="models-number-cell">
                    {model.peopleCount}
                  </span>

                  <span className="models-number-cell">
                    {model.incidentCount}
                  </span>

                  <span className="models-muted-cell">
                    {formatTexasDateTime(
                      model.updatedAt
                    )}
                  </span>

                  <span className="models-actions">
                    <button
                      type="button"
                      className="text-button"
                      hidden={
                        !canEditModels
                      }
                      onClick={() =>
                        openRename(
                          model
                        )
                      }
                    >
                      Rename
                    </button>

                    <button
                      type="button"
                      hidden={
                        !canManageModelStatus
                      }
                      className={
                        model.isActive
                          ? "text-button danger"
                          : "text-button success"
                      }
                      onClick={() =>
                        setStatusModel(
                          model
                        )
                      }
                    >
                      {model.isActive
                        ? "Deactivate"
                        : "Reactivate"}
                    </button>
                  </span>
                </div>
              )
            )}
          </div>
        )}
      </section>

      <div className="models-policy-note">
        <strong>
          No permanent creator deletion
        </strong>

        <span>
          Deactivating a creator keeps existing user assignments and historical incident relationships intact. Inactive creators cannot be newly assigned until they are reactivated.
        </span>
      </div>
      </>
      )}

      {canCreateModels && createOpen && (
        <div className="models-overlay">
          <form
            className="models-modal"
            onSubmit={
              createModel
            }
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "models-create-title" : undefined}
          >
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Creator catalog
                </span>

                <h3 id={isPhone ? "models-create-title" : undefined}>
                  Add creator
                </h3>
              </div>

              <button
                type="button"
                className="models-close"
                onClick={() => {
                  setCreateOpen(
                    false
                  );

                  setCreateName(
                    ""
                  );
                }}
                aria-label="Close add creator"
              >
                ×
              </button>
            </div>

            <div className="models-modal-body">
              <label className="form-field">
                <span>
                  Creator name
                </span>

                <input
                  value={
                    createName
                  }
                  onChange={(
                    event
                  ) =>
                    setCreateName(
                      event.target.value
                    )
                  }
                  maxLength={
                    120
                  }
                  autoFocus
                />
              </label>

              <p className="models-help">
                New creators are active immediately and can be assigned through People Management.
              </p>
            </div>

            <div className="models-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setCreateOpen(
                    false
                  );

                  setCreateName(
                    ""
                  );
                }}
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving ||
                  !createName.trim()
                }
              >
                {saving
                  ? "Creating…"
                  : "Create creator"}
              </button>
            </div>
          </form>
        </div>
      )}

      {canEditModels && editModel && (
        <div className="models-overlay">
          <form
            className="models-modal"
            onSubmit={
              renameModel
            }
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "models-rename-title" : undefined}
          >
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Creator catalog
                </span>

                <h3 id={isPhone ? "models-rename-title" : undefined}>
                  Rename creator
                </h3>
              </div>

              <button
                type="button"
                className="models-close"
                onClick={() => {
                  setEditModel(
                    null
                  );

                  setEditName(
                    ""
                  );
                }}
                aria-label="Close rename creator"
              >
                ×
              </button>
            </div>

            <div className="models-modal-body">
              <label className="form-field">
                <span>
                  Creator name
                </span>

                <input
                  value={
                    editName
                  }
                  onChange={(
                    event
                  ) =>
                    setEditName(
                      event.target.value
                    )
                  }
                  maxLength={
                    120
                  }
                  autoFocus
                />
              </label>

              <p className="models-help">
                Renaming keeps the same creator identity, assignments, and incident relationships.
              </p>
            </div>

            <div className="models-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() => {
                  setEditModel(
                    null
                  );

                  setEditName(
                    ""
                  );
                }}
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving ||
                  !editName.trim()
                }
              >
                {saving
                  ? "Saving…"
                  : "Save name"}
              </button>
            </div>
          </form>
        </div>
      )}

      {canManageModelStatus && statusModel && (
        <div className="models-overlay">
          <section
            className="models-modal models-confirm-modal"
            role={isPhone ? "dialog" : undefined}
            aria-modal={isPhone ? true : undefined}
            aria-labelledby={isPhone ? "models-status-title" : undefined}
          >
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Confirmation
                </span>

                <h3 id={isPhone ? "models-status-title" : undefined}>
                  {statusModel.isActive
                    ? "Deactivate creator?"
                    : "Reactivate creator?"}
                </h3>
              </div>
            </div>

            <div className="models-modal-body">
              <p className="models-confirm-copy">
                {statusModel.isActive
                  ? `${statusModel.name} will no longer be available for new user assignments. Existing assignments and incident history will remain intact.`
                  : `${statusModel.name} will become available for assignments again.`}
              </p>

              {statusModel.isActive &&
                statusModel.peopleCount >
                  0 && (
                  <div className="models-warning-box">
                    <strong>
                      {statusModel.peopleCount} current user assignment{statusModel.peopleCount ===
                      1
                        ? ""
                        : "s"} will be preserved.
                    </strong>

                    <span>
                      Deactivation does not automatically remove access assignments.
                    </span>
                  </div>
                )}
            </div>

            <div className="models-modal-footer">
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setStatusModel(
                    null
                  )
                }
                disabled={
                  saving
                }
              >
                Cancel
              </button>

              <button
                type="button"
                className={
                  statusModel.isActive
                    ? "danger-button"
                    : "primary-button"
                }
                onClick={() => {
                  void changeStatus();
                }}
                disabled={
                  saving
                }
              >
                {saving
                  ? "Working…"
                  : statusModel.isActive
                    ? "Deactivate"
                    : "Reactivate"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default ModelsPage;
