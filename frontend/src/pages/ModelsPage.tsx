import { useNavigationFilter } from "../lib/useNavigationFilter";
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
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import "./ModelsPage.css";

type AgencyModel = {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  peopleCount: number;
  incidentCount: number;
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

  async function createModel(
    event:
      FormEvent
  ) {
    event.preventDefault();

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
    <div className="page models-page">
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

      {createOpen && (
        <div className="models-overlay">
          <form
            className="models-modal"
            onSubmit={
              createModel
            }
          >
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Creator catalog
                </span>

                <h3>
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

      {editModel && (
        <div className="models-overlay">
          <form
            className="models-modal"
            onSubmit={
              renameModel
            }
          >
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Creator catalog
                </span>

                <h3>
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

      {statusModel && (
        <div className="models-overlay">
          <section className="models-modal models-confirm-modal">
            <div className="models-modal-header">
              <div>
                <span className="page-eyebrow">
                  Confirmation
                </span>

                <h3>
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
