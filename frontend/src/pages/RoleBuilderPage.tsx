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
  useAuth,
} from "../auth/AuthContext";

import {
  useToast,
} from "../components/ToastProvider";

import "./RoleBuilderPage.css";

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
  dataScope:
    "ALL" |
    "SELF_AND_TEAM" |
    "SELF";
  landingPath: string | null;
  isSystem: boolean;
  affectedUserCount: number;
  permissions: Permission[];
  createdAt: string;
  updatedAt: string;
};

type RoleBuilderResponse = {
  roles:
    ManagedRole[];

  permissions:
    Permission[];

  dataScopes:
    (
      "ALL" |
      "SELF_AND_TEAM" |
      "SELF"
    )[];
};

type RoleMutationResponse = {
  role:
    ManagedRole;
};

type RoleDraft = {
  name: string;
  rank: string;
  dataScope:
    "ALL" |
    "SELF_AND_TEAM" |
    "SELF";
  permissionIds:
    string[];
};

const DATA_SCOPE_LABELS = {
  ALL:
    "All data",
  SELF_AND_TEAM:
    "Self + team",
  SELF:
    "Self only",
} as const;

function sortRoles(
  roles:
    ManagedRole[]
) {
  return [
    ...roles,
  ].sort(
    (
      left,
      right
    ) => {
      if (
        left.rank ===
          null &&
        right.rank !==
          null
      ) {
        return 1;
      }

      if (
        left.rank !==
          null &&
        right.rank ===
          null
      ) {
        return -1;
      }

      if (
        left.rank !==
          null &&
        right.rank !==
          null &&
        left.rank !==
          right.rank
      ) {
        return (
          left.rank -
          right.rank
        );
      }

      return left.name.localeCompare(
        right.name
      );
    }
  );
}

function draftFromRole(
  role:
    ManagedRole
): RoleDraft {
  return {
    name:
      role.name,

    rank:
      role.rank ===
      null
        ? ""
        : String(
            role.rank
          ),

    dataScope:
      role.dataScope,

    permissionIds:
      role.permissions.map(
        (
          permission
        ) =>
          permission.id
      ),
  };
}

function RoleBuilderPage() {
  const toast =
    useToast();

  const {
    refreshAuth,
  } =
    useAuth();

  const [
    roles,
    setRoles,
  ] =
    useState<
      ManagedRole[]
    >([]);

  const [
    permissions,
    setPermissions,
  ] =
    useState<
      Permission[]
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
    selectedRoleId,
    setSelectedRoleId,
  ] =
    useState<
      string | null
    >(
      null
    );

  const [
    creating,
    setCreating,
  ] =
    useState(
      false
    );

  const [
    draft,
    setDraft,
  ] =
    useState<
      RoleDraft
    >({
      name:
        "",
      rank:
        "7",
      dataScope:
        "SELF",
      permissionIds:
        [],
    });

  const [
    deleteConfirmOpen,
    setDeleteConfirmOpen,
  ] =
    useState(
      false
    );

  const loadBuilder =
    useCallback(
      async (
        preferredRoleId?:
          string
      ) => {
        try {
          setLoading(
            true
          );

          setPageError(
            ""
          );

          const response =
            await apiRequest<
              RoleBuilderResponse
            >(
              "/api/roles"
            );

          const sortedRoles =
            sortRoles(
              response.roles
            );

          setRoles(
            sortedRoles
          );

          setPermissions(
            response.permissions
          );

          const nextSelected =
            preferredRoleId &&
            sortedRoles.some(
              (
                role
              ) =>
                role.id ===
                preferredRoleId
            )
              ? preferredRoleId
              : selectedRoleId &&
                  sortedRoles.some(
                    (
                      role
                    ) =>
                      role.id ===
                      selectedRoleId
                  )
                ? selectedRoleId
                : sortedRoles[0]?.id ??
                  null;

          if (
            !creating &&
            nextSelected
          ) {
            const role =
              sortedRoles.find(
                (
                  item
                ) =>
                  item.id ===
                  nextSelected
              );

            if (role) {
              setSelectedRoleId(
                role.id
              );

              setDraft(
                draftFromRole(
                  role
                )
              );
            }
          }
        } catch (
          error
        ) {
          const message =
            error instanceof
              Error
              ? error.message
              : "Unable to load roles.";

          setPageError(
            message
          );

          toast.error(
            message,
            "Unable to load Role Builder"
          );
        } finally {
          setLoading(
            false
          );
        }
      },
      [
        creating,
        selectedRoleId,
        toast,
      ]
    );

  useEffect(
    () => {
      void loadBuilder();
    },
    [
      loadBuilder,
    ]
  );

  const selectedRole =
    useMemo(
      () =>
        roles.find(
          (
            role
          ) =>
            role.id ===
            selectedRoleId
        ) ??
        null,
      [
        roles,
        selectedRoleId,
      ]
    );

  const permissionGroups =
    useMemo(
      () => {
        const groups =
          new Map<
            string,
            {
              pageKey:
                string;
              categoryKey:
                string | null;
              permissions:
                Permission[];
            }
          >();

        for (
          const permission
          of permissions
        ) {
          const key =
            permission.pageKey +
            "::" +
            (
              permission.categoryKey ??
              "general"
            );

          const existing =
            groups.get(
              key
            );

          if (existing) {
            existing.permissions.push(
              permission
            );
          } else {
            groups.set(
              key,
              {
                pageKey:
                  permission.pageKey,

                categoryKey:
                  permission.categoryKey,

                permissions: [
                  permission,
                ],
              }
            );
          }
        }

        return [
          ...groups.values(),
        ];
      },
      [
        permissions,
      ]
    );

  function selectRole(
    role:
      ManagedRole
  ) {
    setCreating(
      false
    );

    setSelectedRoleId(
      role.id
    );

    setDraft(
      draftFromRole(
        role
      )
    );
  }

  function startCreate() {
    const highestRank =
      roles.reduce(
        (
          current,
          role
        ) =>
          role.rank !==
            null &&
          role.rank >
            current
            ? role.rank
            : current,
        1
      );

    setCreating(
      true
    );

    setSelectedRoleId(
      null
    );

    setDraft({
      name:
        "",

      rank:
        String(
          highestRank +
            1
        ),

      dataScope:
        "SELF",

      permissionIds:
        [],
    });
  }

  function togglePermission(
    permission:
      Permission
  ) {
    if (
      selectedRole?.systemKey ===
        "OWNER" &&
      permission.key ===
        "roles.manage"
    ) {
      return;
    }

    setDraft(
      (
        current
      ) => {
        const exists =
          current.permissionIds.includes(
            permission.id
          );

        return {
          ...current,

          permissionIds:
            exists
              ? current.permissionIds.filter(
                  (
                    id
                  ) =>
                    id !==
                    permission.id
                )
              : [
                  ...current.permissionIds,
                  permission.id,
                ],
        };
      }
    );
  }

  async function saveRole(
    event:
      FormEvent
  ) {
    event.preventDefault();

    const name =
      draft.name.trim();

    if (!name) {
      toast.warning(
        "Enter a role name.",
        "Role name required"
      );

      return;
    }

    const rank =
      draft.rank.trim()
        ? Number(
            draft.rank
          )
        : null;

    if (
      rank !== null &&
      (
        !Number.isInteger(
          rank
        ) ||
        rank < 1 ||
        rank > 999
      )
    ) {
      toast.warning(
        "Use a whole-number rank between 1 and 999.",
        "Invalid rank"
      );

      return;
    }

    try {
      setSaving(
        true
      );

      const response =
        await apiRequest<
          RoleMutationResponse
        >(
          creating
            ? "/api/roles"
            : "/api/roles/" +
                selectedRoleId,
          {
            method:
              creating
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

      setCreating(
        false
      );

      setSelectedRoleId(
        response.role.id
      );

      await refreshAuth();

      await loadBuilder(
        response.role.id
      );

      toast.success(
        creating
          ? "The custom role is ready to assign."
          : "The role was updated for everyone who holds it.",
        creating
          ? "Role created"
          : "Role updated"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save the role.",
        "Role not saved"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function deleteSelectedRole() {
    if (
      !selectedRole ||
      selectedRole.isSystem ||
      selectedRole.affectedUserCount >
        0
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest(
        "/api/roles/" +
          selectedRole.id,
        {
          method:
            "DELETE",
        }
      );

      setDeleteConfirmOpen(
        false
      );

      setSelectedRoleId(
        null
      );

      await refreshAuth();

      await loadBuilder();

      toast.success(
        "The unused custom role was deleted.",
        "Role deleted"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to delete the role.",
        "Role not deleted"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  const canDeleteSelected =
    Boolean(
      selectedRole &&
      !selectedRole.isSystem &&
      selectedRole.affectedUserCount ===
        0
    );

  return (
    <div className="page role-builder-page">
      <header className="page-header">
        <div>
          <p className="page-eyebrow">
            Login Gate
          </p>

          <h2>
            Role Builder
          </h2>

          <p className="page-description">
            Create and maintain role rank, data scope, and permission bundles without changing application code.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={
            startCreate
          }
        >
          Create custom role
        </button>
      </header>

      <section className="role-builder-summary">
        <div className="stat-card">
          <span className="stat-label">
            Total roles
          </span>

          <strong className="stat-value">
            {roles.length}
          </strong>

          <span className="stat-help">
            Default and custom roles.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Default roles
          </span>

          <strong className="stat-value">
            {
              roles.filter(
                (
                  role
                ) =>
                  role.isSystem
              ).length
            }
          </strong>

          <span className="stat-help">
            Editable, but never deletable.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Custom roles
          </span>

          <strong className="stat-value">
            {
              roles.filter(
                (
                  role
                ) =>
                  !role.isSystem
              ).length
            }
          </strong>

          <span className="stat-help">
            Can be deleted when unused.
          </span>
        </div>

        <div className="stat-card">
          <span className="stat-label">
            Permissions
          </span>

          <strong className="stat-value">
            {permissions.length}
          </strong>

          <span className="stat-help">
            Registered Step 1 capabilities.
          </span>
        </div>
      </section>

      {pageError && (
        <div className="role-builder-error">
          {pageError}
        </div>
      )}

      <section className="role-builder-layout">
        <aside className="content-card role-list-card">
          <div className="role-list-header">
            <div>
              <span className="page-eyebrow">
                Role catalog
              </span>

              <h3>
                Roles
              </h3>
            </div>

            <span className="role-list-count">
              {roles.length}
            </span>
          </div>

          <div className="role-list">
            {loading ? (
              <div className="role-builder-empty">
                Loading roles…
              </div>
            ) : roles.length ===
              0 ? (
              <div className="role-builder-empty">
                No roles found.
              </div>
            ) : (
              roles.map(
                (
                  role
                ) => (
                  <button
                    key={
                      role.id
                    }
                    type="button"
                    className={
                      !creating &&
                      selectedRoleId ===
                        role.id
                        ? "role-list-item active"
                        : "role-list-item"
                    }
                    onClick={() =>
                      selectRole(
                        role
                      )
                    }
                  >
                    <span className="role-list-item-main">
                      <strong>
                        {role.name}
                      </strong>

                      <small>
                        {role.rank ===
                        null
                          ? "Unranked"
                          : "Rank " +
                            role.rank}
                        {" · "}
                        {
                          DATA_SCOPE_LABELS[
                            role.dataScope
                          ]
                        }
                      </small>
                    </span>

                    <span className="role-list-item-meta">
                      <span
                        className={
                          role.isSystem
                            ? "role-type-badge system"
                            : "role-type-badge custom"
                        }
                      >
                        {role.isSystem
                          ? "Default"
                          : "Custom"}
                      </span>

                      <small>
                        {
                          role.affectedUserCount
                        }{" "}
                        user
                        {role.affectedUserCount ===
                        1
                          ? ""
                          : "s"}
                      </small>
                    </span>
                  </button>
                )
              )
            )}
          </div>
        </aside>

        <form
          className="content-card role-editor-card"
          onSubmit={
            saveRole
          }
        >
          <div className="role-editor-header">
            <div>
              <span className="page-eyebrow">
                {creating
                  ? "Custom role"
                  : selectedRole?.isSystem
                    ? "Default role"
                    : "Custom role"}
              </span>

              <h3>
                {creating
                  ? "Create role"
                  : selectedRole?.name ??
                    "Select a role"}
              </h3>
            </div>

            {!creating &&
              selectedRole && (
                <span className="role-affected-badge">
                  {
                    selectedRole.affectedUserCount
                  }{" "}
                  affected
                </span>
              )}
          </div>

          {!creating &&
          !selectedRole ? (
            <div className="role-builder-empty role-editor-empty">
              Select a role from the catalog.
            </div>
          ) : (
            <>
              <div className="role-editor-section">
                <div className="role-editor-section-heading">
                  <div>
                    <strong>
                      Role settings
                    </strong>

                    <span>
                      Rank controls chain-of-command authority. Lower numbers have higher authority.
                    </span>
                  </div>
                </div>

                <div className="role-settings-grid">
                  <label className="form-field role-name-field">
                    <span>
                      Role name
                    </span>

                    <input
                      value={
                        draft.name
                      }
                      onChange={(
                        event
                      ) =>
                        setDraft(
                          (
                            current
                          ) => ({
                            ...current,

                            name:
                              event.target.value,
                          })
                        )
                      }
                      maxLength={
                        120
                      }
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Rank
                    </span>

                    <input
                      type="number"
                      min={
                        selectedRole?.systemKey ===
                        "OWNER"
                          ? 1
                          : 2
                      }
                      max={
                        999
                      }
                      step={
                        1
                      }
                      value={
                        draft.rank
                      }
                      onChange={(
                        event
                      ) =>
                        setDraft(
                          (
                            current
                          ) => ({
                            ...current,

                            rank:
                              event.target.value,
                          })
                        )
                      }
                      disabled={
                        selectedRole?.systemKey ===
                        "OWNER"
                      }
                      placeholder={
                        selectedRole?.isSystem
                          ? "Unranked"
                          : "Required"
                      }
                    />
                  </label>

                  <label className="form-field">
                    <span>
                      Data scope
                    </span>

                    <select
                      value={
                        draft.dataScope
                      }
                      onChange={(
                        event
                      ) =>
                        setDraft(
                          (
                            current
                          ) => ({
                            ...current,

                            dataScope:
                              event.target.value as
                                RoleDraft["dataScope"],
                          })
                        )
                      }
                    >
                      <option value="ALL">
                        All data
                      </option>

                      <option value="SELF_AND_TEAM">
                        Self + team
                      </option>

                      <option value="SELF">
                        Self only
                      </option>
                    </select>
                  </label>
                </div>

                {!creating &&
                  selectedRole &&
                  selectedRole.affectedUserCount >
                    0 && (
                    <div className="role-impact-note">
                      <strong>
                        This change affects {
                          selectedRole.affectedUserCount
                        } current user
                        {selectedRole.affectedUserCount ===
                        1
                          ? ""
                          : "s"}.
                      </strong>

                      <span>
                        Saving updates this role for everyone who currently holds it.
                      </span>
                    </div>
                  )}
              </div>

              <div className="role-editor-section">
                <div className="role-editor-section-heading">
                  <div>
                    <strong>
                      Permissions
                    </strong>

                    <span>
                      Permissions stack when a person holds more than one role.
                    </span>
                  </div>

                  <span className="role-permission-count">
                    {
                      draft.permissionIds.length
                    }{" "}
                    selected
                  </span>
                </div>

                <div className="role-permission-groups">
                  {permissionGroups.map(
                    (
                      group
                    ) => (
                      <section
                        key={
                          group.pageKey +
                          "::" +
                          (
                            group.categoryKey ??
                            "general"
                          )
                        }
                        className="role-permission-group"
                      >
                        <div className="role-permission-group-heading">
                          <strong>
                            {
                              group.pageKey
                            }
                          </strong>

                          <span>
                            {
                              group.categoryKey ??
                              "general"
                            }
                          </span>
                        </div>

                        <div className="role-permission-list">
                          {group.permissions.map(
                            (
                              permission
                            ) => {
                              const checked =
                                draft.permissionIds.includes(
                                  permission.id
                                );

                              const locked =
                                selectedRole?.systemKey ===
                                  "OWNER" &&
                                permission.key ===
                                  "roles.manage";

                              return (
                                <label
                                  key={
                                    permission.id
                                  }
                                  className={
                                    locked
                                      ? "role-permission-item locked"
                                      : "role-permission-item"
                                  }
                                >
                                  <input
                                    type="checkbox"
                                    checked={
                                      checked
                                    }
                                    onChange={() =>
                                      togglePermission(
                                        permission
                                      )
                                    }
                                    disabled={
                                      locked
                                    }
                                  />

                                  <span className="role-permission-copy">
                                    <strong>
                                      {
                                        permission.name
                                      }
                                    </strong>

                                    <small>
                                      {
                                        permission.description ??
                                        permission.key
                                      }
                                    </small>

                                    <code>
                                      {
                                        permission.key
                                      }
                                    </code>
                                  </span>
                                </label>
                              );
                            }
                          )}
                        </div>
                      </section>
                    )
                  )}
                </div>
              </div>

              <div className="role-editor-footer">
                <div className="role-editor-policy">
                  {!creating &&
                  selectedRole?.isSystem
                    ? "Default roles can be edited but not deleted."
                    : !creating &&
                        selectedRole &&
                        selectedRole.affectedUserCount >
                          0
                      ? "Remove this role from all users before deleting it."
                      : "Custom roles can be deleted when nobody holds them."}
                </div>

                <div className="role-editor-actions">
                  {!creating &&
                    selectedRole &&
                    !selectedRole.isSystem && (
                      <button
                        type="button"
                        className="danger-button"
                        disabled={
                          !canDeleteSelected ||
                          saving
                        }
                        onClick={() =>
                          setDeleteConfirmOpen(
                            true
                          )
                        }
                      >
                        Delete role
                      </button>
                    )}

                  {creating && (
                    <button
                      type="button"
                      className="secondary-button"
                      disabled={
                        saving
                      }
                      onClick={() => {
                        setCreating(
                          false
                        );

                        if (
                          roles[0]
                        ) {
                          selectRole(
                            roles[0]
                          );
                        }
                      }}
                    >
                      Cancel
                    </button>
                  )}

                  <button
                    type="submit"
                    className="primary-button"
                    disabled={
                      saving ||
                      !draft.name.trim()
                    }
                  >
                    {saving
                      ? "Saving…"
                      : creating
                        ? "Create role"
                        : "Save changes"}
                  </button>
                </div>
              </div>
            </>
          )}
        </form>
      </section>

      {deleteConfirmOpen &&
        selectedRole && (
          <div className="role-builder-overlay">
            <section className="role-delete-modal">
              <div className="role-delete-header">
                <div>
                  <span className="page-eyebrow">
                    Confirmation
                  </span>

                  <h3>
                    Delete custom role?
                  </h3>
                </div>
              </div>

              <div className="role-delete-body">
                <p>
                  Delete <strong>{selectedRole.name}</strong>? This is only allowed because nobody currently holds the role.
                </p>

                <div className="role-delete-warning">
                  The role and its permission mapping will be removed. Historical audit coverage will be added with the Audit Log phase.
                </div>
              </div>

              <div className="role-delete-footer">
                <button
                  type="button"
                  className="secondary-button"
                  disabled={
                    saving
                  }
                  onClick={() =>
                    setDeleteConfirmOpen(
                      false
                    )
                  }
                >
                  Cancel
                </button>

                <button
                  type="button"
                  className="danger-button"
                  disabled={
                    saving
                  }
                  onClick={() => {
                    void deleteSelectedRole();
                  }}
                >
                  {saving
                    ? "Deleting…"
                    : "Delete role"}
                </button>
              </div>
            </section>
          </div>
        )}
    </div>
  );
}

export default RoleBuilderPage;
