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
} from "react-router-dom";

import {
  apiRequest,
} from "../lib/api";

import {
  useToast,
} from "../components/ToastProvider";

import "./StrikeReasonsPage.css";


type StrikeReason = {
  id: string;
  name: string;
  description:
    string | null;
  isActive: boolean;
};


type DataResponse<T> = {
  data: T;
};


type MutationResponse<T> = {
  message: string;
  data: T;
};


const STRIKE_REASONS_PAGE_SIZE =
  8;


function sortReasons(
  values:
    StrikeReason[]
) {
  return [
    ...values,
  ].sort(
    (
      first,
      second
    ) => {
      if (
        first.isActive !==
        second.isActive
      ) {
        return first.isActive
          ? -1
          : 1;
      }

      return first.name.localeCompare(
        second.name
      );
    }
  );
}


function StrikeReasonsPage() {
  const navigate =
    useNavigate();

  const toast =
    useToast();

  const [
    reasons,
    setReasons,
  ] = useState<
    StrikeReason[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(
    true
  );

  const [
    pageError,
    setPageError,
  ] = useState(
    ""
  );

  const [
    editorOpen,
    setEditorOpen,
  ] = useState(
    false
  );

  const [
    editingId,
    setEditingId,
  ] = useState<
    string | null
  >(
    null
  );

  const [
    reasonName,
    setReasonName,
  ] = useState(
    ""
  );

  const [
    description,
    setDescription,
  ] = useState(
    ""
  );

  const [
    formError,
    setFormError,
  ] = useState(
    ""
  );

  const [
    saving,
    setSaving,
  ] = useState(
    false
  );

  const [
    actionId,
    setActionId,
  ] = useState<
    string | null
  >(
    null
  );

  const [
    search,
    setSearch,
  ] = useState(
    ""
  );

  const [
    reasonPage,
    setReasonPage,
  ] = useState(
    1
  );


  const loadReasons =
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
              DataResponse<
                StrikeReason[]
              >
            >(
              "/api/strike-reasons/manage"
            );

          setReasons(
            sortReasons(
              response.data
            )
          );
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Failed to load Strike reasons.";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load Strike reasons"
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
      void loadReasons();
    },
    [
      loadReasons,
    ]
  );


  const visibleReasons =
    useMemo(
      () => {
        const query =
          search
            .trim()
            .toLowerCase();

        if (
          !query
        ) {
          return reasons;
        }

        return reasons.filter(
          (
            reason
          ) =>
            [
              reason.name,
              reason.description,
              reason.isActive
                ? "active"
                : "archived",
            ]
              .filter(
                Boolean
              )
              .some(
                (
                  value
                ) =>
                  value!
                    .toLowerCase()
                    .includes(
                      query
                    )
              )
        );
      },
      [
        reasons,
        search,
      ]
    );


  const reasonPageCount =
    Math.max(
      1,
      Math.ceil(
        visibleReasons.length /
        STRIKE_REASONS_PAGE_SIZE
      )
    );

  const resolvedReasonPage =
    Math.min(
      reasonPage,
      reasonPageCount
    );

  const paginatedReasons =
    useMemo(
      () => {
        const start =
          (
            resolvedReasonPage -
            1
          ) *
          STRIKE_REASONS_PAGE_SIZE;

        return visibleReasons.slice(
          start,
          start +
            STRIKE_REASONS_PAGE_SIZE
        );
      },
      [
        visibleReasons,
        resolvedReasonPage,
      ]
    );


  function resetEditor() {
    setEditorOpen(
      false
    );

    setEditingId(
      null
    );

    setReasonName(
      ""
    );

    setDescription(
      ""
    );

    setFormError(
      ""
    );
  }


  function openAddReason() {
    setEditingId(
      null
    );

    setReasonName(
      ""
    );

    setDescription(
      ""
    );

    setFormError(
      ""
    );

    setEditorOpen(
      true
    );
  }


  function openEditReason(
    reason:
      StrikeReason
  ) {
    setEditingId(
      reason.id
    );

    setReasonName(
      reason.name
    );

    setDescription(
      reason.description ??
        ""
    );

    setFormError(
      ""
    );

    setEditorOpen(
      true
    );
  }


  async function saveReason(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (
      saving ||
      actionId
    ) {
      return;
    }

    const normalizedName =
      reasonName
        .trim()
        .replace(
          /\s+/g,
          " "
        );

    if (
      !normalizedName
    ) {
      setFormError(
        "Strike reason name is required."
      );

      return;
    }

    try {
      setSaving(
        true
      );

      setFormError(
        ""
      );

      const isEditing =
        Boolean(
          editingId
        );

      const response =
        await apiRequest<
          MutationResponse<
            StrikeReason
          >
        >(
          isEditing
            ? `/api/strike-reasons/${editingId}`
            : "/api/strike-reasons",
          {
            method:
              isEditing
                ? "PATCH"
                : "POST",

            body:
              JSON.stringify({
                name:
                  normalizedName,

                description:
                  description
                    .trim() ||
                  null,
              }),
          }
        );

      setReasons(
        (
          current
        ) => {
          const exists =
            current.some(
              (
                reason
              ) =>
                reason.id ===
                response
                  .data
                  .id
            );

          const next =
            exists
              ? current.map(
                  (
                    reason
                  ) =>
                    reason.id ===
                    response
                      .data
                      .id
                      ? response.data
                      : reason
                )
              : [
                  ...current,
                  response.data,
                ];

          return sortReasons(
            next
          );
        }
      );

      resetEditor();

      toast.success(
        response.message,
        isEditing
          ? "Reason updated"
          : "Reason created"
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save Strike reason.";

      setFormError(
        message
      );

      toast.error(
        message,
        "Reason was not saved"
      );
    } finally {
      setSaving(
        false
      );
    }
  }


  async function changeStatus(
    reason:
      StrikeReason
  ) {
    if (
      saving ||
      actionId
    ) {
      return;
    }

    const action =
      reason.isActive
        ? "archive"
        : "reactivate";

    try {
      setActionId(
        reason.id
      );

      setPageError(
        ""
      );

      const response =
        await apiRequest<
          MutationResponse<
            StrikeReason
          >
        >(
          `/api/strike-reasons/${reason.id}/${action}`,
          {
            method:
              "POST",
          }
        );

      setReasons(
        (
          current
        ) =>
          sortReasons(
            current.map(
              (
                item
              ) =>
                item.id ===
                response.data.id
                  ? response.data
                  : item
            )
          )
      );

      if (
        editingId ===
        response.data.id
      ) {
        resetEditor();
      }

      toast.success(
        response.message,
        response
          .data
          .isActive
          ? "Reason reactivated"
          : "Reason archived"
      );
    } catch (
      error
    ) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update Strike reason.";

      setPageError(
        message
      );

      toast.error(
        message,
        "Reason status unchanged"
      );
    } finally {
      setActionId(
        null
      );
    }
  }


  return (
    <div className="page strike-reasons-page">
      <header className="page-header strike-reasons-header">
        <div>
          <p className="page-eyebrow">
            Disciplinary configuration
          </p>

          <h2>
            Strike Reasons
          </h2>

          <p className="page-description">
            Manage the reasons available when issuing disciplinary Strikes.
          </p>
        </div>

        <div className="strike-reasons-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() =>
              navigate(
                "/strikes"
              )
            }
          >
            ← Back to Strikes
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={
              openAddReason
            }
            disabled={
              saving ||
              Boolean(
                actionId
              )
            }
          >
            Add Reason
          </button>
        </div>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      {editorOpen && (
        <div
          className="modal-backdrop strike-reason-modal-backdrop"
          onMouseDown={(
            event
          ) => {
            if (
              event.target ===
                event.currentTarget &&
              !saving
            ) {
              resetEditor();
            }
          }}
        >
          <section
            className="modal strike-reason-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="strike-reason-editor-title"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <p className="page-eyebrow">
                  Strike configuration
                </p>

                <h3 id="strike-reason-editor-title">
                  {editingId
                    ? "Edit Reason"
                    : "Add Reason"}
                </h3>

                <p>
                  Changes affect future Strike issuance only. Historical records retain their original reason snapshot.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                aria-label={
                  editingId
                    ? "Close Edit Reason"
                    : "Close Add Reason"
                }
                onClick={
                  resetEditor
                }
                disabled={
                  saving
                }
              >
                &times;
              </button>
            </div>

            <form
              className="modal-form strike-reason-modal-form"
              onSubmit={
                saveReason
              }
              noValidate
            >
              <div className="form-stack">
                <label className="form-field">
                  <span>
                    Reason name
                  </span>

                  <input
                    value={
                      reasonName
                    }
                    onChange={(
                      event
                    ) => {
                      setReasonName(
                        event.target.value
                      );

                      if (
                        formError
                      ) {
                        setFormError(
                          ""
                        );
                      }
                    }}
                    maxLength={
                      120
                    }
                    placeholder="e.g. Repeated policy violation"
                    disabled={
                      saving
                    }
                    autoFocus
                  />
                </label>

                <label className="form-field">
                  <span>
                    Description

                    <small>
                      Optional
                    </small>
                  </span>

                  <textarea
                    rows={
                      4
                    }
                    maxLength={
                      1000
                    }
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event.target.value
                      )
                    }
                    placeholder="Clarify when this reason should be used."
                    disabled={
                      saving
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
                  type="button"
                  className="secondary-button"
                  onClick={
                    resetEditor
                  }
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
                    !reasonName
                      .trim()
                  }
                >
                  {saving
                    ? "Saving..."
                    : editingId
                      ? "Save Changes"
                      : "Add Reason"}
                </button>
              </div>
            </form>
          </section>
        </div>
      )}


      <section className="content-card">
        <div className="card-header strike-reasons-toolbar">
          <div>
            <h3>
              Reason Records
            </h3>

            <p>
              Active reasons are available during Strike issuance. Archived reasons remain preserved for historical records.
            </p>
          </div>

          <input
            className="search-input strike-reasons-search"
            type="search"
            value={
              search
            }
            onChange={(
              event
            ) => {
              setSearch(
                event.target.value
              );

              setReasonPage(
                1
              );
            }}
            placeholder="Search reasons..."
            aria-label="Search Strike reasons"
          />
        </div>

        {loading ? (
          <div className="empty-state">
            <strong>
              Loading Strike reasons...
            </strong>
          </div>
        ) : visibleReasons.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching Strike reasons
            </strong>

            <span>
              {search.trim()
                ? "No configured reasons match your search."
                : "Add the first Strike reason to begin."}
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table strike-reasons-table">
              <thead>
                <tr>
                  <th>
                    Reason
                  </th>

                  <th>
                    Description
                  </th>

                  <th>
                    Status
                  </th>

                  <th className="actions-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {paginatedReasons.map(
                  (
                    reason
                  ) => (
                    <tr
                      key={
                        reason.id
                      }
                    >
                      <td>
                        <strong className="strike-reason-name">
                          {reason.name}
                        </strong>
                      </td>

                      <td>
                        <span className="strike-reason-description">
                          {reason.description ||
                            "No description provided."}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            reason.isActive
                              ? "status-badge active"
                              : "status-badge inactive"
                          }
                        >
                          {reason.isActive
                            ? "Active"
                            : "Archived"}
                        </span>
                      </td>

                      <td>
                        <div className="table-actions">
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              openEditReason(
                                reason
                              )
                            }
                            disabled={
                              saving ||
                              Boolean(
                                actionId
                              )
                            }
                          >
                            Edit
                          </button>

                          <button
                            type="button"
                            className={
                              reason.isActive
                                ? "text-button danger"
                                : "text-button success"
                            }
                            onClick={() => {
                              void changeStatus(
                                reason
                              );
                            }}
                            disabled={
                              saving ||
                              Boolean(
                                actionId
                              )
                            }
                          >
                            {actionId ===
                            reason.id
                              ? "Updating..."
                              : reason.isActive
                                ? "Archive"
                                : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </div>
        )}

        {visibleReasons.length >
          0 && (
          <div
            className="strike-reasons-pagination"
            aria-label="Strike Reasons pagination"
          >
            <span>
              {visibleReasons.length} total reasons
            </span>

            <div>
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setReasonPage(
                    Math.max(
                      1,
                      resolvedReasonPage -
                        1
                    )
                  )
                }
                disabled={
                  resolvedReasonPage <=
                    1
                }
              >
                Previous
              </button>

              <strong>
                Page {resolvedReasonPage} of{" "}
                {reasonPageCount}
              </strong>

              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  setReasonPage(
                    Math.min(
                      reasonPageCount,
                      resolvedReasonPage +
                        1
                    )
                  )
                }
                disabled={
                  resolvedReasonPage >=
                    reasonPageCount
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


export default StrikeReasonsPage;
