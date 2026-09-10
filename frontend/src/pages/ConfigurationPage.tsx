import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
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
  const [severityOptions, setSeverityOptions] = useState<SeverityOption[]>([]);
  const [weightOptions, setWeightOptions] = useState<WeightOption[]>([]);

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [modalKind, setModalKind] = useState<OptionKind | null>(null);
  const [editingOption, setEditingOption] =
    useState<SeverityOption | WeightOption | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [sortOrder, setSortOrder] = useState("0");
  const [weightValue, setWeightValue] = useState("");

  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const loadOptions = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError("");

      const [severityResponse, weightResponse] = await Promise.all([
        apiRequest<OptionListResponse<SeverityOption>>(
          "/api/severity-options"
        ),
        apiRequest<OptionListResponse<WeightOption>>(
          "/api/weight-options"
        ),
      ]);

      setSeverityOptions(severityResponse.data);
      setWeightOptions(weightResponse.data);
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

  function openAddForm(kind: OptionKind) {
    setModalKind(kind);
    setEditingOption(null);

    setName("");
    setDescription("");
    setSortOrder("0");
    setWeightValue("");

    setFormError("");
  }

  function openEditForm(
    kind: OptionKind,
    option: SeverityOption | WeightOption
  ) {
    setModalKind(kind);
    setEditingOption(option);

    setName(option.name);
    setDescription(option.description ?? "");
    setSortOrder(String(option.sortOrder));

    if (kind === "weight" && "value" in option) {
      setWeightValue(
        option.value === null ? "" : String(option.value)
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
    setSortOrder("0");
    setWeightValue("");

    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!modalKind) {
      return;
    }

    const trimmedName = name.trim();
    const parsedSortOrder = Number(sortOrder);

    if (!trimmedName) {
      setFormError("Name is required.");
      return;
    }

    if (
      !Number.isInteger(parsedSortOrder) ||
      parsedSortOrder < 0
    ) {
      setFormError(
        "Sort order must be a whole number of 0 or greater."
      );
      return;
    }

    let parsedWeightValue: number | null = null;

    if (modalKind === "weight" && weightValue.trim() !== "") {
      parsedWeightValue = Number(weightValue);

      if (
        !Number.isInteger(parsedWeightValue) ||
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

    const payload =
      modalKind === "severity"
        ? {
            name: trimmedName,
            description: description.trim() || null,
            sortOrder: parsedSortOrder,
          }
        : {
            name: trimmedName,
            value: parsedWeightValue,
            description: description.trim() || null,
            sortOrder: parsedSortOrder,
          };

    try {
      setIsSaving(true);
      setFormError("");

      if (editingOption) {
        await apiRequest(
          `${endpoint}/${editingOption.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
      } else {
        await apiRequest(endpoint, {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setModalKind(null);
      setEditingOption(null);

      setName("");
      setDescription("");
      setSortOrder("0");
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
    option: SeverityOption | WeightOption
  ) {
    const endpoint =
      kind === "severity"
        ? "/api/severity-options"
        : "/api/weight-options";

    const action = option.isActive
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

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Configuration</p>
          <h2>Severity & Weight</h2>

          <p className="page-description">
            Configure the severity and strike-weight options used
            by rules. These values are stored in the database and
            are not hardcoded.
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
          <div className="card-header">
            <div>
              <h3>Severity Levels</h3>
              <p>
                Manage severity options available when creating
                rules.
              </p>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => openAddForm("severity")}
            >
              Add Severity
            </button>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>Loading severity options...</strong>
            </div>
          ) : severityOptions.length === 0 ? (
            <div className="empty-state">
              <strong>No severity options</strong>
              <span>Add your first severity level.</span>
            </div>
          ) : (
            <div className="config-list">
              {severityOptions.map((option) => (
                <div
                  className="config-item"
                  key={option.id}
                >
                  <div className="config-item-main">
                    <div className="config-item-header">
                      <strong>{option.name}</strong>

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

                    <span className="config-meta">
                      Sort order: {option.sortOrder}
                    </span>
                  </div>

                  <div className="config-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        openEditForm("severity", option)
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
                      disabled={actionId === option.id}
                      onClick={() =>
                        void changeStatus(
                          "severity",
                          option
                        )
                      }
                    >
                      {actionId === option.id
                        ? "Updating..."
                        : option.isActive
                          ? "Archive"
                          : "Reactivate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="content-card">
          <div className="card-header">
            <div>
              <h3>Strike Weights</h3>
              <p>
                Manage configurable weight labels and values.
              </p>
            </div>

            <button
              className="secondary-button"
              type="button"
              onClick={() => openAddForm("weight")}
            >
              Add Weight
            </button>
          </div>

          {isLoading ? (
            <div className="empty-state">
              <strong>Loading weight options...</strong>
            </div>
          ) : weightOptions.length === 0 ? (
            <div className="empty-state">
              <strong>No weight options</strong>
              <span>Add your first strike weight.</span>
            </div>
          ) : (
            <div className="config-list">
              {weightOptions.map((option) => (
                <div
                  className="config-item"
                  key={option.id}
                >
                  <div className="config-item-main">
                    <div className="config-item-header">
                      <div className="config-title-row">
                        <strong>{option.name}</strong>

                        {option.value !== null && (
                          <span className="weight-value">
                            {option.value}
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

                    <span className="config-meta">
                      Sort order: {option.sortOrder}
                    </span>
                  </div>

                  <div className="config-actions">
                    <button
                      type="button"
                      className="text-button"
                      onClick={() =>
                        openEditForm("weight", option)
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
                      disabled={actionId === option.id}
                      onClick={() =>
                        void changeStatus("weight", option)
                      }
                    >
                      {actionId === option.id
                        ? "Updating..."
                        : option.isActive
                          ? "Archive"
                          : "Reactivate"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      {modalKind && (
        <div
          className="modal-backdrop"
          onMouseDown={closeModal}
        >
          <div
            className="modal"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  {editingOption ? "Edit" : "Add"}{" "}
                  {modalKind === "severity"
                    ? "Severity"
                    : "Weight"}
                </h3>

                <p>
                  {modalKind === "severity"
                    ? "Configure a severity level used by rules."
                    : "Configure a strike-weight option used by rules."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeModal}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleSubmit}
            >
              <div className="form-stack">
                <label className="form-field">
                  <span>Name</span>

                  <input
                    type="text"
                    value={name}
                    onChange={(event) =>
                      setName(event.target.value)
                    }
                    placeholder={
                      modalKind === "severity"
                        ? "Example: High"
                        : "Example: Major Strike"
                    }
                    maxLength={100}
                    autoFocus
                  />
                </label>

                {modalKind === "weight" && (
                  <label className="form-field">
                    <span>Weight Value</span>

                    <input
                      type="number"
                      min="0"
                      step="1"
                      value={weightValue}
                      onChange={(event) =>
                        setWeightValue(event.target.value)
                      }
                      placeholder="Example: 2"
                    />

                    <small className="form-helper">
                      Optional until the final strike tally is
                      confirmed.
                    </small>
                  </label>
                )}

                <label className="form-field">
                  <span>Description</span>

                  <textarea
                    value={description}
                    onChange={(event) =>
                      setDescription(event.target.value)
                    }
                    placeholder="Describe when this option should be used"
                    maxLength={500}
                    rows={4}
                  />
                </label>

                <label className="form-field">
                  <span>Sort Order</span>

                  <input
                    type="number"
                    min="0"
                    step="1"
                    value={sortOrder}
                    onChange={(event) =>
                      setSortOrder(event.target.value)
                    }
                  />

                  <small className="form-helper">
                    Lower numbers appear first in dropdowns.
                  </small>
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
                  onClick={closeModal}
                  disabled={isSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className="primary-button"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Saving..."
                    : editingOption
                      ? "Save Changes"
                      : modalKind === "severity"
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