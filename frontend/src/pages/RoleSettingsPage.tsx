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
  useAuth,
} from "../auth/AuthContext";
import {
  useToast,
} from "../components/ToastProvider";
import {
  apiRequest,
} from "../lib/api";

import "./RoleSettingsPage.css";

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

type RoleDraft = {
  name: string;
  dataScope: DataScope;
  permissionIds: string[];
  internalRank: number | null;
};

type RoleTypeFilter =
  | "ALL"
  | "DEFAULT"
  | "CUSTOM";

type RoleEditorMode =
  | "CREATE"
  | "EDIT"
  | null;

const ROLE_PAGE_SIZE = 7;

const DATA_SCOPE_OPTIONS: Array<{
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
  scope: DataScope
) {
  return (
    DATA_SCOPE_OPTIONS.find(
      (
        option
      ) =>
        option.value ===
        scope
    )?.label ??
    scope
  );
}

function scopeDescription(
  scope: DataScope
) {
  return (
    DATA_SCOPE_OPTIONS.find(
      (
        option
      ) =>
        option.value ===
        scope
    )?.description ??
    scope
  );
}

function sortRoles(
  roles: ManagedRole[]
) {
  return [
    ...roles,
  ].sort(
    (
      left,
      right
    ) => {
      if (
        left.isSystem !==
        right.isSystem
      ) {
        return left.isSystem
          ? -1
          : 1;
      }

      return left.name.localeCompare(
        right.name
      );
    }
  );
}

function draftFromRole(
  role: ManagedRole
): RoleDraft {
  return {
    name: role.name,
    dataScope:
      role.dataScope,
    permissionIds:
      role.permissions.map(
        (
          permission
        ) =>
          permission.id
      ),
    internalRank:
      role.rank,
  };
}

function RoleSettingsPage() {
  const toast =
    useToast();
  const {
    refreshAuth,
  } =
    useAuth();

  const [
    roles,
    setRoles,
  ] = useState<
    ManagedRole[]
  >([]);

  const [
    permissions,
    setPermissions,
  ] = useState<
    Permission[]
  >([]);

  const [
    loading,
    setLoading,
  ] = useState(
    true
  );

  const [
    saving,
    setSaving,
  ] = useState(
    false
  );

  const [
    pageError,
    setPageError,
  ] = useState(
    ""
  );

  const [
    roleQuery,
    setRoleQuery,
  ] = useState(
    ""
  );

  const [
    typeFilter,
    setTypeFilter,
  ] = useState<
    RoleTypeFilter
  >(
    "ALL"
  );

  const [
    appliedRoleQuery,
    setAppliedRoleQuery,
  ] = useState(
    ""
  );

  const [
    appliedTypeFilter,
    setAppliedTypeFilter,
  ] = useState<
    RoleTypeFilter
  >(
    "ALL"
  );

  const [
    rolePage,
    setRolePage,
  ] = useState(
    1
  );

  const [
    editorMode,
    setEditorMode,
  ] = useState<
    RoleEditorMode
  >(
    null
  );

  const [
    editorRoleId,
    setEditorRoleId,
  ] = useState<
    string | null
  >(
    null
  );

  const [
    editorDraft,
    setEditorDraft,
  ] = useState<
    RoleDraft
  >({
    name: "",
    dataScope: "SELF",
    permissionIds: [],
    internalRank: null,
  });

  const [
    permissionsRoleId,
    setPermissionsRoleId,
  ] = useState<
    string | null
  >(
    null
  );

  const [
    permissionDraftIds,
    setPermissionDraftIds,
  ] = useState<
    string[]
  >([]);

  const [
    deleteRoleId,
    setDeleteRoleId,
  ] = useState<
    string | null
  >(
    null
  );

  const loadRoles =
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
              RoleBuilderResponse
            >(
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
        } catch (
          error
        ) {
          const message =
            error instanceof Error
              ? error.message
              : "Unable to load roles.";

          setPageError(
            message
          );
          toast.error(
            message,
            "Unable to load Role Settings"
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
      const timer =
        window.setTimeout(
          () => {
            void loadRoles();
          },
          0
        );

      return () => {
        window.clearTimeout(
          timer
        );
      };
    },
    [
      loadRoles,
    ]
  );

  const filteredRoles =
    useMemo(
      () => {
        const query =
          appliedRoleQuery
            .trim()
            .toLowerCase();

        return roles.filter(
          (
            role
          ) => {
            const matchesQuery =
              !query ||
              role.name
                .toLowerCase()
                .includes(
                  query
                );

            const matchesType =
              appliedTypeFilter ===
                "ALL" ||
              (
                appliedTypeFilter ===
                  "DEFAULT"
                  ? role.isSystem
                  : !role.isSystem
              );

            return (
              matchesQuery &&
              matchesType
            );
          }
        );
      },
      [
        appliedRoleQuery,
        appliedTypeFilter,
        roles,
      ]
    );

  const totalPages =
    Math.max(
      1,
      Math.ceil(
        filteredRoles.length /
          ROLE_PAGE_SIZE
      )
    );

  const safePage =
    Math.min(
      rolePage,
      totalPages
    );

  const pagedRoles =
    useMemo(
      () => {
        const start =
          (
            safePage -
            1
          ) *
          ROLE_PAGE_SIZE;

        return filteredRoles.slice(
          start,
          start +
            ROLE_PAGE_SIZE
        );
      },
      [
        filteredRoles,
        safePage,
      ]
    );

  const permissionGroups =
    useMemo(
      () => {
        const groups =
          new Map<
            string,
            {
              pageKey: string;
              categoryKey: string | null;
              permissions: Permission[];
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

          if (
            existing
          ) {
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
        ].sort(
          (
            left,
            right
          ) =>
            (
              left.pageKey +
              ":" +
              (
                left.categoryKey ??
                ""
              )
            ).localeCompare(
              right.pageKey +
                ":" +
                (
                  right.categoryKey ??
                  ""
                )
            )
        );
      },
      [
        permissions,
      ]
    );

  const editorRole =
    useMemo(
      () =>
        roles.find(
          (
            role
          ) =>
            role.id ===
            editorRoleId
        ) ??
        null,
      [
        editorRoleId,
        roles,
      ]
    );

  const permissionsRole =
    useMemo(
      () =>
        roles.find(
          (
            role
          ) =>
            role.id ===
            permissionsRoleId
        ) ??
        null,
      [
        permissionsRoleId,
        roles,
      ]
    );

  const deleteRole =
    useMemo(
      () =>
        roles.find(
          (
            role
          ) =>
            role.id ===
            deleteRoleId
        ) ??
        null,
      [
        deleteRoleId,
        roles,
      ]
    );

  function applyFilters(
    event: FormEvent
  ) {
    event.preventDefault();
    setAppliedRoleQuery(
      roleQuery
    );
    setAppliedTypeFilter(
      typeFilter
    );
    setRolePage(
      1
    );
  }

  function resetFilters() {
    setRoleQuery(
      ""
    );
    setTypeFilter(
      "ALL"
    );
    setAppliedRoleQuery(
      ""
    );
    setAppliedTypeFilter(
      "ALL"
    );
    setRolePage(
      1
    );
  }

  function openCreateRole() {
    const lowestAuthorityRank =
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

    setEditorMode(
      "CREATE"
    );
    setEditorRoleId(
      null
    );
    setEditorDraft({
      name: "",
      dataScope: "SELF",
      permissionIds: [],
      internalRank:
        Math.min(
          lowestAuthorityRank +
            1,
          999
        ),
    });
  }

  function openEditRole(
    role: ManagedRole
  ) {
    setEditorMode(
      "EDIT"
    );
    setEditorRoleId(
      role.id
    );
    setEditorDraft(
      draftFromRole(
        role
      )
    );
  }

  function closeRoleEditor() {
    if (
      saving
    ) {
      return;
    }

    setEditorMode(
      null
    );
    setEditorRoleId(
      null
    );
  }

  function openPermissions(
    role: ManagedRole
  ) {
    setPermissionsRoleId(
      role.id
    );
    setPermissionDraftIds(
      role.permissions.map(
        (
          permission
        ) =>
          permission.id
      )
    );
  }

  function closePermissions() {
    if (
      saving
    ) {
      return;
    }

    setPermissionsRoleId(
      null
    );
    setPermissionDraftIds(
      []
    );
  }

  function togglePermission(
    permissionId: string
  ) {
    setPermissionDraftIds(
      (
        current
      ) =>
        current.includes(
          permissionId
        )
          ? current.filter(
              (
                id
              ) =>
                id !==
                permissionId
            )
          : [
              ...current,
              permissionId,
            ]
    );
  }

  async function saveRoleEditor(
    event: FormEvent
  ) {
    event.preventDefault();

    const name =
      editorDraft.name.trim();

    if (
      !name
    ) {
      toast.warning(
        "Enter a role name.",
        "Role name required"
      );
      return;
    }

    if (
      editorMode ===
        "CREATE" &&
      editorDraft.internalRank ===
        null
    ) {
      toast.error(
        "The internal authority level could not be assigned safely.",
        "Role not saved"
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
          editorMode ===
            "CREATE"
            ? "/api/roles"
            : "/api/roles/" +
                editorRoleId,
          {
            method:
              editorMode ===
              "CREATE"
                ? "POST"
                : "PUT",
            body:
              JSON.stringify({
                name,
                rank:
                  editorDraft.internalRank,
                dataScope:
                  editorDraft.dataScope,
                permissionIds:
                  editorDraft.permissionIds,
              }),
          }
        );

      closeRoleEditor();
      await refreshAuth();
      await loadRoles();

      toast.success(
        editorMode ===
          "CREATE"
          ? "The custom role is ready to configure."
          : "Role details were updated.",
        editorMode ===
          "CREATE"
          ? "Role created"
          : "Role updated"
      );

      if (
        editorMode ===
        "CREATE"
      ) {
        setPermissionsRoleId(
          response.role.id
        );
        setPermissionDraftIds(
          response.role.permissions.map(
            (
              permission
            ) =>
              permission.id
          )
        );
      }
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

  async function savePermissions() {
    if (
      !permissionsRole
    ) {
      return;
    }

    try {
      setSaving(
        true
      );

      await apiRequest<
        RoleMutationResponse
      >(
        "/api/roles/" +
          permissionsRole.id,
        {
          method: "PUT",
          body:
            JSON.stringify({
              name:
                permissionsRole.name,
              rank:
                permissionsRole.rank,
              dataScope:
                permissionsRole.dataScope,
              permissionIds:
                permissionDraftIds,
            }),
        }
      );

      closePermissions();
      await refreshAuth();
      await loadRoles();
      toast.success(
        "Permission changes were applied to this role.",
        "Permissions updated"
      );
    } catch (
      error
    ) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to save permissions.",
        "Permissions not saved"
      );
    } finally {
      setSaving(
        false
      );
    }
  }

  async function deleteSelectedRole() {
    if (
      !deleteRole ||
      deleteRole.isSystem ||
      deleteRole.affectedUserCount >
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
          deleteRole.id,
        {
          method: "DELETE",
        }
      );

      setDeleteRoleId(
        null
      );
      await refreshAuth();
      await loadRoles();
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

  const rangeStart =
    filteredRoles.length ===
      0
      ? 0
      : (
          safePage -
          1
        ) *
          ROLE_PAGE_SIZE +
        1;

  const rangeEnd =
    Math.min(
      safePage *
        ROLE_PAGE_SIZE,
      filteredRoles.length
    );

  return (
    <div className="page role-settings-page">
      <header className="role-settings-header">
        <div>
          <p className="page-eyebrow">
            Access control
          </p>
          <h2>
            Role Settings
          </h2>
          <p className="page-description">
            Manage roles, data scope, and permission access across the agency.
          </p>
        </div>

        <button
          type="button"
          className="primary-button"
          onClick={
            openCreateRole
          }
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
          onSubmit={
            applyFilters
          }
        >
          <label className="role-settings-filter-field role-settings-role-search">
            <span>
              By role
            </span>
            <input
              type="search"
              value={
                roleQuery
              }
              placeholder="Role name"
              onChange={(
                event
              ) =>
                setRoleQuery(
                  event.target.value
                )
              }
            />
          </label>

          <label className="role-settings-filter-field">
            <span>
              By type
            </span>
            <select
              value={
                typeFilter
              }
              onChange={(
                event
              ) =>
                setTypeFilter(
                  event.target.value as
                    RoleTypeFilter
                )
              }
            >
              <option value="ALL">
                All types
              </option>
              <option value="DEFAULT">
                Default
              </option>
              <option value="CUSTOM">
                Custom
              </option>
            </select>
          </label>

          <div className="role-settings-filter-actions">
            <button
              type="button"
              className="secondary-button"
              onClick={
                resetFilters
              }
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
          <table className="role-settings-table">
            <thead>
              <tr>
                <th>
                  Role
                </th>
                <th>
                  Description
                </th>
                <th>
                  Users
                </th>
                <th>
                  Type
                </th>
                <th className="role-settings-operations-heading">
                  Operations
                </th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td
                    className="role-settings-empty"
                    colSpan={
                      5
                    }
                  >
                    Loading roles…
                  </td>
                </tr>
              ) : pagedRoles.length ===
                0 ? (
                <tr>
                  <td
                    className="role-settings-empty"
                    colSpan={
                      5
                    }
                  >
                    No matching roles.
                  </td>
                </tr>
              ) : (
                pagedRoles.map(
                  (
                    role
                  ) => (
                    <tr
                      key={
                        role.id
                      }
                    >
                      <td>
                        <div className="role-settings-role-cell">
                          <strong>
                            {role.name}
                          </strong>
                          <small>
                            {scopeLabel(
                              role.dataScope
                            )}
                          </small>
                        </div>
                      </td>
                      <td>
                        <span className="role-settings-description">
                          {scopeDescription(
                            role.dataScope
                          )}
                        </span>
                      </td>
                      <td>
                        <span className="role-settings-user-count">
                          {
                            role.affectedUserCount
                          }
                        </span>
                      </td>
                      <td>
                        <span
                          className={
                            role.isSystem
                              ? "role-settings-type default"
                              : "role-settings-type custom"
                          }
                        >
                          {role.isSystem
                            ? "Default"
                            : "Custom"}
                        </span>
                      </td>
                      <td>
                        <div className="role-settings-operations">
                          <button
                            type="button"
                            className="role-settings-link-button"
                            onClick={() =>
                              openPermissions(
                                role
                              )
                            }
                          >
                            Set permissions
                          </button>
                          <button
                            type="button"
                            className="role-settings-link-button"
                            onClick={() =>
                              openEditRole(
                                role
                              )
                            }
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            className="role-settings-link-button danger"
                            disabled={
                              role.isSystem ||
                              role.affectedUserCount >
                                0
                            }
                            title={
                              role.isSystem
                                ? "Default roles cannot be deleted."
                                : role.affectedUserCount >
                                    0
                                  ? "Remove this role from all users before deleting it."
                                  : "Delete role"
                            }
                            onClick={() =>
                              setDeleteRoleId(
                                role.id
                              )
                            }
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                )
              )}
            </tbody>
          </table>
        </div>

        <footer className="role-settings-pagination">
          <span>
            {rangeStart}–{rangeEnd} of {filteredRoles.length}
          </span>
          <div>
            <button
              type="button"
              className="role-settings-page-button"
              disabled={
                safePage <=
                1
              }
              onClick={() =>
                setRolePage(
                  Math.max(
                    1,
                    safePage -
                      1
                  )
                )
              }
              aria-label="Previous page"
            >
              ‹
            </button>
            <strong>
              Page {safePage} of {totalPages}
            </strong>
            <button
              type="button"
              className="role-settings-page-button"
              disabled={
                safePage >=
                totalPages
              }
              onClick={() =>
                setRolePage(
                  Math.min(
                    totalPages,
                    safePage +
                      1
                  )
                )
              }
              aria-label="Next page"
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
            onSubmit={
              saveRoleEditor
            }
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">
                  {editorMode ===
                  "CREATE"
                    ? "New role"
                    : editorRole?.isSystem
                      ? "Default role"
                      : "Custom role"}
                </span>
                <h3>
                  {editorMode ===
                  "CREATE"
                    ? "Add role"
                    : "Edit role"}
                </h3>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={
                  closeRoleEditor
                }
                aria-label="Close role editor"
              >
                ×
              </button>
            </div>

            <div className="role-settings-modal-body">
              <label className="form-field">
                <span>
                  Role name
                </span>
                <input
                  value={
                    editorDraft.name
                  }
                  onChange={(
                    event
                  ) =>
                    setEditorDraft(
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

              <fieldset className="role-settings-scope-fieldset">
                <legend>
                  Data scope
                </legend>
                <div className="role-settings-scope-options">
                  {DATA_SCOPE_OPTIONS.map(
                    (
                      option
                    ) => (
                      <label
                        key={
                          option.value
                        }
                        className={
                          editorDraft.dataScope ===
                          option.value
                            ? "role-settings-scope-option selected"
                            : "role-settings-scope-option"
                        }
                      >
                        <input
                          type="radio"
                          name="roleDataScope"
                          checked={
                            editorDraft.dataScope ===
                            option.value
                          }
                          onChange={() =>
                            setEditorDraft(
                              (
                                current
                              ) => ({
                                ...current,
                                dataScope:
                                  option.value,
                              })
                            )
                          }
                        />
                        <span>
                          <strong>
                            {option.label}
                          </strong>
                          <small>
                            {option.description}
                          </small>
                        </span>
                      </label>
                    )
                  )}
                </div>
              </fieldset>

              {editorMode ===
                "EDIT" &&
                editorRole &&
                editorRole.affectedUserCount >
                  0 && (
                  <div className="role-settings-impact">
                    Saving changes updates this role for {
                      editorRole.affectedUserCount
                    } current user
                    {editorRole.affectedUserCount ===
                    1
                      ? ""
                      : "s"}.
                  </div>
                )}
            </div>

            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={
                  saving
                }
                onClick={
                  closeRoleEditor
                }
              >
                Cancel
              </button>
              <button
                type="submit"
                className="primary-button"
                disabled={
                  saving ||
                  !editorDraft.name.trim()
                }
              >
                {saving
                  ? "Saving…"
                  : editorMode ===
                      "CREATE"
                    ? "Add role"
                    : "Save changes"}
              </button>
            </div>
          </form>
        </div>
      )}

      {permissionsRole && (
        <div className="role-settings-overlay">
          <section
            className="role-settings-modal role-settings-permissions-modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              "Set permissions for " +
              permissionsRole.name
            }
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">
                  Permissions
                </span>
                <h3>
                  {permissionsRole.name}
                </h3>
                <p>
                  {permissionDraftIds.length} selected · {scopeLabel(
                    permissionsRole.dataScope
                  )}
                </p>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={
                  closePermissions
                }
                aria-label="Close permissions"
              >
                ×
              </button>
            </div>

            <div className="role-settings-permission-body">
              {permissionGroups.map(
                (
                  group,
                  index
                ) => {
                  const selectedCount =
                    group.permissions.filter(
                      (
                        permission
                      ) =>
                        permissionDraftIds.includes(
                          permission.id
                        )
                    ).length;

                  return (
                    <details
                      key={
                        group.pageKey +
                        "::" +
                        (
                          group.categoryKey ??
                          "general"
                        )
                      }
                      className="role-settings-permission-group"
                      open={
                        index ===
                        0
                      }
                    >
                      <summary>
                        <span>
                          <strong>
                            {group.pageKey}
                          </strong>
                          <small>
                            {group.categoryKey ??
                              "General"}
                          </small>
                        </span>
                        <span className="role-settings-permission-count">
                          {selectedCount}/{group.permissions.length}
                        </span>
                      </summary>

                      <div className="role-settings-permission-list">
                        {group.permissions.map(
                          (
                            permission
                          ) => (
                            <label
                              key={
                                permission.id
                              }
                              className="role-settings-permission-option"
                            >
                              <input
                                type="checkbox"
                                checked={
                                  permissionDraftIds.includes(
                                    permission.id
                                  )
                                }
                                onChange={() =>
                                  togglePermission(
                                    permission.id
                                  )
                                }
                              />
                              <span>
                                <strong>
                                  {permission.name}
                                </strong>
                                <small>
                                  {permission.description ??
                                    permission.key}
                                </small>
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
                disabled={
                  saving
                }
                onClick={
                  closePermissions
                }
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                disabled={
                  saving
                }
                onClick={() => {
                  void savePermissions();
                }}
              >
                {saving
                  ? "Saving…"
                  : "Save permissions"}
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
                <span className="page-eyebrow">
                  Confirmation
                </span>
                <h3>
                  Delete role?
                </h3>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={() =>
                  setDeleteRoleId(
                    null
                  )
                }
                aria-label="Close delete confirmation"
              >
                ×
              </button>
            </div>
            <div className="role-settings-modal-body">
              <p className="role-settings-delete-copy">
                Delete <strong>{deleteRole.name}</strong>? This role is unused and can be safely removed from the role catalog.
              </p>
              <div className="role-settings-delete-warning">
                The role and its permission mapping will be removed. Existing audit history remains preserved.
              </div>
            </div>
            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={
                  saving
                }
                onClick={() =>
                  setDeleteRoleId(
                    null
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

export default RoleSettingsPage;
