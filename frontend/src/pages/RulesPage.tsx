import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest } from "../lib/api";

type RuleVersion = {
  id: string;
  ruleId: string;
  versionNumber: number;
  title: string;
  definition: string;

  severityOptionId: string | null;
  weightOptionId: string | null;

  severityNameSnapshot: string | null;
  weightNameSnapshot: string | null;
  weightValueSnapshot: number | null;

  createdAt: string;
};

type Rule = {
  id: string;
  isActive: boolean;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  currentVersion: RuleVersion | null;
};

type RuleDetail = Rule & {
  versions: RuleVersion[];
};

type SeverityOption = {
  id: string;
  name: string;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type WeightOption = {
  id: string;
  name: string;
  value: number | null;
  description: string | null;
  sortOrder: number;
  isActive: boolean;
};

type RuleListResponse = {
  data: Rule[];
};

type RuleDetailResponse = {
  data: RuleDetail;
};

type OptionListResponse<T> = {
  data: T[];
};

type RuleFilter = "ALL" | "ACTIVE" | "ARCHIVED";

function RulesPage() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [severityOptions, setSeverityOptions] =
    useState<SeverityOption[]>([]);
  const [weightOptions, setWeightOptions] =
    useState<WeightOption[]>([]);

  const [filter, setFilter] = useState<RuleFilter>("ALL");
  const [search, setSearch] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [showRuleModal, setShowRuleModal] = useState(false);
  const [editingRule, setEditingRule] = useState<Rule | null>(null);

  const [title, setTitle] = useState("");
  const [definition, setDefinition] = useState("");
  const [severityOptionId, setSeverityOptionId] = useState("");
  const [weightOptionId, setWeightOptionId] = useState("");

  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [historyRule, setHistoryRule] =
    useState<RuleDetail | null>(null);
  const [historyLoading, setHistoryLoading] = useState(false);

  const [actionId, setActionId] = useState<string | null>(null);

  const loadRules = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError("");

      let endpoint = "/api/rules";

      if (filter === "ACTIVE") {
        endpoint += "?active=true";
      }

      if (filter === "ARCHIVED") {
        endpoint += "?active=false";
      }

      const response =
        await apiRequest<RuleListResponse>(endpoint);

      setRules(response.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load rules"
      );
    } finally {
      setIsLoading(false);
    }
  }, [filter]);

  const loadConfiguration = useCallback(async () => {
    try {
      const [severityResponse, weightResponse] =
        await Promise.all([
          apiRequest<OptionListResponse<SeverityOption>>(
            "/api/severity-options?active=true"
          ),
          apiRequest<OptionListResponse<WeightOption>>(
            "/api/weight-options?active=true"
          ),
        ]);

      setSeverityOptions(severityResponse.data);
      setWeightOptions(weightResponse.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load rule configuration"
      );
    }
  }, []);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  const visibleRules = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return rules;
    }

    return rules.filter((rule) => {
      const version = rule.currentVersion;

      return (
        version?.title.toLowerCase().includes(query) ||
        version?.definition.toLowerCase().includes(query) ||
        version?.severityNameSnapshot
          ?.toLowerCase()
          .includes(query) ||
        version?.weightNameSnapshot
          ?.toLowerCase()
          .includes(query)
      );
    });
  }, [rules, search]);

  function resetForm() {
    setEditingRule(null);

    setTitle("");
    setDefinition("");
    setSeverityOptionId("");
    setWeightOptionId("");

    setFormError("");
  }

  function openAddRule() {
    resetForm();
    setShowRuleModal(true);
  }

 async function openEditRule(rule: Rule) {
  if (!rule.currentVersion) {
    return;
  }

  try {
    setPageError("");

    const [severityResponse, weightResponse] =
      await Promise.all([
        apiRequest<OptionListResponse<SeverityOption>>(
          "/api/severity-options"
        ),
        apiRequest<OptionListResponse<WeightOption>>(
          "/api/weight-options"
        ),
      ]);

    setSeverityOptions(severityResponse.data);
    setWeightOptions(weightResponse.data);

    setEditingRule(rule);

    setTitle(rule.currentVersion.title);
    setDefinition(rule.currentVersion.definition);

    setSeverityOptionId(
      rule.currentVersion.severityOptionId ?? ""
    );

    setWeightOptionId(
      rule.currentVersion.weightOptionId ?? ""
    );

    setFormError("");
    setShowRuleModal(true);
  } catch (error) {
    setPageError(
      error instanceof Error
        ? error.message
        : "Failed to prepare rule editor"
    );
  }
}

  function closeRuleModal() {
    if (isSaving) {
      return;
    }

    setShowRuleModal(false);
    resetForm();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedTitle = title.trim();
    const trimmedDefinition = definition.trim();

    if (!trimmedTitle) {
      setFormError("Rule title is required.");
      return;
    }

    if (!trimmedDefinition) {
      setFormError("Rule definition is required.");
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      const payload = {
        title: trimmedTitle,
        definition: trimmedDefinition,
        severityOptionId: severityOptionId || null,
        weightOptionId: weightOptionId || null,
      };

      if (editingRule) {
        await apiRequest(
          `/api/rules/${editingRule.id}`,
          {
            method: "PATCH",
            body: JSON.stringify(payload),
          }
        );
      } else {
        await apiRequest("/api/rules", {
          method: "POST",
          body: JSON.stringify(payload),
        });
      }

      setShowRuleModal(false);
      resetForm();

      await loadRules();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to save rule"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeRuleStatus(rule: Rule) {
    const action = rule.isActive
      ? "archive"
      : "reactivate";

    const confirmed = window.confirm(
      rule.isActive
        ? `Archive "${rule.currentVersion?.title ?? "this rule"}"?`
        : `Reactivate "${rule.currentVersion?.title ?? "this rule"}"?`
    );

    if (!confirmed) {
      return;
    }

    try {
      setActionId(rule.id);
      setPageError("");

      await apiRequest(
        `/api/rules/${rule.id}/${action}`,
        {
          method: "PATCH",
        }
      );

      await loadRules();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to update rule"
      );
    } finally {
      setActionId(null);
    }
  }

  async function openHistory(rule: Rule) {
    try {
      setHistoryLoading(true);
      setPageError("");

      const response =
        await apiRequest<RuleDetailResponse>(
          `/api/rules/${rule.id}`
        );

      setHistoryRule(response.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load rule history"
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Policy Management</p>

          <h2>Rules & Strike Reasons</h2>

          <p className="page-description">
            Manage strike reasons while preserving the exact rule
            version used by historical incidents.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openAddRule}
        >
          Add Rule
        </button>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      <section className="content-card">
        <div className="card-header rules-toolbar">
          <div>
            <h3>Rule Records</h3>
            <p>
              Editing a rule creates a new version instead of
              overwriting its previous wording.
            </p>
          </div>

          <div className="toolbar-controls">
            <input
              className="search-input"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search rules..."
            />

            <div className="filter-group">
              <button
                type="button"
                className={
                  filter === "ALL"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() => setFilter("ALL")}
              >
                All
              </button>

              <button
                type="button"
                className={
                  filter === "ACTIVE"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() => setFilter("ACTIVE")}
              >
                Active
              </button>

              <button
                type="button"
                className={
                  filter === "ARCHIVED"
                    ? "filter-button active"
                    : "filter-button"
                }
                onClick={() => setFilter("ARCHIVED")}
              >
                Archived
              </button>
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>Loading rules...</strong>
          </div>
        ) : visibleRules.length === 0 ? (
          <div className="empty-state">
            <strong>No matching rules</strong>

            <span>
              Add a rule or adjust the current filter.
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table rules-table">
              <thead>
                <tr>
                  <th>Rule</th>
                  <th>Severity</th>
                  <th>Weight</th>
                  <th>Version</th>
                  <th>Status</th>
                  <th className="actions-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleRules.map((rule) => {
                  const version = rule.currentVersion;

                  return (
                    <tr key={rule.id}>
                      <td>
                        <div className="rule-title-cell">
                          <strong>
                            {version?.title ??
                              "Untitled Rule"}
                          </strong>

                          <span>
                            {version?.definition ??
                              "No definition available."}
                          </span>
                        </div>
                      </td>

                      <td>
                        {version?.severityNameSnapshot ??
                          "—"}
                      </td>

                      <td>
                        {version?.weightNameSnapshot ? (
                          <div className="weight-display">
                            <span>
                              {version.weightNameSnapshot}
                            </span>

                            {version.weightValueSnapshot !==
                              null && (
                              <span className="weight-value">
                                {
                                  version.weightValueSnapshot
                                }
                              </span>
                            )}
                          </div>
                        ) : (
                          "—"
                        )}
                      </td>

                      <td>
                        <span className="version-badge">
                          v{version?.versionNumber ?? 0}
                        </span>
                      </td>

                      <td>
                        <span
                          className={
                            rule.isActive
                              ? "status-badge active"
                              : "status-badge inactive"
                          }
                        >
                          {rule.isActive
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
                              void openHistory(rule)
                            }
                          >
                            History
                          </button>

                          {rule.isActive && (
                            <button
                              type="button"
                              className="text-button"
                              onClick={() =>
                                openEditRule(rule)
                              }
                            >
                              Edit
                            </button>
                          )}

                          <button
                            type="button"
                            disabled={
                              actionId === rule.id
                            }
                            className={
                              rule.isActive
                                ? "text-button danger"
                                : "text-button success"
                            }
                            onClick={() =>
                              void changeRuleStatus(rule)
                            }
                          >
                            {actionId === rule.id
                              ? "Updating..."
                              : rule.isActive
                                ? "Archive"
                                : "Reactivate"}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showRuleModal && (
        <div
          className="modal-backdrop"
          onMouseDown={closeRuleModal}
        >
          <div
            className="modal modal-wide"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  {editingRule
                    ? "Create New Rule Version"
                    : "Add Rule"}
                </h3>

                <p>
                  {editingRule
                    ? "Saving these changes will create a new immutable version."
                    : "Create a strike reason and its initial version."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeRuleModal}
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
                  <span>Rule Title</span>

                  <input
                    type="text"
                    value={title}
                    onChange={(event) =>
                      setTitle(event.target.value)
                    }
                    placeholder="Example: Left Hanging"
                    maxLength={150}
                    autoFocus
                  />
                </label>

                <label className="form-field">
                  <span>Definition</span>

                  <textarea
                    value={definition}
                    onChange={(event) =>
                      setDefinition(event.target.value)
                    }
                    placeholder="Describe exactly what constitutes this incident..."
                    maxLength={2000}
                    rows={6}
                  />
                </label>

                <div className="form-grid">
                  <label className="form-field">
                    <span>Severity</span>

                    <select
                      value={severityOptionId}
                      onChange={(event) =>
                        setSeverityOptionId(
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        No severity
                      </option>

                      {severityOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                        >
                          {option.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Strike Weight</span>

                    <select
                      value={weightOptionId}
                      onChange={(event) =>
                        setWeightOptionId(
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        No weight
                      </option>

                      {weightOptions.map((option) => (
                        <option
                          key={option.id}
                          value={option.id}
                        >
                          {option.name}
                          {option.value !== null
                            ? ` (${option.value})`
                            : ""}
                        </option>
                      ))}
                    </select>
                  </label>
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
                  onClick={closeRuleModal}
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
                    : editingRule
                      ? "Create New Version"
                      : "Add Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(historyRule || historyLoading) && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            !historyLoading && setHistoryRule(null)
          }
        >
          <div
            className="modal modal-history"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>Rule Version History</h3>

                <p>
                  Previous versions remain preserved for audit
                  history.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() => setHistoryRule(null)}
                aria-label="Close"
                disabled={historyLoading}
              >
                ×
              </button>
            </div>

            {historyLoading ? (
              <div className="empty-state">
                <strong>Loading history...</strong>
              </div>
            ) : (
              <div className="history-list">
                {historyRule?.versions.map((version) => (
                  <article
                    className="history-item"
                    key={version.id}
                  >
                    <div className="history-item-header">
                      <div>
                        <span className="version-badge">
                          Version {version.versionNumber}
                        </span>

                        <h4>{version.title}</h4>
                      </div>

                      <time>
                        {new Date(
                          version.createdAt
                        ).toLocaleString()}
                      </time>
                    </div>

                    <p className="history-definition">
                      {version.definition}
                    </p>

                    <div className="history-meta">
                      <span>
                        Severity:{" "}
                        <strong>
                          {version.severityNameSnapshot ??
                            "None"}
                        </strong>
                      </span>

                      <span>
                        Weight:{" "}
                        <strong>
                          {version.weightNameSnapshot ??
                            "None"}
                        </strong>

                        {version.weightValueSnapshot !==
                          null &&
                          ` (${version.weightValueSnapshot})`}
                      </span>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default RulesPage;