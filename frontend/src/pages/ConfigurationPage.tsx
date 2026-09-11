import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";

import type {
  DragEvent,
  FormEvent,
} from "react";

import { apiRequest } from "../lib/api";

type OptionKind = "severity" | "weight";

type BaseOption = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

type SeverityOption = BaseOption;

type WeightOption = BaseOption & {
  value: number | null;
};

type OptionListResponse<T> = {
  data: T[];
};

function ConfigurationPage() {
  const [
    severityOptions,
    setSeverityOptions,
  ] = useState<SeverityOption[]>([]);

  const [
    weightOptions,
    setWeightOptions,
  ] = useState<WeightOption[]>([]);

  const [isLoading, setIsLoading] =
    useState(true);

  const [pageError, setPageError] =
    useState("");

  const [
    modalKind,
    setModalKind,
  ] = useState<OptionKind | null>(null);

  const [
    editingOption,
    setEditingOption,
  ] = useState<
    SeverityOption | WeightOption | null
  >(null);

  const [name, setName] = useState("");

  const [
    description,
    setDescription,
  ] = useState("");

  const [
    weightValue,
    setWeightValue,
  ] = useState("");

  const [formError, setFormError] =
    useState("");

  const [isSaving, setIsSaving] =
    useState(false);

  const [actionId, setActionId] =
    useState<string | null>(null);

  /*
   * Reorder state
   *
   * Only one configuration list can enter
   * reorder mode at a time.
   */
  const [
    reorderKind,
    setReorderKind,
  ] = useState<OptionKind | null>(null);

  const [
    isSavingOrder,
    setIsSavingOrder,
  ] = useState(false);

  const [
    draggedId,
    setDraggedId,
  ] = useState<string | null>(null);

  const [
    dragOverId,
    setDragOverId,
  ] = useState<string | null>(null);

  /*
   * Brief visual confirmation after a successful drop.
   * A single ID is enough because only one list can be
   * reordered at a time.
   */
  const [
    lastMovedId,
    setLastMovedId,
  ] = useState<string | null>(null);

  const placedTimerRef =
    useRef<number | null>(null);

  /*
   * We keep a copy of the original arrangement
   * so Cancel can restore it exactly.
   */
  const [
    severityBackup,
    setSeverityBackup,
  ] = useState<SeverityOption[]>([]);

  const [
    weightBackup,
    setWeightBackup,
  ] = useState<WeightOption[]>([]);

  const loadOptions =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setPageError("");

        const [
          severityResponse,
          weightResponse,
        ] = await Promise.all([
          apiRequest<
            OptionListResponse<SeverityOption>
          >("/api/severity-options"),

          apiRequest<
            OptionListResponse<WeightOption>
          >("/api/weight-options"),
        ]);

        setSeverityOptions(
          severityResponse.data
        );

        setWeightOptions(
          weightResponse.data
        );
      } catch (error) {
        setPageError(
          error instanceof Error
            ? error.message
            : "Failed to load configuration"
        );
      } finally {
        setIsLoading(false);
      }
    }, []);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    return () => {
      if (
        placedTimerRef.current !== null
      ) {
        window.clearTimeout(
          placedTimerRef.current
        );
      }
    };
  }, []);

  function openAddForm(
    kind: OptionKind
  ) {
    if (reorderKind) {
      return;
    }

    setModalKind(kind);
    setEditingOption(null);

    setName("");
    setDescription("");
    setWeightValue("");

    setFormError("");
  }

  function openEditForm(
    kind: OptionKind,
    option:
      | SeverityOption
      | WeightOption
  ) {
    if (reorderKind) {
      return;
    }

    setModalKind(kind);
    setEditingOption(option);

    setName(option.name);

    setDescription(
      option.description ?? ""
    );

    if (
      kind === "weight" &&
      "value" in option
    ) {
      setWeightValue(
        option.value === null
          ? ""
          : String(option.value)
      );
    } else {
      setWeightValue("");
    }

    setFormError("");
  }

  function closeModal() {
    if (isSaving) {
      return;
    }

    setModalKind(null);
    setEditingOption(null);

    setName("");
    setDescription("");
    setWeightValue("");

    setFormError("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!modalKind) {
      return;
    }

    const trimmedName =
      name.trim();

    if (!trimmedName) {
      setFormError(
        "Name is required."
      );

      return;
    }

    let parsedWeightValue:
      | number
      | null = null;

    if (
      modalKind === "weight" &&
      weightValue.trim() !== ""
    ) {
      parsedWeightValue =
        Number(weightValue);

      if (
        !Number.isInteger(
          parsedWeightValue
        ) ||
        parsedWeightValue < 0
      ) {
        setFormError(
          "Weight value must be a whole number of 0 or greater."
        );

        return;
      }
    }

    const endpoint =
      modalKind === "severity"
        ? "/api/severity-options"
        : "/api/weight-options";

    /*
     * sortOrder is intentionally omitted.
     *
     * New records automatically append to
     * the bottom in the backend.
     *
     * Existing records retain their current
     * position until Reorder mode is used.
     */
    const payload =
      modalKind === "severity"
        ? {
            name: trimmedName,

            description:
              description.trim() ||
              null,
          }
        : {
            name: trimmedName,

            value:
              parsedWeightValue,

            description:
              description.trim() ||
              null,
          };

    try {
      setIsSaving(true);
      setFormError("");

      if (editingOption) {
        await apiRequest(
          `${endpoint}/${editingOption.id}`,
          {
            method: "PATCH",

            body: JSON.stringify(
              payload
            ),
          }
        );
      } else {
        await apiRequest(
          endpoint,
          {
            method: "POST",

            body: JSON.stringify(
              payload
            ),
          }
        );
      }

      setModalKind(null);
      setEditingOption(null);

      setName("");
      setDescription("");
      setWeightValue("");

      await loadOptions();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to save option"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(
    kind: OptionKind,
    option:
      | SeverityOption
      | WeightOption
  ) {
    if (reorderKind) {
      return;
    }

    const endpoint =
      kind === "severity"
        ? "/api/severity-options"
        : "/api/weight-options";

    const action =
      option.isActive
        ? "archive"
        : "reactivate";

    try {
      setActionId(option.id);
      setPageError("");

      await apiRequest(
        `${endpoint}/${option.id}/${action}`,
        {
          method: "PATCH",
        }
      );

      await loadOptions();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to update option"
      );
    } finally {
      setActionId(null);
    }
  }

  /*
   * =========================
   * REORDER MODE
   * =========================
   */

  function clearPlacedFeedback() {
    if (
      placedTimerRef.current !== null
    ) {
      window.clearTimeout(
        placedTimerRef.current
      );

      placedTimerRef.current = null;
    }

    setLastMovedId(null);
  }

  function flashPlacedItem(
    optionId: string
  ) {
    if (
      placedTimerRef.current !== null
    ) {
      window.clearTimeout(
        placedTimerRef.current
      );
    }

    setLastMovedId(optionId);

    placedTimerRef.current =
      window.setTimeout(() => {
        setLastMovedId(
          (current) =>
            current === optionId
              ? null
              : current
        );

        placedTimerRef.current = null;
      }, 700);
  }

  function beginReorder(
    kind: OptionKind
  ) {
    if (
      reorderKind ||
      isSavingOrder ||
      modalKind
    ) {
      return;
    }

    setPageError("");

    /*
     * Clone the current arrangement so
     * Cancel can restore it.
     */
    if (kind === "severity") {
      setSeverityBackup(
        severityOptions.map(
          (option) => ({
            ...option,
          })
        )
      );
    } else {
      setWeightBackup(
        weightOptions.map(
          (option) => ({
            ...option,
          })
        )
      );
    }

    clearPlacedFeedback();

    setDraggedId(null);
    setDragOverId(null);

    setReorderKind(kind);
  }

  function cancelReorder() {
    if (
      !reorderKind ||
      isSavingOrder
    ) {
      return;
    }

    if (
      reorderKind === "severity"
    ) {
      setSeverityOptions(
        severityBackup
      );
    } else {
      setWeightOptions(
        weightBackup
      );
    }

    setReorderKind(null);
    setDraggedId(null);
    setDragOverId(null);
    clearPlacedFeedback();

    setSeverityBackup([]);
    setWeightBackup([]);
  }

  function normalizeSeverityOrder(
    options: SeverityOption[]
  ) {
    return options.map(
      (option, index) => ({
        ...option,
        sortOrder: index + 1,
      })
    );
  }

  function normalizeWeightOrder(
    options: WeightOption[]
  ) {
    return options.map(
      (option, index) => ({
        ...option,
        sortOrder: index + 1,
      })
    );
  }

  function moveOption(
    kind: OptionKind,
    sourceId: string,
    targetId: string
  ) {
    if (
      sourceId === targetId
    ) {
      return;
    }

    if (kind === "severity") {
      setSeverityOptions(
        (current) => {
          const sourceIndex =
            current.findIndex(
              (option) =>
                option.id === sourceId
            );

          const targetIndex =
            current.findIndex(
              (option) =>
                option.id === targetId
            );

          if (
            sourceIndex === -1 ||
            targetIndex === -1
          ) {
            return current;
          }

          const next = [
            ...current,
          ];

          const [moved] =
            next.splice(
              sourceIndex,
              1
            );

          next.splice(
            targetIndex,
            0,
            moved
          );

          return normalizeSeverityOrder(
            next
          );
        }
      );

      return;
    }

    setWeightOptions(
      (current) => {
        const sourceIndex =
          current.findIndex(
            (option) =>
              option.id === sourceId
          );

        const targetIndex =
          current.findIndex(
            (option) =>
              option.id === targetId
          );

        if (
          sourceIndex === -1 ||
          targetIndex === -1
        ) {
          return current;
        }

        const next = [
          ...current,
        ];

        const [moved] =
          next.splice(
            sourceIndex,
            1
          );

        next.splice(
          targetIndex,
          0,
          moved
        );

        return normalizeWeightOrder(
          next
        );
      }
    );
  }

  function handleDragStart(
    event:
      DragEvent<HTMLElement>,
    kind: OptionKind,
    optionId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      event.preventDefault();

      return;
    }

    setDraggedId(optionId);

    event.dataTransfer.effectAllowed =
      "move";

    event.dataTransfer.setData(
      "text/plain",
      optionId
    );
  }

  function handleDragOver(
    event:
      DragEvent<HTMLElement>,
    kind: OptionKind,
    optionId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    event.preventDefault();

    event.dataTransfer.dropEffect =
      "move";

    if (
      dragOverId !== optionId
    ) {
      setDragOverId(optionId);
    }
  }

  function handleDrop(
    event:
      DragEvent<HTMLElement>,
    kind: OptionKind,
    targetId: string
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    event.preventDefault();

    const sourceId =
      draggedId ||
      event.dataTransfer.getData(
        "text/plain"
      );

    if (!sourceId) {
      return;
    }

    const didMove =
      sourceId !== targetId;

    moveOption(
      kind,
      sourceId,
      targetId
    );

    setDraggedId(null);
    setDragOverId(null);

    if (didMove) {
      flashPlacedItem(sourceId);
    }
  }

  function handleDragEnd() {
    setDraggedId(null);
    setDragOverId(null);
  }

  async function saveOrder(
    kind: OptionKind
  ) {
    if (
      reorderKind !== kind ||
      isSavingOrder
    ) {
      return;
    }

    const endpoint =
      kind === "severity"
        ? "/api/severity-options/reorder"
        : "/api/weight-options/reorder";

    const orderedIds =
      kind === "severity"
        ? severityOptions.map(
            (option) => option.id
          )
        : weightOptions.map(
            (option) => option.id
          );

    try {
      setIsSavingOrder(true);
      setPageError("");

      if (
        kind === "severity"
      ) {
        const response =
          await apiRequest<
            OptionListResponse<
              SeverityOption
            >
          >(endpoint, {
            method: "PATCH",

            body: JSON.stringify({
              orderedIds,
            }),
          });

        setSeverityOptions(
          response.data
        );
      } else {
        const response =
          await apiRequest<
            OptionListResponse<
              WeightOption
            >
          >(endpoint, {
            method: "PATCH",

            body: JSON.stringify({
              orderedIds,
            }),
          });

        setWeightOptions(
          response.data
        );
      }

      setReorderKind(null);

      setSeverityBackup([]);
      setWeightBackup([]);

      setDraggedId(null);
      setDragOverId(null);
      clearPlacedFeedback();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to save order"
      );
    } finally {
      setIsSavingOrder(false);
    }
  }

  function renderReorderControls(
    kind: OptionKind
  ) {
    const isThisListReordering =
      reorderKind === kind;

    if (isThisListReordering) {
      return (
        <div className="reorder-controls">
          <button
            type="button"
            className="secondary-button"
            onClick={cancelReorder}
            disabled={isSavingOrder}
          >
            Cancel
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={() =>
              void saveOrder(kind)
            }
            disabled={isSavingOrder}
          >
            {isSavingOrder
              ? "Saving..."
              : "Save Order"}
          </button>
        </div>
      );
    }

    return (
      <button
        type="button"
        className="secondary-button"
        onClick={() =>
          beginReorder(kind)
        }
        disabled={
          reorderKind !== null ||
          isSavingOrder
        }
      >
        Reorder
      </button>
    );
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Configuration
          </p>

          <h2>
            Severity & Weight
          </h2>

          <p className="page-description">
            Configure the severity and
            strike-weight options used by
            rules. These values are stored
            in the database and are not
            hardcoded.
          </p>
        </div>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      <div className="two-column-grid">
        <section className="content-card">
          <div className="card-header configuration-card-header">
            <div>
              <h3>
                Severity Levels
              </h3>

              <p>
                {reorderKind ===
                "severity"
                  ? "Drag severity levels into the order you want, then save."
                  : "Manage severity options available when creating rules."}
              </p>
            </div>

            <div className="configuration-header-actions">
              {renderReorderControls(
                "severity"
              )}

              {reorderKind !==
                "severity" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    openAddForm(
                      "severity"
                    )
                  }
                  disabled={
                    reorderKind !== null
                  }
                >
                  Add Severity
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>
                Loading severity
                options...
              </strong>
            </div>
          ) : severityOptions.length ===
            0 ? (
            <div className="empty-state">
              <strong>
                No severity options
              </strong>

              <span>
                Add your first severity
                level.
              </span>
            </div>
          ) : (
            <div
              className={
                reorderKind ===
                "severity"
                  ? "config-list reorder-list active"
                  : "config-list"
              }
            >
              {severityOptions.map(
                (option, index) => (
                  <div
                    className={[
                      "config-item",

                      reorderKind ===
                      "severity"
                        ? "reorder-item"
                        : "",

                      draggedId ===
                      option.id
                        ? "dragging"
                        : "",

                      dragOverId ===
                        option.id &&
                      draggedId !==
                        option.id
                        ? "drag-over"
                        : "",

                      lastMovedId ===
                      option.id
                        ? "just-dropped"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={option.id}
                    onDragOver={(
                      event
                    ) =>
                      handleDragOver(
                        event,
                        "severity",
                        option.id
                      )
                    }
                    onDrop={(event) =>
                      handleDrop(
                        event,
                        "severity",
                        option.id
                      )
                    }
                  >
                    <div className="config-item-main">
                      <div className="config-item-header">
                        <strong>
                          {option.name}
                        </strong>

                        <span
                          className={
                            option.isActive
                              ? "status-badge active"
                              : "status-badge inactive"
                          }
                        >
                          {option.isActive
                            ? "Active"
                            : "Archived"}
                        </span>
                      </div>

                      <p className="config-description">
                        {option.description ||
                          "No description provided."}
                      </p>

                      {reorderKind !==
                        "severity" && (
                        <span className="config-meta">
                          Position:{" "}
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {reorderKind ===
                      "severity" && (
                      <div
                        className="drag-handle"
                        draggable={
                          !isSavingOrder
                        }
                        onDragStart={(
                          event
                        ) =>
                          handleDragStart(
                            event,
                            "severity",
                            option.id
                          )
                        }
                        onDragEnd={
                          handleDragEnd
                        }
                        title="Drag to reorder"
                        aria-label={`Drag ${option.name} to reorder`}
                      >
                        <span className="reorder-position">
                          {index + 1}
                        </span>

                        <span
                          aria-hidden="true"
                          className="drag-grip"
                        >
                          ⋮⋮
                        </span>
                      </div>
                    )}

                    {reorderKind !==
                      "severity" && (
                      <div className="config-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openEditForm(
                              "severity",
                              option
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            option.isActive
                              ? "text-button danger"
                              : "text-button success"
                          }
                          disabled={
                            actionId ===
                            option.id
                          }
                          onClick={() =>
                            void changeStatus(
                              "severity",
                              option
                            )
                          }
                        >
                          {actionId ===
                          option.id
                            ? "Updating..."
                            : option.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="card-header configuration-card-header">
            <div>
              <h3>
                Strike Weights
              </h3>

              <p>
                {reorderKind ===
                "weight"
                  ? "Drag strike weights into the order you want, then save."
                  : "Manage configurable weight labels and values."}
              </p>
            </div>

            <div className="configuration-header-actions">
              {renderReorderControls(
                "weight"
              )}

              {reorderKind !==
                "weight" && (
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() =>
                    openAddForm(
                      "weight"
                    )
                  }
                  disabled={
                    reorderKind !== null
                  }
                >
                  Add Weight
                </button>
              )}
            </div>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>
                Loading weight
                options...
              </strong>
            </div>
          ) : weightOptions.length ===
            0 ? (
            <div className="empty-state">
              <strong>
                No weight options
              </strong>

              <span>
                Add your first strike
                weight.
              </span>
            </div>
          ) : (
            <div
              className={
                reorderKind ===
                "weight"
                  ? "config-list reorder-list active"
                  : "config-list"
              }
            >
              {weightOptions.map(
                (option, index) => (
                  <div
                    className={[
                      "config-item",

                      reorderKind ===
                      "weight"
                        ? "reorder-item"
                        : "",

                      draggedId ===
                      option.id
                        ? "dragging"
                        : "",

                      dragOverId ===
                        option.id &&
                      draggedId !==
                        option.id
                        ? "drag-over"
                        : "",

                      lastMovedId ===
                      option.id
                        ? "just-dropped"
                        : "",
                    ]
                      .filter(Boolean)
                      .join(" ")}
                    key={option.id}
                    onDragOver={(
                      event
                    ) =>
                      handleDragOver(
                        event,
                        "weight",
                        option.id
                      )
                    }
                    onDrop={(event) =>
                      handleDrop(
                        event,
                        "weight",
                        option.id
                      )
                    }
                  >
                    <div className="config-item-main">
                      <div className="config-item-header">
                        <div className="config-title-row">
                          <strong>
                            {option.name}
                          </strong>

                          {option.value !==
                            null && (
                            <span className="weight-value">
                              {
                                option.value
                              }
                            </span>
                          )}
                        </div>

                        <span
                          className={
                            option.isActive
                              ? "status-badge active"
                              : "status-badge inactive"
                          }
                        >
                          {option.isActive
                            ? "Active"
                            : "Archived"}
                        </span>
                      </div>

                      <p className="config-description">
                        {option.description ||
                          "No description provided."}
                      </p>

                      {reorderKind !==
                        "weight" && (
                        <span className="config-meta">
                          Position:{" "}
                          {index + 1}
                        </span>
                      )}
                    </div>

                    {reorderKind ===
                      "weight" && (
                      <div
                        className="drag-handle"
                        draggable={
                          !isSavingOrder
                        }
                        onDragStart={(
                          event
                        ) =>
                          handleDragStart(
                            event,
                            "weight",
                            option.id
                          )
                        }
                        onDragEnd={
                          handleDragEnd
                        }
                        title="Drag to reorder"
                        aria-label={`Drag ${option.name} to reorder`}
                      >
                        <span className="reorder-position">
                          {index + 1}
                        </span>

                        <span
                          aria-hidden="true"
                          className="drag-grip"
                        >
                          ⋮⋮
                        </span>
                      </div>
                    )}

                    {reorderKind !==
                      "weight" && (
                      <div className="config-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openEditForm(
                              "weight",
                              option
                            )
                          }
                        >
                          Edit
                        </button>

                        <button
                          type="button"
                          className={
                            option.isActive
                              ? "text-button danger"
                              : "text-button success"
                          }
                          disabled={
                            actionId ===
                            option.id
                          }
                          onClick={() =>
                            void changeStatus(
                              "weight",
                              option
                            )
                          }
                        >
                          {actionId ===
                          option.id
                            ? "Updating..."
                            : option.isActive
                              ? "Archive"
                              : "Reactivate"}
                        </button>
                      </div>
                    )}
                  </div>
                )
              )}
            </div>
          )}
        </section>
      </div>

      {modalKind && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeModal
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
                  {editingOption
                    ? "Edit"
                    : "Add"}{" "}
                  {modalKind ===
                  "severity"
                    ? "Severity"
                    : "Weight"}
                </h3>

                <p>
                  {modalKind ===
                  "severity"
                    ? "Configure a severity level used by rules."
                    : "Configure a strike-weight option used by rules."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeModal
                }
                aria-label="Close"
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
              <div className="form-stack">
                <label className="form-field">
                  <span>
                    Name
                  </span>

                  <input
                    type="text"
                    value={name}
                    onChange={(
                      event
                    ) =>
                      setName(
                        event.target
                          .value
                      )
                    }
                    placeholder={
                      modalKind ===
                      "severity"
                        ? "Example: High"
                        : "Example: Major Strike"
                    }
                    maxLength={
                      100
                    }
                    autoFocus
                  />
                </label>

                {modalKind ===
                  "weight" && (
                  <label className="form-field">
                    <span>
                      Weight Value
                    </span>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={
                        weightValue
                      }
                      onChange={(
                        event
                      ) =>
                        setWeightValue(
                          event
                            .target
                            .value
                        )
                      }
                      placeholder="Example: 2"
                    />

                    <small className="form-helper">
                      Optional until
                      the final strike
                      tally is
                      confirmed.
                    </small>
                  </label>
                )}

                <label className="form-field">
                  <span>
                    Description
                  </span>

                  <textarea
                    value={
                      description
                    }
                    onChange={(
                      event
                    ) =>
                      setDescription(
                        event.target
                          .value
                      )
                    }
                    placeholder="Describe when this option should be used"
                    maxLength={
                      500
                    }
                    rows={4}
                  />
                </label>

                <div className="reorder-form-note">
                  <strong>
                    Position
                  </strong>

                  <span>
                    New items are
                    added to the
                    bottom. Use the
                    Reorder button
                    on the
                    Configuration
                    page to change
                    their position.
                  </span>
                </div>
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
                    closeModal
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
                    : editingOption
                      ? "Save Changes"
                      : modalKind ===
                          "severity"
                        ? "Add Severity"
                        : "Add Weight"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ConfigurationPage;