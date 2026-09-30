import { useCallback, useEffect, useMemo, useState } from "react";
import type { FormEvent } from "react";

import { useAuth } from "../auth/AuthContext";
import { useToast } from "../components/ToastProvider";
import { apiRequest } from "../lib/api";
import { useNavigationFilter } from "../lib/useNavigationFilter";

import "./RoleBuilderScopePage.css";

type DataScope = "ALL" | "SELF_AND_TEAM" | "SELF";

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

type RoleDraft = {
  name: string;
  dataScope: DataScope;
  permissionIds: string[];
  internalRank: number | null;
};

const DATA_SCOPES: Array<{
  value: DataScope;
  label: string;
  description: string;
}> = [
  {
    value: "ALL",
    label: "All data",
    description: "Access permitted data across the agency, regardless of team placement.",
  },
  {
    value: "SELF_AND_TEAM",
    label: "Self + subordinates",
    description: "Access own data plus employees inside the role holder's visible team subtree.",
  },
  {
    value: "SELF",
    label: "Self only",
    description: "Access only the role holder's own permitted data.",
  },
];

function dataScopeLabel(scope: DataScope) {
  return DATA_SCOPES.find((item) => item.value === scope)?.label ?? scope;
}

function sortRoles(roles: ManagedRole[]) {
  return [...roles].sort((left, right) => {
    if (left.isSystem !== right.isSystem) {
      return left.isSystem ? -1 : 1;
    }

    return left.name.localeCompare(right.name);
  });
}

function roleDraft(role: ManagedRole): RoleDraft {
  return {
    name: role.name,
    dataScope: role.dataScope,
    permissionIds: role.permissions.map((permission) => permission.id),
    internalRank: role.rank,
  };
}

function RoleBuilderScopePage() {
  const toast = useToast();
  const { refreshAuth } = useAuth();
  const [roleType, setRoleType] = useNavigationFilter<"ALL" | "SYSTEM" | "CUSTOM">(
    "type",
    ["ALL", "SYSTEM", "CUSTOM"],
    "ALL"
  );

  const [roles, setRoles] = useState<ManagedRole[]>([]);
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [pageError, setPageError] = useState("");
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [draft, setDraft] = useState<RoleDraft>({
    name: "",
    dataScope: "SELF",
    permissionIds: [],
    internalRank: null,
  });

  const loadBuilder = useCallback(async (preferredRoleId?: string) => {
    try {
      setLoading(true);
      setPageError("");

      const response = await apiRequest<RoleBuilderResponse>("/api/roles");
      const nextRoles = sortRoles(response.roles);
      setRoles(nextRoles);
      setPermissions(response.permissions);

      const nextSelectedId = preferredRoleId && nextRoles.some((role) => role.id === preferredRoleId)
        ? preferredRoleId
        : selectedRoleId && nextRoles.some((role) => role.id === selectedRoleId)
          ? selectedRoleId
          : nextRoles[0]?.id ?? null;

      if (!creating && nextSelectedId) {
        const role = nextRoles.find((item) => item.id === nextSelectedId);
        if (role) {
          setSelectedRoleId(role.id);
          setDraft(roleDraft(role));
        }
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load roles.";
      setPageError(message);
      toast.error(message, "Unable to load Role Builder");
    } finally {
      setLoading(false);
    }
  }, [creating, selectedRoleId, toast]);

  useEffect(() => {
    const loadTimer = window.setTimeout(() => {
      void loadBuilder();
    }, 0);

    return () => {
      window.clearTimeout(loadTimer);
    };
  }, [loadBuilder]);

  const visibleRoles = useMemo(
    () => roles.filter((role) => (
      roleType === "ALL"
      || (roleType === "SYSTEM" ? role.isSystem : !role.isSystem)
    )),
    [roleType, roles]
  );

  const selectedRole = useMemo(
    () => roles.find((role) => role.id === selectedRoleId) ?? null,
    [roles, selectedRoleId]
  );

  const permissionGroups = useMemo(() => {
    const groups = new Map<string, {
      pageKey: string;
      categoryKey: string | null;
      permissions: Permission[];
    }>();

    for (const permission of permissions) {
      const key = `${permission.pageKey}::${permission.categoryKey ?? "general"}`;
      const existing = groups.get(key);

      if (existing) {
        existing.permissions.push(permission);
      } else {
        groups.set(key, {
          pageKey: permission.pageKey,
          categoryKey: permission.categoryKey,
          permissions: [permission],
        });
      }
    }

    return [...groups.values()].sort((left, right) => (
      `${left.pageKey}:${left.categoryKey ?? ""}`.localeCompare(
        `${right.pageKey}:${right.categoryKey ?? ""}`
      )
    ));
  }, [permissions]);

  function selectRole(role: ManagedRole) {
    setCreating(false);
    setSelectedRoleId(role.id);
    setDraft(roleDraft(role));
  }

  function startCreate() {
    const lowestAuthorityRank = roles.reduce((current, role) => (
      role.rank !== null && role.rank > current ? role.rank : current
    ), 1);

    setCreating(true);
    setSelectedRoleId(null);
    setDraft({
      name: "",
      dataScope: "SELF",
      permissionIds: [],
      internalRank: Math.min(lowestAuthorityRank + 1, 999),
    });
  }

  function togglePermission(permission: Permission) {
    setDraft((current) => ({
      ...current,
      permissionIds: current.permissionIds.includes(permission.id)
        ? current.permissionIds.filter((id) => id !== permission.id)
        : [...current.permissionIds, permission.id],
    }));
  }

  async function saveRole(event: FormEvent) {
    event.preventDefault();
    const name = draft.name.trim();

    if (!name) {
      toast.warning("Enter a role name.", "Role name required");
      return;
    }

    if (creating && draft.internalRank === null) {
      toast.error("The internal authority level could not be assigned safely.", "Role not saved");
      return;
    }

    try {
      setSaving(true);

      const response = await apiRequest<RoleMutationResponse>(
        creating ? "/api/roles" : `/api/roles/${selectedRoleId}`,
        {
          method: creating ? "POST" : "PUT",
          body: JSON.stringify({
            name,
            rank: draft.internalRank,
            dataScope: draft.dataScope,
            permissionIds: draft.permissionIds,
          }),
        }
      );

      setCreating(false);
      setSelectedRoleId(response.role.id);

      if (roleType === "SYSTEM" && !response.role.isSystem) {
        setRoleType("CUSTOM");
      }

      await refreshAuth();
      await loadBuilder(response.role.id);

      toast.success(
        creating
          ? "The custom role is ready to assign."
          : "The role was updated for everyone who holds it.",
        creating ? "Role created" : "Role updated"
      );
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to save the role.",
        "Role not saved"
      );
    } finally {
      setSaving(false);
    }
  }

  async function deleteSelectedRole() {
    if (!selectedRole || selectedRole.isSystem || selectedRole.affectedUserCount > 0) return;

    try {
      setSaving(true);
      await apiRequest(`/api/roles/${selectedRole.id}`, { method: "DELETE" });
      setDeleteConfirmOpen(false);
      setSelectedRoleId(null);
      await refreshAuth();
      await loadBuilder();
      toast.success("The unused custom role was deleted.", "Role deleted");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Unable to delete the role.",
        "Role not deleted"
      );
    } finally {
      setSaving(false);
    }
  }

  const canDeleteSelected = Boolean(
    selectedRole
    && !selectedRole.isSystem
    && selectedRole.affectedUserCount === 0
  );

  return (
    <div className="page role-scope-page">
      <header className="page-header role-scope-page-header">
        <div>
          <p className="page-eyebrow">Access control</p>
          <h2>Role Builder</h2>
          <p className="page-description">
            Define what each role can access and which actions it can perform.
          </p>
        </div>

        <button type="button" className="primary-button" onClick={startCreate}>
          Create custom role
        </button>
      </header>

      {pageError && <div className="role-scope-error">{pageError}</div>}

      <section className="role-scope-layout">
        <aside className="content-card role-scope-catalog">
          <div className="role-scope-catalog-header">
            <div>
              <span className="page-eyebrow">Role catalog</span>
              <h3>Roles</h3>
            </div>
            <span className="role-scope-count">{visibleRoles.length}</span>
          </div>

          <div className="role-scope-filter" role="group" aria-label="Role type">
            {(["ALL", "SYSTEM", "CUSTOM"] as const).map((type) => (
              <button
                key={type}
                type="button"
                aria-pressed={roleType === type}
                onClick={() => setRoleType(type)}
              >
                {type === "ALL" ? "All" : type === "SYSTEM" ? "Default" : "Custom"}
              </button>
            ))}
          </div>

          <div className="role-scope-list">
            {loading ? (
              <div className="role-scope-empty">Loading roles…</div>
            ) : visibleRoles.length === 0 ? (
              <div className="role-scope-empty">No matching roles.</div>
            ) : visibleRoles.map((role) => (
              <button
                key={role.id}
                type="button"
                className={`role-scope-list-item${!creating && selectedRoleId === role.id ? " active" : ""}`}
                onClick={() => selectRole(role)}
              >
                <span className="role-scope-list-main">
                  <strong>{role.name}</strong>
                  <small>
                    {dataScopeLabel(role.dataScope)} · {role.permissions.length} permission{role.permissions.length === 1 ? "" : "s"}
                  </small>
                </span>
                <span className="role-scope-list-meta">
                  <span className={`role-scope-type ${role.isSystem ? "default" : "custom"}`}>
                    {role.isSystem ? "Default" : "Custom"}
                  </span>
                  <small>{role.affectedUserCount} user{role.affectedUserCount === 1 ? "" : "s"}</small>
                </span>
              </button>
            ))}
          </div>
        </aside>

        <form className="content-card role-scope-editor" onSubmit={saveRole}>
          <div className="role-scope-editor-header">
            <div>
              <span className="page-eyebrow">
                {creating ? "Custom role" : selectedRole?.isSystem ? "Default role" : "Custom role"}
              </span>
              <h3>{creating ? "Create role" : selectedRole?.name ?? "Select a role"}</h3>
            </div>

            {!creating && selectedRole && (
              <span className="role-scope-users">
                {selectedRole.affectedUserCount} affected
              </span>
            )}
          </div>

          {!creating && !selectedRole ? (
            <div className="role-scope-empty role-scope-editor-empty">Select a role from the catalog.</div>
          ) : (
            <>
              <section className="role-scope-section">
                <div className="role-scope-section-heading">
                  <div>
                    <strong>Role settings</strong>
                    <span>Name the role and choose how far its permitted data access extends.</span>
                  </div>
                </div>

                <label className="form-field role-scope-name-field">
                  <span>Role name</span>
                  <input
                    value={draft.name}
                    onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
                    maxLength={120}
                  />
                </label>

                <fieldset className="role-scope-options">
                  <legend>Data scope</legend>
                  <div className="role-scope-option-grid">
                    {DATA_SCOPES.map((scope) => (
                      <label
                        key={scope.value}
                        className={`role-scope-option${draft.dataScope === scope.value ? " selected" : ""}`}
                      >
                        <input
                          type="radio"
                          name="dataScope"
                          value={scope.value}
                          checked={draft.dataScope === scope.value}
                          onChange={() => setDraft((current) => ({ ...current, dataScope: scope.value }))}
                        />
                        <span>
                          <strong>{scope.label}</strong>
                          <small>{scope.description}</small>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                {!creating && selectedRole && selectedRole.affectedUserCount > 0 && (
                  <div className="role-scope-impact">
                    <strong>
                      This change affects {selectedRole.affectedUserCount} current user{selectedRole.affectedUserCount === 1 ? "" : "s"}.
                    </strong>
                    <span>Saving applies the updated scope and permissions to everyone who currently holds this role.</span>
                  </div>
                )}
              </section>

              <section className="role-scope-section">
                <div className="role-scope-section-heading">
                  <div>
                    <strong>Permissions</strong>
                    <span>Choose the actions this role can perform. Permissions stack when a person holds multiple roles.</span>
                  </div>
                  <span className="role-scope-count">{draft.permissionIds.length} selected</span>
                </div>

                <div className="role-scope-permission-groups">
                  {permissionGroups.map((group) => (
                    <section
                      key={`${group.pageKey}::${group.categoryKey ?? "general"}`}
                      className="role-scope-permission-group"
                    >
                      <div className="role-scope-permission-heading">
                        <strong>{group.pageKey}</strong>
                        <span>{group.categoryKey ?? "general"}</span>
                      </div>

                      <div className="role-scope-permission-list">
                        {group.permissions.map((permission) => {
                          const checked = draft.permissionIds.includes(permission.id);

                          return (
                            <label key={permission.id} className="role-scope-permission-item">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={() => togglePermission(permission)}
                              />
                              <span>
                                <strong>{permission.name}</strong>
                                <small>{permission.description ?? permission.key}</small>
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    </section>
                  ))}
                </div>
              </section>

              <footer className="role-scope-footer">
                <p>
                  {!creating && selectedRole?.isSystem
                    ? "Default roles can be edited but not deleted."
                    : !creating && selectedRole && selectedRole.affectedUserCount > 0
                      ? "Remove this role from all users before deleting it."
                      : "Custom roles can be deleted when nobody holds them."}
                </p>

                <div className="role-scope-actions">
                  {!creating && selectedRole && !selectedRole.isSystem && (
                    <button
                      type="button"
                      className="danger-button"
                      disabled={!canDeleteSelected || saving}
                      onClick={() => setDeleteConfirmOpen(true)}
                    >
                      Delete role
                    </button>
                  )}

                  {creating && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={saving}
                      onClick={() => {
                        setCreating(false);
                        if (visibleRoles[0]) selectRole(visibleRoles[0]);
                      }}
                    >
                      Cancel
                    </button>
                  )}

                  <button type="submit" className="primary-button" disabled={saving || !draft.name.trim()}>
                    {saving ? "Saving…" : creating ? "Create role" : "Save changes"}
                  </button>
                </div>
              </footer>
            </>
          )}
        </form>
      </section>

      {deleteConfirmOpen && selectedRole && (
        <div className="role-scope-overlay">
          <section className="role-scope-delete-modal" role="dialog" aria-modal="true" aria-label="Delete custom role">
            <div className="role-scope-delete-header">
              <span className="page-eyebrow">Confirmation</span>
              <h3>Delete custom role?</h3>
            </div>
            <div className="role-scope-delete-body">
              <p>
                Delete <strong>{selectedRole.name}</strong>? This is only allowed because nobody currently holds the role.
              </p>
              <div className="role-scope-delete-warning">
                The role and its permission mapping will be removed. Existing audit history remains preserved.
              </div>
            </div>
            <div className="role-scope-delete-footer">
              <button type="button" className="secondary-button" disabled={saving} onClick={() => setDeleteConfirmOpen(false)}>
                Cancel
              </button>
              <button type="button" className="danger-button" disabled={saving} onClick={() => { void deleteSelectedRole(); }}>
                {saving ? "Deleting…" : "Delete role"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default RoleBuilderScopePage;