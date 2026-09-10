import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest } from "../lib/api";

type IncidentStatus = "OPEN" | "RESOLVED" | "VOIDED";

type Chatter = {
  id: string;
  name: string;
  status: "ACTIVE" | "INACTIVE";
};

type RuleVersion = {
  id: string;
  ruleId: string;
  versionNumber: number;
  title: string;
  definition: string;

  severityNameSnapshot: string | null;
  weightNameSnapshot: string | null;
  weightValueSnapshot: number | null;
};

type Rule = {
  id: string;
  isActive: boolean;
  currentVersion: RuleVersion | null;
};

type Incident = {
  id: string;
  chatterId: string;
  ruleVersionId: string;

  ruleTitleSnapshot: string;
  ruleDefinitionSnapshot: string;
  severityNameSnapshot: string | null;
  weightNameSnapshot: string | null;
  weightValueSnapshot: number | null;

  occurredAt: string;
  details: string;
  evidenceUrl: string | null;

  status: IncidentStatus;

  resolutionNotes: string | null;
  resolvedAt: string | null;

  voidReason: string | null;
  voidedAt: string | null;

  chatter: Chatter;

  ruleVersion: {
    id: string;
    ruleId: string;
    versionNumber: number;
  };

  createdAt?: string;
  updatedAt?: string;
};

type IncidentListResponse = {
  data: Incident[];
};

type IncidentDetailResponse = {
  data: Incident;
};

type ChatterListResponse = {
  data: Chatter[];
};

type RuleListResponse = {
  data: Rule[];
};

type IncidentFilter = "ALL" | IncidentStatus;

type ActionType = "resolve" | "void";

function toDateTimeLocalValue(date: Date) {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60_000);

  return localDate.toISOString().slice(0, 16);
}

function IncidentsPage() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);

  const [statusFilter, setStatusFilter] =
    useState<IncidentFilter>("ALL");

  const [chatterFilter, setChatterFilter] = useState("");
  const [ruleFilter, setRuleFilter] = useState("");
  const [search, setSearch] = useState("");

  const [isLoading, setIsLoading] = useState(true);
  const [dependenciesLoading, setDependenciesLoading] =
    useState(true);

  const [pageError, setPageError] = useState("");

  const [showLogModal, setShowLogModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [formError, setFormError] = useState("");

  const [chatterId, setChatterId] = useState("");
  const [ruleId, setRuleId] = useState("");
  const [occurredAt, setOccurredAt] = useState(
    toDateTimeLocalValue(new Date())
  );
  const [details, setDetails] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");

  const [selectedIncident, setSelectedIncident] =
    useState<Incident | null>(null);

  const [detailLoading, setDetailLoading] = useState(false);

  const [actionType, setActionType] =
    useState<ActionType | null>(null);

  const [actionIncident, setActionIncident] =
    useState<Incident | null>(null);

  const [actionNotes, setActionNotes] = useState("");
  const [actionError, setActionError] = useState("");
  const [actionSaving, setActionSaving] = useState(false);

  const loadDependencies = useCallback(async () => {
    try {
      setDependenciesLoading(true);
      setPageError("");

      const [chatterResponse, ruleResponse] =
        await Promise.all([
          apiRequest<ChatterListResponse>(
            "/api/chatters?status=ACTIVE"
          ),
          apiRequest<RuleListResponse>(
            "/api/rules?active=true"
          ),
        ]);

      setChatters(chatterResponse.data);

      setRules(
        ruleResponse.data.filter(
          (rule) => rule.currentVersion !== null
        )
      );
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load incident form data"
      );
    } finally {
      setDependenciesLoading(false);
    }
  }, []);

  const loadIncidents = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError("");

      const params = new URLSearchParams();

      if (statusFilter !== "ALL") {
        params.set("status", statusFilter);
      }

      if (chatterFilter) {
        params.set("chatterId", chatterFilter);
      }

      if (ruleFilter) {
        params.set("ruleId", ruleFilter);
      }

      const query = params.toString();

      const response =
        await apiRequest<IncidentListResponse>(
          `/api/incidents${query ? `?${query}` : ""}`
        );

      setIncidents(response.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load incidents"
      );
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter, chatterFilter, ruleFilter]);

  useEffect(() => {
    void loadDependencies();
  }, [loadDependencies]);

  useEffect(() => {
    void loadIncidents();
  }, [loadIncidents]);

  const selectedRule = useMemo(
    () => rules.find((rule) => rule.id === ruleId) ?? null,
    [rules, ruleId]
  );

  const visibleIncidents = useMemo(() => {
    const query = search.trim().toLowerCase();

    if (!query) {
      return incidents;
    }

    return incidents.filter((incident) => {
      const searchable = [
        incident.chatter.name,
        incident.ruleTitleSnapshot,
        incident.ruleDefinitionSnapshot,
        incident.details,
        incident.severityNameSnapshot,
        incident.weightNameSnapshot,
        incident.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return searchable.includes(query);
    });
  }, [incidents, search]);

  function resetLogForm() {
    setChatterId("");
    setRuleId("");
    setOccurredAt(toDateTimeLocalValue(new Date()));
    setDetails("");
    setEvidenceUrl("");
    setFormError("");
  }

  function openLogIncident() {
    resetLogForm();
    setShowLogModal(true);
  }

  function closeLogIncident() {
    if (isSaving) {
      return;
    }

    setShowLogModal(false);
    resetLogForm();
  }

  async function handleLogIncident(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!chatterId) {
      setFormError("Please select a chatter.");
      return;
    }

    if (!ruleId) {
      setFormError("Please select a rule.");
      return;
    }

    if (!details.trim()) {
      setFormError("Incident details are required.");
      return;
    }

    let occurredAtIso: string;

    try {
      occurredAtIso = new Date(occurredAt).toISOString();
    } catch {
      setFormError("Please provide a valid incident date and time.");
      return;
    }

    if (
      evidenceUrl.trim() &&
      !/^https?:\/\//i.test(evidenceUrl.trim())
    ) {
      setFormError(
        "Evidence URL must begin with http:// or https://."
      );
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      await apiRequest("/api/incidents", {
        method: "POST",
        body: JSON.stringify({
          chatterId,
          ruleId,
          occurredAt: occurredAtIso,
          details: details.trim(),
          evidenceUrl: evidenceUrl.trim() || null,
        }),
      });

      setShowLogModal(false);
      resetLogForm();

      await loadIncidents();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to log incident"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function openIncidentDetails(incident: Incident) {
    try {
      setDetailLoading(true);
      setPageError("");

      const response =
        await apiRequest<IncidentDetailResponse>(
          `/api/incidents/${incident.id}`
        );

      setSelectedIncident(response.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load incident"
      );
    } finally {
      setDetailLoading(false);
    }
  }

  function openAction(
    type: ActionType,
    incident: Incident
  ) {
    setActionType(type);
    setActionIncident(incident);
    setActionNotes("");
    setActionError("");
  }

  function closeAction() {
    if (actionSaving) {
      return;
    }

    setActionType(null);
    setActionIncident(null);
    setActionNotes("");
    setActionError("");
  }

  async function handleAction(
    event: FormEvent<HTMLFormElement>
  ) {
    event.preventDefault();

    if (!actionIncident || !actionType) {
      return;
    }

    if (
      actionType === "void" &&
      !actionNotes.trim()
    ) {
      setActionError(
        "A reason is required when voiding an incident."
      );
      return;
    }

    try {
      setActionSaving(true);
      setActionError("");

      if (actionType === "resolve") {
        await apiRequest(
          `/api/incidents/${actionIncident.id}/resolve`,
          {
            method: "PATCH",
            body: JSON.stringify({
              resolutionNotes:
                actionNotes.trim() || null,
            }),
          }
        );
      } else {
        await apiRequest(
          `/api/incidents/${actionIncident.id}/void`,
          {
            method: "PATCH",
            body: JSON.stringify({
              reason: actionNotes.trim(),
            }),
          }
        );
      }

      setActionType(null);
      setActionIncident(null);
      setActionNotes("");

      if (
        selectedIncident?.id === actionIncident.id
      ) {
        setSelectedIncident(null);
      }

      await loadIncidents();
    } catch (error) {
      setActionError(
        error instanceof Error
          ? error.message
          : "Failed to update incident"
      );
    } finally {
      setActionSaving(false);
    }
  }

  function getStatusClass(status: IncidentStatus) {
    if (status === "OPEN") {
      return "incident-status open";
    }

    if (status === "RESOLVED") {
      return "incident-status resolved";
    }

    return "incident-status voided";
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">QA Records</p>

          <h2>Incidents</h2>

          <p className="page-description">
            Log, review, resolve, and void chatter incidents while
            preserving the exact rule version that applied.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openLogIncident}
          disabled={
            dependenciesLoading ||
            chatters.length === 0 ||
            rules.length === 0
          }
        >
          Log Incident
        </button>
      </header>

      {pageError && (
        <div className="alert alert-error page-alert">
          {pageError}
        </div>
      )}

      {!dependenciesLoading &&
        (chatters.length === 0 || rules.length === 0) && (
          <div className="dependency-warning">
            <strong>
              Incident logging is not available yet.
            </strong>

            <span>
              {chatters.length === 0 &&
                " Add at least one active chatter."}

              {rules.length === 0 &&
                " Add at least one active rule."}
            </span>
          </div>
        )}

      <section className="content-card">
        <div className="card-header incident-toolbar">
          <div>
            <h3>Incident Records</h3>

            <p>
              Historical rule wording, severity, and weight are
              preserved with every record.
            </p>
          </div>

          <div className="incident-toolbar-controls">
            <input
              className="search-input"
              type="search"
              value={search}
              onChange={(event) =>
                setSearch(event.target.value)
              }
              placeholder="Search incidents..."
            />

            <select
              className="toolbar-select"
              value={chatterFilter}
              onChange={(event) =>
                setChatterFilter(event.target.value)
              }
            >
              <option value="">All Chatters</option>

              {chatters.map((chatter) => (
                <option
                  key={chatter.id}
                  value={chatter.id}
                >
                  {chatter.name}
                </option>
              ))}
            </select>

            <select
              className="toolbar-select"
              value={ruleFilter}
              onChange={(event) =>
                setRuleFilter(event.target.value)
              }
            >
              <option value="">All Rules</option>

              {rules.map((rule) => (
                <option
                  key={rule.id}
                  value={rule.id}
                >
                  {rule.currentVersion?.title ??
                    "Untitled Rule"}
                </option>
              ))}
            </select>

            <div className="filter-group">
              {(
                [
                  ["ALL", "All"],
                  ["OPEN", "Open"],
                  ["RESOLVED", "Resolved"],
                  ["VOIDED", "Voided"],
                ] as const
              ).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={
                    statusFilter === value
                      ? "filter-button active"
                      : "filter-button"
                  }
                  onClick={() =>
                    setStatusFilter(value)
                  }
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        {isLoading ? (
          <div className="empty-state">
            <strong>Loading incidents...</strong>
          </div>
        ) : visibleIncidents.length === 0 ? (
          <div className="empty-state">
            <strong>No matching incidents</strong>

            <span>
              Incident records will appear here after they are
              logged.
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table incidents-table">
              <thead>
                <tr>
                  <th>Chatter</th>
                  <th>Rule</th>
                  <th>Severity</th>
                  <th>Weight</th>
                  <th>Occurred</th>
                  <th>Status</th>
                  <th className="actions-column">
                    Actions
                  </th>
                </tr>
              </thead>

              <tbody>
                {visibleIncidents.map((incident) => (
                  <tr key={incident.id}>
                    <td>
                      <div className="primary-cell">
                        {incident.chatter.name}
                      </div>
                    </td>

                    <td>
                      <div className="incident-rule-cell">
                        <strong>
                          {incident.ruleTitleSnapshot}
                        </strong>

                        <span>
                          v
                          {
                            incident.ruleVersion
                              .versionNumber
                          }
                        </span>
                      </div>
                    </td>

                    <td>
                      {incident.severityNameSnapshot ?? "—"}
                    </td>

                    <td>
                      {incident.weightNameSnapshot ? (
                        <div className="weight-display">
                          <span>
                            {incident.weightNameSnapshot}
                          </span>

                          {incident.weightValueSnapshot !==
                            null && (
                            <span className="weight-value">
                              {
                                incident.weightValueSnapshot
                              }
                            </span>
                          )}
                        </div>
                      ) : (
                        "—"
                      )}
                    </td>

                    <td>
                      {new Date(
                        incident.occurredAt
                      ).toLocaleString()}
                    </td>

                    <td>
                      <span
                        className={getStatusClass(
                          incident.status
                        )}
                      >
                        {incident.status === "OPEN"
                          ? "Open"
                          : incident.status === "RESOLVED"
                            ? "Resolved"
                            : "Voided"}
                      </span>
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            void openIncidentDetails(
                              incident
                            )
                          }
                        >
                          View
                        </button>

                        {incident.status === "OPEN" && (
                          <button
                            type="button"
                            className="text-button success"
                            onClick={() =>
                              openAction(
                                "resolve",
                                incident
                              )
                            }
                          >
                            Resolve
                          </button>
                        )}

                        {incident.status !== "VOIDED" && (
                          <button
                            type="button"
                            className="text-button danger"
                            onClick={() =>
                              openAction(
                                "void",
                                incident
                              )
                            }
                          >
                            Void
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {showLogModal && (
        <div
          className="modal-backdrop"
          onMouseDown={closeLogIncident}
        >
          <div
            className="modal modal-wide"
            onMouseDown={(event) =>
              event.stopPropagation()
            }
          >
            <div className="modal-header">
              <div>
                <h3>Log Incident</h3>

                <p>
                  Select a chatter and rule. Severity, weight, and
                  the exact rule version are captured
                  automatically.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeLogIncident}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleLogIncident}
            >
              <div className="form-stack">
                <div className="form-grid">
                  <label className="form-field">
                    <span>Chatter</span>

                    <select
                      value={chatterId}
                      onChange={(event) =>
                        setChatterId(
                          event.target.value
                        )
                      }
                    >
                      <option value="">
                        Select chatter
                      </option>

                      {chatters.map((chatter) => (
                        <option
                          key={chatter.id}
                          value={chatter.id}
                        >
                          {chatter.name}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="form-field">
                    <span>Rule / Strike Reason</span>

                    <select
                      value={ruleId}
                      onChange={(event) =>
                        setRuleId(event.target.value)
                      }
                    >
                      <option value="">
                        Select rule
                      </option>

                      {rules.map((rule) => (
                        <option
                          key={rule.id}
                          value={rule.id}
                        >
                          {rule.currentVersion?.title ??
                            "Untitled Rule"}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>

                {selectedRule?.currentVersion && (
                  <div className="rule-preview">
                    <div className="rule-preview-header">
                      <div>
                        <span className="preview-label">
                          Selected Rule
                        </span>

                        <strong>
                          {
                            selectedRule.currentVersion
                              .title
                          }
                        </strong>
                      </div>

                      <span className="version-badge">
                        v
                        {
                          selectedRule.currentVersion
                            .versionNumber
                        }
                      </span>
                    </div>

                    <p>
                      {
                        selectedRule.currentVersion
                          .definition
                      }
                    </p>

                    <div className="rule-preview-meta">
                      <span>
                        Severity:{" "}
                        <strong>
                          {selectedRule.currentVersion
                            .severityNameSnapshot ??
                            "None"}
                        </strong>
                      </span>

                      <span>
                        Weight:{" "}
                        <strong>
                          {selectedRule.currentVersion
                            .weightNameSnapshot ??
                            "None"}
                        </strong>

                        {selectedRule.currentVersion
                          .weightValueSnapshot !==
                          null &&
                          ` (${selectedRule.currentVersion.weightValueSnapshot})`}
                      </span>
                    </div>
                  </div>
                )}

                <label className="form-field">
                  <span>Incident Date & Time</span>

                  <input
                    type="datetime-local"
                    value={occurredAt}
                    onChange={(event) =>
                      setOccurredAt(
                        event.target.value
                      )
                    }
                  />
                </label>

                <label className="form-field">
                  <span>Incident Details</span>

                  <textarea
                    value={details}
                    onChange={(event) =>
                      setDetails(event.target.value)
                    }
                    placeholder="Describe what happened..."
                    maxLength={5000}
                    rows={7}
                  />
                </label>

                <label className="form-field">
                  <span>
                    Evidence URL{" "}
                    <em className="optional-label">
                      Optional
                    </em>
                  </span>

                  <input
                    type="url"
                    value={evidenceUrl}
                    onChange={(event) =>
                      setEvidenceUrl(
                        event.target.value
                      )
                    }
                    placeholder="https://..."
                    maxLength={2000}
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
                  className="secondary-button"
                  type="button"
                  onClick={closeLogIncident}
                  disabled={isSaving}
                >
                  Cancel
                </button>

                <button
                  className="primary-button"
                  type="submit"
                  disabled={isSaving}
                >
                  {isSaving
                    ? "Logging..."
                    : "Log Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {(selectedIncident || detailLoading) && (
        <div
          className="modal-backdrop"
          onMouseDown={() =>
            !detailLoading &&
            setSelectedIncident(null)
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
                <h3>Incident Details</h3>

                <p>
                  Historical values shown here are snapshots from
                  the moment this incident was logged.
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={() =>
                  setSelectedIncident(null)
                }
                disabled={detailLoading}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            {detailLoading ? (
              <div className="empty-state">
                <strong>
                  Loading incident...
                </strong>
              </div>
            ) : (
              selectedIncident && (
                <div className="incident-detail">
                  <div className="incident-detail-top">
                    <div>
                      <span className="detail-label">
                        Chatter
                      </span>

                      <strong>
                        {
                          selectedIncident.chatter
                            .name
                        }
                      </strong>
                    </div>

                    <span
                      className={getStatusClass(
                        selectedIncident.status
                      )}
                    >
                      {selectedIncident.status}
                    </span>
                  </div>

                  <div className="detail-section">
                    <span className="detail-label">
                      Rule Snapshot
                    </span>

                    <h4>
                      {
                        selectedIncident.ruleTitleSnapshot
                      }
                    </h4>

                    <p>
                      {
                        selectedIncident.ruleDefinitionSnapshot
                      }
                    </p>

                    <div className="detail-meta-grid">
                      <div>
                        <span>Rule Version</span>
                        <strong>
                          v
                          {
                            selectedIncident
                              .ruleVersion
                              .versionNumber
                          }
                        </strong>
                      </div>

                      <div>
                        <span>Severity</span>
                        <strong>
                          {selectedIncident
                            .severityNameSnapshot ??
                            "None"}
                        </strong>
                      </div>

                      <div>
                        <span>Weight</span>
                        <strong>
                          {selectedIncident
                            .weightNameSnapshot ??
                            "None"}

                          {selectedIncident
                            .weightValueSnapshot !==
                            null &&
                            ` (${selectedIncident.weightValueSnapshot})`}
                        </strong>
                      </div>

                      <div>
                        <span>Occurred</span>
                        <strong>
                          {new Date(
                            selectedIncident.occurredAt
                          ).toLocaleString()}
                        </strong>
                      </div>
                    </div>
                  </div>

                  <div className="detail-section">
                    <span className="detail-label">
                      Incident Details
                    </span>

                    <p className="detail-body">
                      {selectedIncident.details}
                    </p>
                  </div>

                  {selectedIncident.evidenceUrl && (
                    <div className="detail-section">
                      <span className="detail-label">
                        Evidence
                      </span>

                      <a
                        className="evidence-link"
                        href={
                          selectedIncident.evidenceUrl
                        }
                        target="_blank"
                        rel="noreferrer"
                      >
                        Open evidence
                      </a>
                    </div>
                  )}

                  {selectedIncident.status ===
                    "RESOLVED" && (
                    <div className="detail-section lifecycle-section resolved">
                      <span className="detail-label">
                        Resolution
                      </span>

                      <p>
                        {selectedIncident.resolutionNotes ||
                          "No resolution notes provided."}
                      </p>

                      {selectedIncident.resolvedAt && (
                        <small>
                          Resolved{" "}
                          {new Date(
                            selectedIncident.resolvedAt
                          ).toLocaleString()}
                        </small>
                      )}
                    </div>
                  )}

                  {selectedIncident.status ===
                    "VOIDED" && (
                    <div className="detail-section lifecycle-section voided">
                      <span className="detail-label">
                        Void Reason
                      </span>

                      <p>
                        {selectedIncident.voidReason}
                      </p>

                      {selectedIncident.voidedAt && (
                        <small>
                          Voided{" "}
                          {new Date(
                            selectedIncident.voidedAt
                          ).toLocaleString()}
                        </small>
                      )}
                    </div>
                  )}

                  <div className="incident-detail-actions">
                    {selectedIncident.status ===
                      "OPEN" && (
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => {
                          setSelectedIncident(null);
                          openAction(
                            "resolve",
                            selectedIncident
                          );
                        }}
                      >
                        Resolve
                      </button>
                    )}

                    {selectedIncident.status !==
                      "VOIDED" && (
                      <button
                        type="button"
                        className="danger-button"
                        onClick={() => {
                          setSelectedIncident(null);
                          openAction(
                            "void",
                            selectedIncident
                          );
                        }}
                      >
                        Void Incident
                      </button>
                    )}
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}

      {actionType && actionIncident && (
        <div
          className="modal-backdrop"
          onMouseDown={closeAction}
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
                  {actionType === "resolve"
                    ? "Resolve Incident"
                    : "Void Incident"}
                </h3>

                <p>
                  {actionType === "resolve"
                    ? "Mark this incident as resolved and optionally record the outcome."
                    : "Void this incident while preserving it in the historical record."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeAction}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleAction}
            >
              <div className="action-context">
                <span>
                  {actionIncident.chatter.name}
                </span>

                <strong>
                  {actionIncident.ruleTitleSnapshot}
                </strong>
              </div>

              <label className="form-field">
                <span>
                  {actionType === "resolve"
                    ? "Resolution Notes"
                    : "Reason for Voiding"}
                </span>

                <textarea
                  value={actionNotes}
                  onChange={(event) =>
                    setActionNotes(
                      event.target.value
                    )
                  }
                  placeholder={
                    actionType === "resolve"
                      ? "Describe the resolution or action taken..."
                      : "Explain why this incident should be voided..."
                  }
                  maxLength={2000}
                  rows={5}
                  autoFocus
                />

                {actionType === "resolve" && (
                  <small className="form-helper">
                    Resolution notes are optional.
                  </small>
                )}
              </label>

              {actionError && (
                <div className="alert alert-error">
                  {actionError}
                </div>
              )}

              <div className="modal-actions">
                <button
                  type="button"
                  className="secondary-button"
                  onClick={closeAction}
                  disabled={actionSaving}
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  className={
                    actionType === "void"
                      ? "danger-button"
                      : "primary-button"
                  }
                  disabled={actionSaving}
                >
                  {actionSaving
                    ? "Saving..."
                    : actionType === "resolve"
                      ? "Resolve Incident"
                      : "Void Incident"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default IncidentsPage;