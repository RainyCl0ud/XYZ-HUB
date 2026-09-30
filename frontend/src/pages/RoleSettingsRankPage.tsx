import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";

import {
  useAuth,
} from "../auth/AuthContext";
import {
  useToast,
} from "../components/ToastProvider";
import {
  apiRequest,
} from "../lib/api";

import "./RoleSettingsPage.css";
import "./RoleSettingsRankPage.css";

type DataScope =
  | "ALL"
  | "SELF_AND_TEAM"
  | "SELF";

type Permission = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  pageKey: string;
  categoryKey: string | null;
  actionKey: string;
};

type ManagedRole = {
  id: string;
  systemKey: string | null;
  name: string;
  rank: number | null;
  dataScope: DataScope;
  landingPath: string | null;
  isSystem: boolean;
  affectedUserCount: number;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
};

type RoleBuilderResponse = {
  roles: ManagedRole[];
  permissions: Permission[];
  dataScopes: DataScope[];
};

type RoleMutationResponse = {
  role: ManagedRole;
};

type RoleTypeFilter =
  | "ALL"
  | "DEFAULT"
  | "CUSTOM";

type EditorMode =
  | "CREATE"
  | "EDIT"
  | null;

type RoleDraft = {
  name: string;
  rank: string;
  dataScope: DataScope;
  permissionIds: string[];
};

const PAGE_SIZE = 7;

const SCOPE_OPTIONS: Array<{
  value: DataScope;
  label: string;
  description: string;
}> = [
  {
    value: "ALL",
    label: "All data",
    description:
      "Agency-wide access to permitted data.",
  },
  {
    value: "SELF_AND_TEAM",
    label: "Self + subordinates",
    description:
      "Own data plus employees inside the visible team subtree.",
  },
  {
    value: "SELF",
    label: "Self only",
    description:
      "Only the role holder's own permitted data.",
  },
];

function scopeLabel(
  value: DataScope
) {
  return SCOPE_OPTIONS.find(
    (option) =>
      option.value === value
  )?.label ?? value;
}

function scopeDescription(
  value: DataScope
) {
  return SCOPE_OPTIONS.find(
    (option) =>
      option.value === value
  )?.description ?? value;
}

function sortRoles(
  roles: ManagedRole[]
) {
  return [...roles].sort(
    (left, right) => {
      if (
        left.rank !== null &&
        right.rank !== null &&
        left.rank !== right.rank
      ) {
        return left.rank - right.rank;
      }

      if (
        left.rank !== null &&
        right.rank === null
      ) {
        return -1;
      }

      if (
        left.rank === null &&
        right.rank !== null
      ) {
        return 1;
      }

      return left.name.localeCompare(
        right.name
      );
    }
  );
}

function nextSafeRank(
  roles: ManagedRole[]
) {
  const highestNumeric =
    roles.reduce(
      (current, role) =>
        role.rank !== null &&
        role.rank > current
          ? role.rank
          : current,
      1
    );

  return String(
    Math.min(
      highestNumeric + 1,
      999
    )
  );
}

function RoleSettingsRankPage() {
  const toast =
    useToast();
  const {
    refreshAuth,
  } = useAuth();

  const [roles, setRoles] =
    useState<ManagedRole[]>([]);
  const [permissions, setPermissions] =
    useState<Permission[]>([]);
  const [loading, setLoading] =
    useState(true);
  const [saving, setSaving] =
    useState(false);
  const [pageError, setPageError] =
    useState("");

  const [roleQuery, setRoleQuery] =
    useState("");
  const [typeFilter, setTypeFilter] =
    useState<RoleTypeFilter>("ALL");
  const [appliedQuery, setAppliedQuery] =
    useState("");
  const [appliedType, setAppliedType] =
    useState<RoleTypeFilter>("ALL");
  const [page, setPage] =
    useState(1);

  const [editorMode, setEditorMode] =
    useState<EditorMode>(null);
  const [editorRoleId, setEditorRoleId] =
    useState<string | null>(null);
  const [draft, setDraft] =
    useState<RoleDraft>({
      name: "",
      rank: "",
      dataScope: "SELF",
      permissionIds: [],
    });

  const [permissionRoleId, setPermissionRoleId] =
    useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] =
    useState<string[]>([]);
  const [deleteRoleId, setDeleteRoleId] =
    useState<string | null>(null);

  const loadRoles =
    useCallback(
      async () => {
        try {
          setLoading(true);
          setPageError("");

          const response =
            await apiRequest<RoleBuilderResponse>(
              "/api/roles"
            );

          setRoles(
            sortRoles(
              response.roles
            )
          );
          setPermissions(
            response.permissions
          );
        } catch (error) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load roles.";

          setPageError(message);
          toast.error(
            message,
            "Unable to load Role Settings"
          );
        } finally {
          setLoading(false);
        }
      },
      [toast]
    );

  useEffect(
    () => {
      const timer =
        window.setTimeout(
          () => {
            void loadRoles();
          },
          0
        );

      return () =>
        window.clearTimeout(
          timer
        );
    },
    [loadRoles]
  );

  const filteredRoles =
    useMemo(
      () => {
        const query =
          appliedQuery
            .trim()
            .toLowerCase();

        return roles.filter(
          (role) => {
            const matchesQuery =
              !query ||
              role.name
                .toLowerCase()
                .includes(query);
            const matchesType =
              appliedType === "ALL" ||
              (appliedType === "DEFAULT"
                ? role.isSystem
                : !role.isSystem);

            return matchesQuery &&
              matchesType;
          }
        );
      },
      [
        appliedQuery,
        appliedType,
        roles,
      ]
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredRoles.length /
        PAGE_SIZE
      )
    );
  const safePage =
    Math.min(
      page,
      totalPages
    );
  const visibleRoles =
    filteredRoles.slice(
      (safePage - 1) * PAGE_SIZE,
      safePage * PAGE_SIZE
    );

  const editorRole =
    roles.find(
      (role) =>
        role.id === editorRoleId
    ) ?? null;
  const permissionRole =
    roles.find(
      (role) =>
        role.id === permissionRoleId
    ) ?? null;
  const deleteRole =
    roles.find(
      (role) =>
        role.id === deleteRoleId
    ) ?? null;

  const permissionGroups =
    useMemo(
      () => {
        const groups =
          new Map<
            string,
            Permission[]
          >();

        for (
          const permission
          of permissions
        ) {
          const label =
            permission.categoryKey
              ? `${permission.pageKey} · ${permission.categoryKey}`
              : permission.pageKey;

          const group =
            groups.get(label) ?? [];
          group.push(permission);
          groups.set(label, group);
        }

        return [...groups.entries()].sort(
          ([left], [right]) =>
            left.localeCompare(right)
        );
      },
      [permissions]
    );

  function applyFilters(
    event: FormEvent
  ) {
    event.preventDefault();
    setAppliedQuery(roleQuery);
    setAppliedType(typeFilter);
    setPage(1);
  }

  function resetFilters() {
    setRoleQuery("");
    setTypeFilter("ALL");
    setAppliedQuery("");
    setAppliedType("ALL");
    setPage(1);
  }

  function openCreate() {
    setEditorMode("CREATE");
    setEditorRoleId(null);
    setDraft({
      name: "",
      rank:
        nextSafeRank(roles),
      dataScope: "SELF",
      permissionIds: [],
    });
  }

  function openEdit(
    role: ManagedRole
  ) {
    setEditorMode("EDIT");
    setEditorRoleId(role.id);
    setDraft({
      name: role.name,
      rank:
        role.rank === null
          ? ""
          : String(role.rank),
      dataScope:
        role.dataScope,
      permissionIds:
        role.permissions.map(
          (permission) =>
            permission.id
        ),
    });
  }

  function openPermissions(
    role: ManagedRole
  ) {
    setPermissionRoleId(role.id);
    setPermissionDraft(
      role.permissions.map(
        (permission) =>
          permission.id
      )
    );
  }

  function closeEditor() {
    if (!saving) {
      setEditorMode(null);
      setEditorRoleId(null);
    }
  }

  function closePermissions() {
    if (!saving) {
      setPermissionRoleId(null);
      setPermissionDraft([]);
    }
  }

  function parseRank() {
    const normalized =
      draft.rank.trim();

    if (!normalized) {
      return null;
    }

    const rank =
      Number(normalized);

    return Number.isInteger(rank)
      ? rank
      : Number.NaN;
  }

  async function saveRole(
    event: FormEvent
  ) {
    event.preventDefault();

    const name =
      draft.name.trim();
    const rank =
      parseRank();

    if (!name) {
      toast.warning(
        "Enter a role name.",
        "Role name required"
      );
      return;
    }

    if (
      Number.isNaN(rank) ||
      (rank !== null &&
        (rank < 2 || rank > 999))
    ) {
      toast.warning(
        "Authority rank must be a whole number from 2 to 999.",
        "Invalid authority rank"
      );
      return;
    }

    if (
      editorMode === "CREATE" &&
      rank === null
    ) {
      toast.warning(
        "Custom roles require an authority rank.",
        "Authority rank required"
      );
      return;
    }

    try {
      setSaving(true);

      const response =
        await apiRequest<RoleMutationResponse>(
          editorMode === "CREATE"
            ? "/api/roles"
            : `/api/roles/${editorRoleId}`,
          {
            method:
              editorMode === "CREATE"
                ? "POST"
                : "PUT",
            body:
              JSON.stringify({
                name,
                rank,
                dataScope:
                  draft.dataScope,
                permissionIds:
                  draft.permissionIds,
              }),
          }
        );

      const creating =
        editorMode === "CREATE";
      setEditorMode(null);
      setEditorRoleId(null);
      await refreshAuth();
      await loadRoles();

      toast.success(
        creating
          ? "The custom role is ready to configure."
          : "Role details were updated.",
        creating
          ? "Role created"
          : "Role updated"
      );

      if (creating) {
        setPermissionRoleId(
          response.role.id
        );
        setPermissionDraft(
          response.role.permissions.map(
            (permission) =>
              permission.id
          )
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save the role.",
        "Role not saved"
      );
    } finally {
      setSaving(false);
    }
  }

  async function savePermissions() {
    if (!permissionRole) {
      return;
    }

    try {
      setSaving(true);
      await apiRequest<RoleMutationResponse>(
        `/api/roles/${permissionRole.id}`,
        {
          method: "PUT",
          body:
            JSON.stringify({
              name:
                permissionRole.name,
              rank:
                permissionRole.rank,
              dataScope:
                permissionRole.dataScope,
              permissionIds:
                permissionDraft,
            }),
        }
      );

      setPermissionRoleId(null);
      setPermissionDraft([]);
      await refreshAuth();
      await loadRoles();
      toast.success(
        "Permission changes were applied to this role.",
        "Permissions updated"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save permissions.",
        "Permissions not saved"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedRole() {
    if (
      !deleteRole ||
      deleteRole.isSystem ||
      deleteRole.affectedUserCount > 0
    ) {
      return;
    }

    try {
      setSaving(true);
      await apiRequest(
        `/api/roles/${deleteRole.id}`,
        {
          method: "DELETE",
        }
      );
      setDeleteRoleId(null);
      await refreshAuth();
      await loadRoles();
      toast.success(
        "The unused custom role was deleted.",
        "Role deleted"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete the role.",
        "Role not deleted"
      );
    } finally {
      setSaving(false);
    }
  }

  const rangeStart =
    filteredRoles.length === 0
      ? 0
      : (safePage - 1) * PAGE_SIZE + 1;
  const rangeEnd =
    Math.min(
      safePage * PAGE_SIZE,
      filteredRoles.length
    );

  return (
    <div className="page role-settings-page role-settings-rank-page">
      <header className="role-settings-header">
        <div>
          <p className="page-eyebrow">
            Access control
          </p>
          <h2>
            Role Settings
          </h2>
          <p className="page-description">
            Authority rank controls who a role can manage. Data scope controls what it can see, and permissions control what it can do.
          </p>
        </div>
        <button
          type="button"
          className="primary-button"
          onClick={openCreate}
        >
          Add role
        </button>
      </header>

      {pageError && (
        <div className="role-settings-error">
          {pageError}
        </div>
      )}

      <section className="content-card role-settings-card">
        <form
          className="role-settings-filters"
          onSubmit={applyFilters}
        >
          <label className="role-settings-filter-field role-settings-role-search">
            <span>By role</span>
            <input
              type="search"
              value={roleQuery}
              placeholder="Role name"
              onChange={(event) =>
                setRoleQuery(
                  event.target.value
                )
              }
            />
          </label>

          <label className="role-settings-filter-field">
            <span>By type</span>
            <select
              value={typeFilter}
              onChange={(event) =>
                setTypeFilter(
                  event.target.value as RoleTypeFilter
                )
              }
            >
              <option value="ALL">All types</option>
              <option value="DEFAULT">Default</option>
              <option value="CUSTOM">Custom</option>
            </select>
          </label>

          <div className="role-settings-filter-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={resetFilters}
            >
              Reset
            </button>
            <button
              type="submit"
              className="primary-button"
            >
              Search
            </button>
          </div>
        </form>

        <div className="role-settings-table-wrap">
          <table className="role-settings-table role-settings-rank-table">
            <thead>
              <tr>
                <th>Role</th>
                <th>Description</th>
                <th>Users</th>
                <th>Rank</th>
                <th>Type</th>
                <th className="role-settings-operations-heading">Operations</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="role-settings-empty" colSpan={6}>
                    Loading roles…
                  </td>
                </tr>
              ) : visibleRoles.length === 0 ? (
                <tr>
                  <td className="role-settings-empty" colSpan={6}>
                    No matching roles.
                  </td>
                </tr>
              ) : visibleRoles.map(
                (role) => (
                  <tr key={role.id}>
                    <td>
                      <div className="role-settings-role-cell">
                        <strong>{role.name}</strong>
                        <small>{scopeLabel(role.dataScope)}</small>
                      </div>
                    </td>
                    <td>
                      <span className="role-settings-description">
                        {scopeDescription(role.dataScope)}
                      </span>
                    </td>
                    <td>{role.affectedUserCount}</td>
                    <td>
                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>
                        {role.rank === null
                          ? "Unranked"
                          : role.rank}
                      </span>
                    </td>
                    <td>
                      <span className={role.isSystem ? "role-settings-type default" : "role-settings-type custom"}>
                        {role.isSystem ? "Default" : "Custom"}
                      </span>
                    </td>
                    <td>
                      <div className="role-settings-operations">
                        <button
                          type="button"
                          className="role-settings-link-button"
                          onClick={() => openPermissions(role)}
                        >
                          Set permissions
                        </button>
                        <button
                          type="button"
                          className="role-settings-link-button"
                          onClick={() => openEdit(role)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          className="role-settings-link-button danger"
                          disabled={role.isSystem || role.affectedUserCount > 0}
                          title={role.isSystem
                            ? "Default roles cannot be deleted."
                            : role.affectedUserCount > 0
                              ? "Remove this role from all users before deleting it."
                              : "Delete role"}
                          onClick={() => setDeleteRoleId(role.id)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              )}
            </tbody>
          </table>
        </div>

        <footer className="role-settings-pagination">
          <span>{rangeStart}–{rangeEnd} of {filteredRoles.length}</span>
          <div>
            <button
              type="button"
              className="role-settings-page-button"
              disabled={safePage <= 1}
              onClick={() => setPage(Math.max(1, safePage - 1))}
            >
              ‹
            </button>
            <strong>Page {safePage} of {totalPages}</strong>
            <button
              type="button"
              className="role-settings-page-button"
              disabled={safePage >= totalPages}
              onClick={() => setPage(Math.min(totalPages, safePage + 1))}
            >
              ›
            </button>
          </div>
        </footer>
      </section>

      {editorMode && (
        <div className="role-settings-overlay">
          <form
            className="role-settings-modal role-settings-editor-modal"
            onSubmit={saveRole}
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">
                  {editorMode === "CREATE"
                    ? "New role"
                    : editorRole?.isSystem
                      ? "Default role"
                      : "Custom role"}
                </span>
                <h3>
                  {editorMode === "CREATE"
                    ? "Add role"
                    : "Edit role"}
                </h3>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={closeEditor}
                aria-label="Close role editor"
              >
                ×
              </button>
            </div>

            <div className="role-settings-modal-body role-settings-rank-editor">
              <label className="form-field">
                <span>Role name</span>
                <input
                  value={draft.name}
                  maxLength={120}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="form-field role-rank-field">
                <span>Authority rank</span>
                <input
                  type="number"
                  min={2}
                  max={999}
                  step={1}
                  value={draft.rank}
                  placeholder="Unranked"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      rank: event.target.value,
                    }))
                  }
                />
                <small>
                  Lower number = higher authority. Rank controls who this role can manage; it does not replace data scope or permissions.
                </small>
              </label>

              <fieldset className="role-settings-scope-fieldset">
                <legend>Data scope</legend>
                <div className="role-settings-scope-options">
                  {SCOPE_OPTIONS.map(
                    (option) => (
                      <label
                        key={option.value}
                        className={draft.dataScope === option.value
                          ? "role-settings-scope-option selected"
                          : "role-settings-scope-option"}
                      >
                        <input
                          type="radio"
                          name="roleDataScope"
                          checked={draft.dataScope === option.value}
                          onChange={() =>
                            setDraft((current) => ({
                              ...current,
                              dataScope: option.value,
                            }))
                          }
                        />
                        <span>
                          <strong>{option.label}</strong>
                          <small>{option.description}</small>
                        </span>
                      </label>
                    )
                  )}
                </div>
              </fieldset>

              {editorRole && editorRole.affectedUserCount > 0 && (
                <div className="role-settings-impact">
                  Saving changes updates this role for {editorRole.affectedUserCount} current user{editorRole.affectedUserCount === 1 ? "" : "s"}.
                </div>
              )}
            </div>

            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={closeEditor}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={saving || !draft.name.trim()}
              >
                {saving
                  ? "Saving…"
                  : editorMode === "CREATE"
                    ? "Add role"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {permissionRole && (
        <div className="role-settings-overlay">
          <section
            className="role-settings-modal role-settings-permissions-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Set permissions for ${permissionRole.name}`}
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">Permissions</span>
                <h3>{permissionRole.name}</h3>
                <p>
                  {permissionDraft.length} selected · Rank {permissionRole.rank ?? "Unranked"} · {scopeLabel(permissionRole.dataScope)}
                </p>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={closePermissions}
                aria-label="Close permissions"
              >
                ×
              </button>
            </div>

            <div className="role-settings-permission-body">
              {permissionGroups.map(
                ([label, group], index) => {
                  const selectedCount =
                    group.filter(
                      (permission) =>
                        permissionDraft.includes(
                          permission.id
                        )
                    ).length;

                  return (
                    <details
                      key={label}
                      className="role-settings-permission-group"
                      open={index === 0}
                    >
                      <summary>
                        <span>
                          <strong>{label}</strong>
                          <small>{selectedCount} of {group.length} selected</small>
                        </span>
                        <span className="role-settings-permission-count">
                          {selectedCount}/{group.length}
                        </span>
                      </summary>
                      <div className="role-settings-permission-list">
                        {group.map(
                          (permission) => (
                            <label
                              key={permission.id}
                              className="role-settings-permission-option"
                            >
                              <input
                                type="checkbox"
                                checked={permissionDraft.includes(permission.id)}
                                onChange={() =>
                                  setPermissionDraft((current) =>
                                    current.includes(permission.id)
                                      ? current.filter((id) => id !== permission.id)
                                      : [...current, permission.id]
                                  )
                                }
                              />
                              <span>
                                <strong>{permission.name}</strong>
                                <small>{permission.description ?? permission.key}</small>
                              </span>
                            </label>
                          )
                        )}
                      </div>
                    </details>
                  );
                }
              )}
            </div>

            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={closePermissions}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={saving}
                onClick={() => void savePermissions()}
              >
                {saving ? "Saving…" : "Save permissions"}
              </button>
            </div>
          </section>
        </div>
      )}

      {deleteRole && (
        <div className="role-settings-overlay">
          <section
            className="role-settings-modal role-settings-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Delete custom role"
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">Confirmation</span>
                <h3>Delete role?</h3>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={() => setDeleteRoleId(null)}
              >
                ×
              </button>
            </div>
            <div className="role-settings-modal-body">
              <p className="role-settings-delete-copy">
                Delete <strong>{deleteRole.name}</strong>? This unused custom role will be removed from the role catalog.
              </p>
            </div>
            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => setDeleteRoleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={saving}
                onClick={() => void deleteSelectedRole()}
              >
                {saving ? "Deleting…" : "Delete role"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default RoleSettingsRankPage;
