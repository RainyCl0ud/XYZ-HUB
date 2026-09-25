import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import type {
  FormEvent,
} from "react";

import { apiRequest } from "../lib/api";

import {
  formatCentralDateTime,
} from "../lib/time";

import {
  useToast,
} from "../components/ToastProvider";

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

type MutationResponse = {
  message: string;
  data?: unknown;
};

type RulePayload = {
  title: string;
  definition: string;
  severityOptionId: string | null;
  weightOptionId: string | null;
};

type PendingConfirmation =
  | {
      type: "save";
      mode: "create" | "version";
      payload: RulePayload;
    }
  | {
      type: "status";
      action:
        | "archive"
        | "reactivate";
      rule: Rule;
    };

function RulesPage() {
  const toast = useToast();

  const [
    rules,
    setRules,
  ] = useState<Rule[]>([]);

  const [
    severityOptions,
    setSeverityOptions,
  ] = useState<SeverityOption[]>([]);

  const [
    weightOptions,
    setWeightOptions,
  ] = useState<WeightOption[]>([]);

  const [
    showArchivedRules,
    setShowArchivedRules,
  ] = useState(false);

  const [
    search,
    setSearch,
  ] = useState("");

  const [
    isLoading,
    setIsLoading,
  ] = useState(true);

  const [
    pageError,
    setPageError,
  ] = useState("");

  const [
    showRuleModal,
    setShowRuleModal,
  ] = useState(false);

  const [
    editingRule,
    setEditingRule,
  ] = useState<Rule | null>(null);

  const [
    title,
    setTitle,
  ] = useState("");

  const [
    definition,
    setDefinition,
  ] = useState("");

  const [
    severityOptionId,
    setSeverityOptionId,
  ] = useState("");

  const [
    weightOptionId,
    setWeightOptionId,
  ] = useState("");

  const [
    formError,
    setFormError,
  ] = useState("");

  const [
    isSaving,
    setIsSaving,
  ] = useState(false);

  const [
    historyRule,
    setHistoryRule,
  ] = useState<RuleDetail | null>(
    null
  );

  const [
    historyLoading,
    setHistoryLoading,
  ] = useState(false);

  const [
    actionId,
    setActionId,
  ] = useState<string | null>(
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
   * =========================================================
   * DATA LOADING
   * =========================================================
   */

  const loadRules =
    useCallback(async () => {
      try {
        setIsLoading(true);
        setPageError("");

        /*
         * Load active and archived rules together.
         *
         * Active records are displayed in the
         * main table.
         *
         * Archived records are displayed in the
         * separate Archived Rules modal.
         */
        const response =
          await apiRequest<RuleListResponse>(
            "/api/rules"
          );

        setRules(response.data);
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load rules";

        setPageError(message);

        toast.error(
          message,
          "Unable to load rules"
        );
      } finally {
        setIsLoading(false);
      }
    }, [toast]);

  const loadConfiguration =
    useCallback(async () => {
      try {
        const [
          severityResponse,
          weightResponse,
        ] = await Promise.all([
          apiRequest<
            OptionListResponse<SeverityOption>
          >(
            "/api/severity-options?active=true"
          ),

          apiRequest<
            OptionListResponse<WeightOption>
          >(
            "/api/weight-options?active=true"
          ),
        ]);

        setSeverityOptions(
          severityResponse.data
        );

        setWeightOptions(
          weightResponse.data
        );
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Failed to load rule configuration";

        setPageError(message);

        toast.error(
          message,
          "Unable to load configuration"
        );
      }
    }, [toast]);

  useEffect(() => {
    void loadRules();
  }, [loadRules]);

  useEffect(() => {
    void loadConfiguration();
  }, [loadConfiguration]);

  /*
   * =========================================================
   * ACTIVE / ARCHIVED RULES + SEARCH
   * =========================================================
   */

  const activeRules =
    useMemo(() => {
      return rules.filter(
        (rule) => rule.isActive
      );
    }, [rules]);

  const archivedRules =
    useMemo(() => {
      return rules.filter(
        (rule) => !rule.isActive
      );
    }, [rules]);

  const visibleRules =
    useMemo(() => {
      const query = search
        .trim()
        .toLowerCase();

      if (!query) {
        return activeRules;
      }

      return activeRules.filter(
        (rule) => {
          const version =
            rule.currentVersion;

          return (
            version?.title
              .toLowerCase()
              .includes(query) ||
            version?.definition
              .toLowerCase()
              .includes(query) ||
            version
              ?.severityNameSnapshot
              ?.toLowerCase()
              .includes(query) ||
            version
              ?.weightNameSnapshot
              ?.toLowerCase()
              .includes(query)
          );
        }
      );
    }, [
      activeRules,
      search,
    ]);

  function openArchivedRules() {
    setShowArchivedRules(true);
  }

  function closeArchivedRules() {
    if (actionId !== null) {
      return;
    }

    setShowArchivedRules(false);
  }

  /*
   * =========================================================
   * RULE FORM
   * =========================================================
   */

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

    setPageError("");

    setShowRuleModal(true);
  }

  async function openEditRule(
    rule: Rule
  ) {
    if (!rule.currentVersion) {
      const message =
        "This rule does not have a valid version.";

      setPageError(message);

      toast.error(
        message,
        "Unable to edit rule"
      );

      return;
    }

    try {
      setPageError("");

      /*
       * Load all configuration records here,
       * including archived options.
       *
       * This allows an older/current rule
       * version to preserve references to
       * configuration values that may have
       * since been archived.
       */
      const [
        severityResponse,
        weightResponse,
      ] = await Promise.all([
        apiRequest<
          OptionListResponse<SeverityOption>
        >(
          "/api/severity-options"
        ),

        apiRequest<
          OptionListResponse<WeightOption>
        >(
          "/api/weight-options"
        ),
      ]);

      setSeverityOptions(
        severityResponse.data
      );

      setWeightOptions(
        weightResponse.data
      );

      setEditingRule(rule);

      setTitle(
        rule.currentVersion.title
      );

      setDefinition(
        rule.currentVersion
          .definition
      );

      setSeverityOptionId(
        rule.currentVersion
          .severityOptionId ?? ""
      );

      setWeightOptionId(
        rule.currentVersion
          .weightOptionId ?? ""
      );

      setFormError("");

      setShowRuleModal(true);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to prepare rule editor";

      setPageError(message);

      toast.error(
        message,
        "Unable to edit rule"
      );
    }
  }

  function closeRuleModal() {
    if (isSaving) {
      return;
    }

    setShowRuleModal(false);

    setPendingConfirmation(
      null
    );

    resetForm();
  }

  function showFormError(
    message: string
  ) {
    setFormError(message);

    toast.error(
      message,
      "Check rule details"
    );
  }

  function handleSubmit(
    event:
      FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    const trimmedTitle =
      title.trim();

    const trimmedDefinition =
      definition.trim();

    if (!trimmedTitle) {
      showFormError(
        "Rule title is required."
      );

      return;
    }

    if (!trimmedDefinition) {
      showFormError(
        "Rule definition is required."
      );

      return;
    }

    const payload: RulePayload =
      {
        title: trimmedTitle,

        definition:
          trimmedDefinition,

        severityOptionId:
          severityOptionId ||
          null,

        weightOptionId:
          weightOptionId ||
          null,
      };

    setFormError("");

    setPendingConfirmation({
      type: "save",

      mode: editingRule
        ? "version"
        : "create",

      payload,
    });
  }

  async function saveRule(
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
        MutationResponse;

      if (
        confirmation.mode ===
          "version" &&
        editingRule
      ) {
        response =
          await apiRequest<MutationResponse>(
            `/api/rules/${editingRule.id}`,
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
          await apiRequest<MutationResponse>(
            "/api/rules",
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

      if (
        response.message ===
        "No rule changes were detected"
      ) {
        toast.info(
          response.message,
          "No changes"
        );

        return;
      }

      setShowRuleModal(false);

      resetForm();

      toast.success(
        response.message,

        confirmation.mode ===
        "version"
          ? "Rule version created"
          : "Rule created"
      );

      await loadRules();

      /*
       * Restore the normal active-only
       * configuration list after editing.
       */
      await loadConfiguration();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to save rule";

      setPendingConfirmation(
        null
      );

      setFormError(message);

      toast.error(
        message,
        "Rule not saved"
      );
    } finally {
      setIsSaving(false);
    }
  }

  /*
   * =========================================================
   * ARCHIVE / REACTIVATE
   * =========================================================
   */

  function requestRuleStatusChange(
    rule: Rule
  ) {
    setPendingConfirmation({
      type: "status",

      action: rule.isActive
        ? "archive"
        : "reactivate",

      rule,
    });
  }

  async function changeRuleStatus(
    confirmation: Extract<
      PendingConfirmation,
      {
        type: "status";
      }
    >
  ) {
    const {
      rule,
      action,
    } = confirmation;

    try {
      setActionId(rule.id);

      setPageError("");

      const response =
        await apiRequest<MutationResponse>(
          `/api/rules/${rule.id}/${action}`,
          {
            method: "PATCH",
          }
        );

      setPendingConfirmation(
        null
      );

      toast.success(
        response.message,

        action === "archive"
          ? "Rule archived"
          : "Rule reactivated"
      );

      await loadRules();
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to update rule";

      setPendingConfirmation(
        null
      );

      setPageError(message);

      toast.error(
        message,
        "Rule not updated"
      );
    } finally {
      setActionId(null);
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
      "save"
    ) {
      await saveRule(
        pendingConfirmation
      );

      return;
    }

    await changeRuleStatus(
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
              "Create Rule?",

            message:
              `Create "${pendingConfirmation.payload.title}" as a new rule?`,

            confirmLabel:
              "Create Rule",

            danger: false,
          };
        }

        return {
          title:
            "Create New Rule Version?",

          message:
            `Save these changes as a new immutable version of "${pendingConfirmation.payload.title}"? Previous versions will remain preserved.`,

          confirmLabel:
            "Create New Version",

          danger: false,
        };
      }

      const ruleTitle =
        pendingConfirmation.rule
          .currentVersion?.title ??
        "this rule";

      if (
        pendingConfirmation.action ===
        "archive"
      ) {
        return {
          title:
            "Archive Rule?",

          message:
            `Archive "${ruleTitle}"? It will no longer be available for new incidents, but its history and existing incident records will remain preserved.`,

          confirmLabel:
            "Archive Rule",

          danger: true,
        };
      }

      return {
        title:
          "Reactivate Rule?",

        message:
          `Reactivate "${ruleTitle}"? It will become available for new incidents again.`,

        confirmLabel:
          "Reactivate Rule",

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
            .rule.id
        : false;

  /*
   * =========================================================
   * HISTORY
   * =========================================================
   */

  async function openHistory(
    rule: Rule
  ) {
    try {
      setHistoryLoading(true);

      setPageError("");

      const response =
        await apiRequest<RuleDetailResponse>(
          `/api/rules/${rule.id}`
        );

      setHistoryRule(
        response.data
      );
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Failed to load rule history";

      setPageError(message);

      toast.error(
        message,
        "Unable to load history"
      );
    } finally {
      setHistoryLoading(false);
    }
  }

  function closeHistory() {
    if (historyLoading) {
      return;
    }

    setHistoryRule(null);
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
            Policy Management
          </p>

          <h2>
            Rules & Strike Reasons
          </h2>

          <p className="page-description">
            Manage strike reasons
            while preserving the
            exact rule version used
            by historical incidents.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={
            openAddRule
          }
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
            <h3>
              Rule Records
            </h3>

            <p>
              Editing a rule creates
              a new version instead
              of overwriting its
              previous wording.
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
              placeholder="Search active rules..."
              aria-label="Search active rules"
            />

            <button
              type="button"
              className="secondary-button"
              onClick={
                openArchivedRules
              }
            >
              Archived (
              {archivedRules.length})
            </button>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>
              Loading rules...
            </strong>
          </div>
        ) : visibleRules.length ===
          0 ? (
          <div className="empty-state">
            <strong>
              No matching rules
            </strong>

            <span>
              {search.trim()
                ? "No active rules match your search."
                : "Add a rule to begin building your active rule list."}
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table rules-table">
              <thead>
                <tr>
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
                    Version
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
                {visibleRules.map(
                  (rule) => {
                    const version =
                      rule.currentVersion;

                    return (
                      <tr
                        key={
                          rule.id
                        }
                      >
                        <td>
                          <div className="rule-title-cell">
                            <strong>
                              {version
                                ?.title ??
                                "Untitled Rule"}
                            </strong>

                            <span>
                              {version
                                ?.definition ??
                                "No definition available."}
                            </span>
                          </div>
                        </td>

                        <td>
                          {version
                            ?.severityNameSnapshot ??
                            "—"}
                        </td>

                        <td>
                          {version
                            ?.weightNameSnapshot ? (
                            <div className="weight-display">
                              <span>
                                {
                                  version
                                    .weightNameSnapshot
                                }
                              </span>

                              {version
                                .weightValueSnapshot !==
                                null && (
                                <span className="weight-value">
                                  {
                                    version
                                      .weightValueSnapshot
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
                            v
                            {version
                              ?.versionNumber ??
                              0}
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
                                void openHistory(
                                  rule
                                )
                              }
                              disabled={
                                historyLoading
                              }
                            >
                              History
                            </button>

                            <button
                              type="button"
                              className="text-button"
                              onClick={() =>
                                void openEditRule(
                                  rule
                                )
                              }
                            >
                              Edit
                            </button>

                            <button
                              type="button"
                              disabled={
                                actionId ===
                                rule.id
                              }
                              className="text-button danger"
                              onClick={() =>
                                requestRuleStatusChange(
                                  rule
                                )
                              }
                            >
                              {actionId ===
                              rule.id
                                ? "Archiving..."
                                : "Archive"}
                            </button>
                          </div>
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
          ARCHIVED RULES
          ===================================================== */}

      {showArchivedRules && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeArchivedRules
          }
        >
          <div
            className="modal modal-history"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Archived Rules
                </h3>

                <p>
                  Archived rules are
                  preserved for
                  historical records
                  and can be
                  reactivated at any
                  time.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeArchivedRules
                }
                disabled={
                  actionId !== null
                }
                aria-label="Close archived rules"
              >
                ×
              </button>
            </div>

            {archivedRules.length ===
            0 ? (
              <div className="empty-state">
                <strong>
                  No archived rules
                </strong>

                <span>
                  Rules that are
                  archived will
                  appear here.
                </span>
              </div>
            ) : (
              <div className="history-list">
                {archivedRules.map(
                  (rule) => {
                    const version =
                      rule.currentVersion;

                    return (
                      <article
                        key={
                          rule.id
                        }
                        className="history-item"
                      >
                        <div className="history-item-header">
                          <div>
                            <span className="status-badge inactive">
                              Archived
                            </span>

                            <h4>
                              {version
                                ?.title ??
                                "Untitled Rule"}
                            </h4>
                          </div>

                          {rule.archivedAt && (
                            <time>
                              Archived{" "}
                              {formatCentralDateTime(rule.archivedAt)}
                            </time>
                          )}
                        </div>

                        <p className="history-definition">
                          {version
                            ?.definition ??
                            "No definition available."}
                        </p>

                        <div className="history-meta">
                          <span>
                            Severity:{" "}

                            <strong>
                              {version
                                ?.severityNameSnapshot ??
                                "None"}
                            </strong>
                          </span>

                          <span>
                            Weight:{" "}

                            <strong>
                              {version
                                ?.weightNameSnapshot ??
                                "None"}
                            </strong>

                            {version
                              ?.weightValueSnapshot !==
                              null &&
                            version
                              ?.weightValueSnapshot !==
                              undefined
                              ? ` (${version.weightValueSnapshot})`
                              : ""}
                          </span>

                          <span>
                            Version:{" "}

                            <strong>
                              v
                              {version
                                ?.versionNumber ??
                                0}
                            </strong>
                          </span>
                        </div>

                        <div
                          className="table-actions"
                          style={{
                            marginTop:
                              "14px",
                          }}
                        >
                          <button
                            type="button"
                            className="text-button"
                            onClick={() =>
                              void openHistory(
                                rule
                              )
                            }
                            disabled={
                              historyLoading
                            }
                          >
                            History
                          </button>

                          <button
                            type="button"
                            className="text-button success"
                            disabled={
                              actionId ===
                              rule.id
                            }
                            onClick={() =>
                              requestRuleStatusChange(
                                rule
                              )
                            }
                          >
                            {actionId ===
                            rule.id
                              ? "Reactivating..."
                              : "Reactivate"}
                          </button>
                        </div>
                      </article>
                    );
                  }
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          ADD / EDIT RULE MODAL
          ===================================================== */}

      {showRuleModal && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeRuleModal
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
                onClick={
                  closeRuleModal
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
              <div className="form-stack">
                <label className="form-field">
                  <span>
                    Rule Title
                  </span>

                  <input
                    type="text"
                    value={title}
                    onChange={(
                      event
                    ) => {
                      setTitle(
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
                    placeholder="Example: Left Hanging"
                    maxLength={
                      150
                    }
                    autoFocus
                    disabled={
                      isSaving
                    }
                  />
                </label>

                <label className="form-field">
                  <span>
                    Definition
                  </span>

                  <textarea
                    value={
                      definition
                    }
                    onChange={(
                      event
                    ) => {
                      setDefinition(
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
                    placeholder="Describe exactly what constitutes this incident..."
                    maxLength={
                      2000
                    }
                    rows={6}
                    disabled={
                      isSaving
                    }
                  />
                </label>

                <div className="form-grid">
                  <label className="form-field">
                    <span>
                      Severity
                    </span>

                    <select
                      value={
                        severityOptionId
                      }
                      onChange={(
                        event
                      ) => {
                        setSeverityOptionId(
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
                        No severity
                      </option>

                      {severityOptions.map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option.id
                            }
                            value={
                              option.id
                            }
                            disabled={
                              !option.isActive
                            }
                          >
                            {
                              option.name
                            }

                            {!option.isActive
                              ? " (Archived)"
                              : ""}
                          </option>
                        )
                      )}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>
                      Strike Weight
                    </span>

                    <select
                      value={
                        weightOptionId
                      }
                      onChange={(
                        event
                      ) => {
                        setWeightOptionId(
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
                        No weight
                      </option>

                      {weightOptions.map(
                        (
                          option
                        ) => (
                          <option
                            key={
                              option.id
                            }
                            value={
                              option.id
                            }
                            disabled={
                              !option.isActive
                            }
                          >
                            {
                              option.name
                            }

                            {option.value !==
                            null
                              ? ` (${option.value})`
                              : ""}

                            {!option.isActive
                              ? " — Archived"
                              : ""}
                          </option>
                        )
                      )}
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
                  onClick={
                    closeRuleModal
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
                    : editingRule
                      ? "Create New Version"
                      : "Add Rule"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =====================================================
          RULE HISTORY
          ===================================================== */}

      {(historyRule ||
        historyLoading) && (
        <div
          className="modal-backdrop"
          onMouseDown={
            closeHistory
          }
        >
          <div
            className="modal modal-history"
            onMouseDown={(
              event
            ) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>
                  Rule Version
                  History
                </h3>

                <p>
                  Previous versions
                  remain preserved
                  for audit history.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={
                  closeHistory
                }
                aria-label="Close"
                disabled={
                  historyLoading
                }
              >
                ×
              </button>
            </div>

            {historyLoading ? (
              <div className="empty-state">
                <strong>
                  Loading history...
                </strong>
              </div>
            ) : (
              <div className="history-list">
                {historyRule?.versions.map(
                  (version) => (
                    <article
                      className="history-item"
                      key={
                        version.id
                      }
                    >
                      <div className="history-item-header">
                        <div>
                          <span className="version-badge">
                            Version{" "}
                            {
                              version
                                .versionNumber
                            }
                          </span>

                          <h4>
                            {
                              version.title
                            }
                          </h4>
                        </div>

                        <time>
                          {formatCentralDateTime(version.createdAt)}
                        </time>
                      </div>

                      <p className="history-definition">
                        {
                          version.definition
                        }
                      </p>

                      <div className="history-meta">
                        <span>
                          Severity:{" "}

                          <strong>
                            {version
                              .severityNameSnapshot ??
                              "None"}
                          </strong>
                        </span>

                        <span>
                          Weight:{" "}

                          <strong>
                            {version
                              .weightNameSnapshot ??
                              "None"}
                          </strong>

                          {version
                            .weightValueSnapshot !==
                            null &&
                            ` (${version.weightValueSnapshot})`}
                        </span>
                      </div>
                    </article>
                  )
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =====================================================
          CONFIRMATION MODAL
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
              aria-labelledby="rule-confirmation-title"
            >
              <div className="modal-header">
                <div>
                  <h3 id="rule-confirmation-title">
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
                    : confirmationContent
                        .confirmLabel}
                </button>
              </div>
            </div>
          </div>
        )}
    </div>
  );
}

export default RulesPage;
