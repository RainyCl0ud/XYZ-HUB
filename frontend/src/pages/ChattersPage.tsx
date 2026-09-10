import { useCallback, useEffect, useState } from "react";
import type { FormEvent } from "react";
import { apiRequest } from "../lib/api";

type ChatterStatus = "ACTIVE" | "INACTIVE";

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

type StatusFilter = "ALL" | ChatterStatus;

function ChattersPage() {
  const [chatters, setChatters] = useState<Chatter[]>([]);
  const [statusFilter, setStatusFilter] =
    useState<StatusFilter>("ALL");

  const [isLoading, setIsLoading] = useState(true);
  const [pageError, setPageError] = useState("");

  const [showForm, setShowForm] = useState(false);
  const [editingChatter, setEditingChatter] =
    useState<Chatter | null>(null);

  const [name, setName] = useState("");
  const [formError, setFormError] = useState("");
  const [isSaving, setIsSaving] = useState(false);

  const [actionId, setActionId] = useState<string | null>(null);

  const loadChatters = useCallback(async () => {
    try {
      setIsLoading(true);
      setPageError("");

      const query =
        statusFilter === "ALL"
          ? ""
          : `?status=${statusFilter}`;

      const response = await apiRequest<ChatterListResponse>(
        `/api/chatters${query}`
      );

      setChatters(response.data);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to load chatters"
      );
    } finally {
      setIsLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void loadChatters();
  }, [loadChatters]);

  function openAddForm() {
    setEditingChatter(null);
    setName("");
    setFormError("");
    setShowForm(true);
  }

  function openEditForm(chatter: Chatter) {
    setEditingChatter(chatter);
    setName(chatter.name);
    setFormError("");
    setShowForm(true);
  }

  function closeForm() {
    if (isSaving) {
      return;
    }

    setShowForm(false);
    setEditingChatter(null);
    setName("");
    setFormError("");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = name.trim();

    if (!trimmedName) {
      setFormError("Chatter name is required.");
      return;
    }

    try {
      setIsSaving(true);
      setFormError("");

      if (editingChatter) {
        await apiRequest<ChatterMutationResponse>(
          `/api/chatters/${editingChatter.id}`,
          {
            method: "PATCH",
            body: JSON.stringify({
              name: trimmedName,
            }),
          }
        );
      } else {
        await apiRequest<ChatterMutationResponse>(
          "/api/chatters",
          {
            method: "POST",
            body: JSON.stringify({
              name: trimmedName,
            }),
          }
        );
      }

      setShowForm(false);
setEditingChatter(null);
setName("");
setFormError("");

await loadChatters();
    } catch (error) {
      setFormError(
        error instanceof Error
          ? error.message
          : "Failed to save chatter"
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function changeStatus(
    chatter: Chatter,
    action: "deactivate" | "reactivate"
  ) {
    try {
      setActionId(chatter.id);
      setPageError("");

      await apiRequest<ChatterMutationResponse>(
        `/api/chatters/${chatter.id}/${action}`,
        {
          method: "PATCH",
        }
      );

      await loadChatters();
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to update chatter status"
      );
    } finally {
      setActionId(null);
    }
  }

  return (
    <div className="page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">Team Management</p>
          <h2>Chatters</h2>
          <p className="page-description">
            Manage the chatters available for incident logging.
          </p>
        </div>

        <button
          className="primary-button"
          type="button"
          onClick={openAddForm}
        >
          Add Chatter
        </button>
      </header>

      <section className="content-card">
        <div className="card-header">
          <div>
            <h3>Chatter Records</h3>
            <p>
              Active chatters will be available when logging new
              incidents.
            </p>
          </div>

          <div className="filter-group">
            <button
              type="button"
              className={
                statusFilter === "ALL"
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() => setStatusFilter("ALL")}
            >
              All
            </button>

            <button
              type="button"
              className={
                statusFilter === "ACTIVE"
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() => setStatusFilter("ACTIVE")}
            >
              Active
            </button>

            <button
              type="button"
              className={
                statusFilter === "INACTIVE"
                  ? "filter-button active"
                  : "filter-button"
              }
              onClick={() => setStatusFilter("INACTIVE")}
            >
              Inactive
            </button>
          </div>
        </div>

        {pageError && (
          <div className="alert alert-error">
            {pageError}
          </div>
        )}

        {isLoading ? (
          <div className="empty-state">
            <strong>Loading chatters...</strong>
          </div>
        ) : chatters.length === 0 ? (
          <div className="empty-state">
            <strong>No chatters found</strong>
            <span>
              Add a chatter or choose a different status filter.
            </span>
          </div>
        ) : (
          <div className="table-wrapper">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Added</th>
                  <th className="actions-column">Actions</th>
                </tr>
              </thead>

              <tbody>
                {chatters.map((chatter) => (
                  <tr key={chatter.id}>
                    <td>
                      <div className="primary-cell">
                        {chatter.name}
                      </div>
                    </td>

                    <td>
                      <span
                        className={
                          chatter.status === "ACTIVE"
                            ? "status-badge active"
                            : "status-badge inactive"
                        }
                      >
                        {chatter.status === "ACTIVE"
                          ? "Active"
                          : "Inactive"}
                      </span>
                    </td>

                    <td>
                      {new Date(
                        chatter.createdAt
                      ).toLocaleDateString()}
                    </td>

                    <td>
                      <div className="table-actions">
                        <button
                          type="button"
                          className="text-button"
                          onClick={() =>
                            openEditForm(chatter)
                          }
                        >
                          Edit
                        </button>

                        {chatter.status === "ACTIVE" ? (
                          <button
                            type="button"
                            className="text-button danger"
                            disabled={
                              actionId === chatter.id
                            }
                            onClick={() =>
                              void changeStatus(
                                chatter,
                                "deactivate"
                              )
                            }
                          >
                            {actionId === chatter.id
                              ? "Updating..."
                              : "Deactivate"}
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-button success"
                            disabled={
                              actionId === chatter.id
                            }
                            onClick={() =>
                              void changeStatus(
                                chatter,
                                "reactivate"
                              )
                            }
                          >
                            {actionId === chatter.id
                              ? "Updating..."
                              : "Reactivate"}
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

      {showForm && (
        <div
          className="modal-backdrop"
          onMouseDown={closeForm}
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
                  {editingChatter
                    ? "Edit Chatter"
                    : "Add Chatter"}
                </h3>

                <p>
                  {editingChatter
                    ? "Update the chatter's display name."
                    : "Create a chatter record for incident tracking."}
                </p>
              </div>

              <button
                type="button"
                className="modal-close"
                onClick={closeForm}
                aria-label="Close"
              >
                ×
              </button>
            </div>

            <form
              className="modal-form"
              onSubmit={handleSubmit}
            >
              <label className="form-field">
                <span>Chatter Name</span>

                <input
                  type="text"
                  value={name}
                  onChange={(event) =>
                    setName(event.target.value)
                  }
                  placeholder="Enter chatter name"
                  autoFocus
                  maxLength={100}
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
                  onClick={closeForm}
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
                    : editingChatter
                      ? "Save Changes"
                      : "Add Chatter"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default ChattersPage;