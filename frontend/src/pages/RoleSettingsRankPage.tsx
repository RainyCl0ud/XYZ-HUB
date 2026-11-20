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
  hasPortalPermission,
  PORTAL_PERMISSION_DEPENDENCIES,
} from "../auth/portalAccess";
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
  description: string | null;
  rank: number | null;
  dataScope: DataScope;
  landingPath: string | null;
  isSystem: boolean;
  archivedAt: string | null;
  isArchived: boolean;
  affectedUserCount: number;
  /* Set by the server: false when this role is at or above your rank, or one you hold. */
  canManage?: boolean;
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
  description: string;
  rank: string;
  dataScope: DataScope;
  permissionIds: string[];
};

const PAGE_SIZE = 6;


const MODULE_LABELS:
  Readonly<
    Record<
      string,
      string
    >
  > = {
  dashboard:
    "Dashboard",

  people:
    "Employee Management",

  quality:
    "Quality & Incidents",

  strikes:
    "Strike Management",

  models:
    "Creators",

  chat: "Chat",
  clock: "Clock & Hours",

  roles:
    "Role Settings",

  audit:
    "Audit Log",
};


const MODULE_ORDER = [
  "dashboard",
  "people",
  "quality",
  "strikes",
  "models",
  "chat",
  "roles",
  "audit",
] as const;

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
    access,
    refreshAuth,
  } = useAuth();

  const canManageRoleSettings =
    hasPortalPermission(
      access,
      "roles.manage"
    );

  const isOwner =
    access?.roles.some(
      (role) =>
        role.systemKey ===
        "OWNER"
    ) ?? false;

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
      description: "",
      rank: "",
      dataScope: "SELF",
      permissionIds: [],
    });

  const [permissionRoleId, setPermissionRoleId] =
    useState<string | null>(null);
  const [permissionDraft, setPermissionDraft] =
    useState<string[]>([]);
  const [archiveRoleId, setArchiveRoleId] =
    useState<string | null>(null);
  const [
    activePermissionGroupLabel,
    setActivePermissionGroupLabel,
  ] =
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

  /*
   * Role managers may only change roles ranked below their own and
   * never a role they hold. Older API responses omit canManage, so
   * treat a missing value as editable; the server re-checks either way.
   */
  function canEditRole(
    role: ManagedRole | null
  ) {
    return (
      canManageRoleSettings &&
      role !== null &&
      role.canManage !== false
    );
  }

  const permissionRoleEditable =
    canEditRole(
      permissionRole
    );
  const archiveRole =
    roles.find(
      (role) =>
        role.id === archiveRoleId
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
            permission.pageKey;

          const group =
            groups.get(label) ?? [];
          group.push(permission);
          groups.set(label, group);
        }

        return [...groups.entries()].sort(
          ([left], [right]) => {
            const leftIndex =
              MODULE_ORDER.indexOf(
                left as
                  typeof MODULE_ORDER[number]
              );

            const rightIndex =
              MODULE_ORDER.indexOf(
                right as
                  typeof MODULE_ORDER[number]
              );

            if (
              leftIndex !==
                -1 &&
              rightIndex !==
                -1
            ) {
              return (
                leftIndex -
                rightIndex
              );
            }

            if (
              leftIndex !==
              -1
            ) {
              return -1;
            }

            if (
              rightIndex !==
              -1
            ) {
              return 1;
            }

            return left.localeCompare(
              right
            );
          }
        );
      },
      [permissions]
    );

  const activePermissionGroup =
    permissionGroups.find(
      ([label]) =>
        label ===
        activePermissionGroupLabel
    ) ??
    permissionGroups[0] ??
    null;

  const activePermissionGroupLabelResolved =
    activePermissionGroup?.[0] ?? "";

  const activePermissionGroupPermissions =
    activePermissionGroup?.[1] ?? [];

  const activePermissionGroupTitle =
    MODULE_LABELS[
      activePermissionGroupLabelResolved
    ] ??
    activePermissionGroupLabelResolved;

  const activeAccessPermissions =
    activePermissionGroupPermissions.filter(
      (
        permission
      ) =>
        permission.categoryKey ===
          "access"
    );

  const activeActionPermissions =
    activePermissionGroupPermissions.filter(
      (
        permission
      ) =>
        permission.categoryKey !==
          "access"
    );

  const permissionByKey =
    useMemo(
      () =>
        new Map(
          permissions.map(
            (
              permission
            ) => [
              permission.key,
              permission,
            ]
          )
        ),
      [
        permissions,
      ]
    );

  const activePermissionSelectedCount =
    activePermissionGroupPermissions.filter(
      (permission) =>
        permissionDraft.includes(
          permission.id
        )
    ).length;

  const activePermissionAllSelected =
    activePermissionGroupPermissions.length >
      0 &&
    activePermissionSelectedCount ===
      activePermissionGroupPermissions.length;

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
    if (
      !canManageRoleSettings
    ) {
      return;
    }

    setEditorMode("CREATE");
    setEditorRoleId(null);
    setDraft({
      name: "",
      description: "",
      rank:
        nextSafeRank(roles),
      dataScope: "SELF",
      permissionIds: [],
    });
  }

  function openEdit(
    role: ManagedRole
  ) {
    if (
      !canEditRole(
        role
      )
    ) {
      return;
    }

    setEditorMode("EDIT");
    setEditorRoleId(role.id);
    setDraft({
      name: role.name,
      description:
        role.description ?? "",
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
    setActivePermissionGroupLabel(
      permissionGroups[0]?.[0] ??
        null
    );
  }

  function closeEditor() {
    if (!saving) {
      setEditorMode(null);
      setEditorRoleId(null);
    }
  }

  function openEditorArchiveConfirmation() {
    if (
      !isOwner ||
      editorMode !== "EDIT" ||
      !editorRole ||
      editorRole.systemKey === "OWNER" ||
      editorRole.isArchived
    ) {
      return;
    }

    setArchiveRoleId(
      editorRole.id
    );
    setEditorMode(null);
    setEditorRoleId(null);
  }

  async function reactivateEditorRole() {
    if (
      !isOwner ||
      !editorRole ||
      editorRole.systemKey === "OWNER" ||
      !editorRole.isArchived
    ) {
      return;
    }

    try {
      setSaving(true);
      await apiRequest<RoleMutationResponse>(
        `/api/roles/${editorRole.id}/reactivate`,
        {
          method: "POST",
        }
      );

      setEditorMode(null);
      setEditorRoleId(null);
      await refreshAuth();
      await loadRoles();
      toast.success(
        "The role is active again. Its retained user links are restored.",
        "Role reactivated"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to reactivate the role.",
        "Role not reactivated"
      );
    } finally {
      setSaving(false);
    }
  }

  function closePermissions() {
    if (!saving) {
      setPermissionRoleId(null);
      setPermissionDraft([]);
      setActivePermissionGroupLabel(
        null
      );
    }
  }

  function requirementsFor(
    permission:
      Permission
  ) {
    return (
      PORTAL_PERMISSION_DEPENDENCIES[
        permission.key
      ] ??
      []
    );
  }


  function addPermissionWithRequirements(
    selected:
      Set<string>,
    permission:
      Permission
  ) {
    for (
      const requiredKey
      of requirementsFor(
        permission
      )
    ) {
      const requiredPermission =
        permissionByKey.get(
          requiredKey
        );

      if (
        requiredPermission
      ) {
        addPermissionWithRequirements(
          selected,
          requiredPermission
        );
      }
    }

    selected.add(
      permission.id
    );
  }


  function pruneBrokenDependencies(
    selected:
      Set<string>
  ) {
    let changed =
      true;

    while (
      changed
    ) {
      changed =
        false;

      for (
        const permission
        of permissions
      ) {
        if (
          !selected.has(
            permission.id
          )
        ) {
          continue;
        }

        const missingDependency =
          requirementsFor(
            permission
          ).some(
            (
              requiredKey
            ) => {
              const requiredPermission =
                permissionByKey.get(
                  requiredKey
                );

              return (
                !requiredPermission ||
                !selected.has(
                  requiredPermission.id
                )
              );
            }
          );

        if (
          missingDependency
        ) {
          selected.delete(
            permission.id
          );

          changed =
            true;
        }
      }
    }
  }


  function setPermissionSelection(
    permission:
      Permission,
    selected:
      boolean
  ) {
    if (
      !permissionRoleEditable
    ) {
      return;
    }

    setPermissionDraft(
      (
        current
      ) => {
        const next =
          new Set(
            current
          );

        if (
          selected
        ) {
          addPermissionWithRequirements(
            next,
            permission
          );
        }
        else {
          next.delete(
            permission.id
          );

          pruneBrokenDependencies(
            next
          );
        }

        return [
          ...next,
        ];
      }
    );
  }


  function setPermissionGroupSelection(
    group:
      Permission[],
    selected:
      boolean
  ) {
    if (
      !permissionRoleEditable
    ) {
      return;
    }

    setPermissionDraft(
      (
        current
      ) => {
        const next =
          new Set(
            current
          );

        if (
          selected
        ) {
          for (
            const permission
            of group
          ) {
            addPermissionWithRequirements(
              next,
              permission
            );
          }
        }
        else {
          for (
            const permission
            of group
          ) {
            next.delete(
              permission.id
            );
          }

          pruneBrokenDependencies(
            next
          );
        }

        return [
          ...next,
        ];
      }
    );
  }


  function renderPermissionItem(
    permission:
      Permission
  ) {
    const requirements =
      requirementsFor(
        permission
      );

    const missingRequirements =
      requirements.filter(
        (
          requiredKey
        ) => {
          const requiredPermission =
            permissionByKey.get(
              requiredKey
            );

          return (
            !requiredPermission ||
            !permissionDraft.includes(
              requiredPermission.id
            )
          );
        }
      );

    const blocked =
      !permissionRoleEditable ||
      Boolean(permissionRole?.isArchived) ||
      missingRequirements.length >
        0;

    const requirementNames =
      requirements.map(
        (
          requiredKey
        ) =>
          permissionByKey.get(
            requiredKey
          )?.name ??
          requiredKey
      );

    return (
      <label
        key={
          permission.id
        }
        className={
          blocked
            ? "role-settings-permission-item disabled"
            : "role-settings-permission-item"
        }
      >
        <input
          type="checkbox"
          checked={
            permissionDraft.includes(
              permission.id
            )
          }
          disabled={
            blocked
          }
          onChange={(
            event
          ) =>
            setPermissionSelection(
              permission,
              event.target.checked
            )
          }
        />

        <span>
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

          {requirementNames.length >
            0 && (
            <small className="role-settings-permission-requirement">
              Requires: {
                requirementNames.join(
                  ", "
                )
              }
            </small>
          )}
        </span>
      </label>
    );
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
                description:
                  draft.description.trim() ||
                  null,
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
    if (
      !permissionRole ||
      permissionRole.isArchived
    ) {
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
              description:
                permissionRole.description,
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

  async function archiveSelectedRole() {
    if (
      !isOwner ||
      !archiveRole ||
      archiveRole.systemKey === "OWNER" ||
      archiveRole.isArchived
    ) {
      return;
    }

    try {
      setSaving(true);
      await apiRequest<RoleMutationResponse>(
        `/api/roles/${archiveRole.id}/archive`,
        {
          method: "POST",
        }
      );
      setArchiveRoleId(null);
      await refreshAuth();
      await loadRoles();
      toast.success(
        "The role was archived. Its details, permissions, and historical user links were retained.",
        "Role archived"
      );
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Unable to archive the role.",
        "Role not archived"
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
        {canManageRoleSettings && (
          <button
            type="button"
            className="primary-button"
            onClick={openCreate}
          >
            Add role
          </button>
        )}
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
                <th>Rank</th>
                <th>Role</th>
                <th>Description</th>
                <th>Users</th>
                <th className="role-settings-operations-heading">Operations</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td className="role-settings-empty" colSpan={5}>
                    Loading roles…
                  </td>
                </tr>
              ) : visibleRoles.length === 0 ? (
                <tr>
                  <td className="role-settings-empty" colSpan={5}>
                    No matching roles.
                  </td>
                </tr>
              ) : visibleRoles.map(
                (role) => (
                  <tr
                    key={role.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`View ${role.name} role details`}
                    onClick={() =>
                      openPermissions(
                        role
                      )
                    }
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" ||
                        event.key === " "
                      ) {
                        event.preventDefault();
                        openPermissions(
                          role
                        );
                      }
                    }}
                  >
                    <td>
                      <span className={role.rank === null ? "role-rank unranked" : "role-rank"}>
                        {role.rank === null
                          ? "Unranked"
                          : role.rank}
                      </span>
                    </td>
                    <td>
                      <div className="role-settings-role-cell">
                        <strong>{role.name}</strong>
                        <small>
                          {scopeLabel(role.dataScope)}
                          {role.isArchived ? " · Archived" : ""}
                        </small>
                      </div>
                    </td>
                    <td>
                      <span className="role-settings-description">
                        {role.description ||
                          "No description provided."}
                      </span>
                    </td>
                    <td className="role-settings-users-cell">
                      <span className="role-settings-user-count">
                        {role.affectedUserCount}
                      </span>
                    </td>
                    <td>
                      <div className="role-settings-operations">
                        <button
                          type="button"
                          className="role-settings-link-button"
                          onClick={(event) => {
                            event.stopPropagation();
                            openPermissions(role);
                          }}
                        >
                          {canEditRole(role)
                            ? "Set permissions"
                            : "View permissions"}
                        </button>

                        {canEditRole(role) && (
                          <button
                            type="button"
                            className="role-settings-link-button"
                            onClick={(event) => {
                              event.stopPropagation();
                              openEdit(role);
                            }}
                          >
                            Edit
                          </button>
                        )}

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
                  disabled={Boolean(editorRole?.isArchived)}
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                />
              </label>

              <label className="form-field">
                <span>Description</span>
                <textarea
                  value={draft.description}
                  maxLength={500}
                  disabled={Boolean(editorRole?.isArchived)}
                  rows={3}
                  placeholder="Describe the purpose and responsibility of this role"
                  onChange={(event) =>
                    setDraft((current) => ({
                      ...current,
                      description:
                        event.target.value,
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
                  disabled={Boolean(editorRole?.isArchived)}
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
                          disabled={Boolean(editorRole?.isArchived)}
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

              {editorRole?.isArchived ? (
                <div className="role-settings-impact">
                  This role is archived. Its details, permissions, and historical user links are preserved, but it does not grant access and cannot be assigned until reactivated.
                </div>
              ) : editorRole && editorRole.affectedUserCount > 0 ? (
                <div className="role-settings-impact">
                  Saving changes updates this role for {editorRole.affectedUserCount} current user{editorRole.affectedUserCount === 1 ? "" : "s"}.
                </div>
              ) : null}
            </div>

            <div className="role-settings-modal-footer">
              {isOwner &&
                editorMode === "EDIT" &&
                editorRole &&
                editorRole.systemKey !== "OWNER" && (
                editorRole.isArchived ? (
                  <button
                    type="button"
                    className="secondary-button role-settings-delete-action"
                    disabled={saving}
                    onClick={() => void reactivateEditorRole()}
                  >
                    {saving ? "Reactivating…" : "Reactivate role"}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="danger-button role-settings-delete-action"
                    disabled={saving}
                    title="Archive this role without deleting its history"
                    onClick={openEditorArchiveConfirmation}
                  >
                    Archive role
                  </button>
                )
              )}

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
                disabled={
                  saving ||
                  !draft.name.trim() ||
                  Boolean(editorRole?.isArchived)
                }
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
                <span className="page-eyebrow">Role details & permissions</span>
                <h3>{permissionRole.name}</h3>

                <div
                  className="role-settings-permission-meta"
                  aria-label="Role summary"
                >
                  <span>
                    Rank {permissionRole.rank ?? "Unranked"}
                  </span>
                  <span>
                    {scopeLabel(permissionRole.dataScope)}
                  </span>
                  <span>
                    {permissionRole.affectedUserCount} user{permissionRole.affectedUserCount === 1 ? "" : "s"}
                  </span>
                </div>

                <p className="role-settings-permission-description">
                  {permissionRole.description ||
                    "No description provided."}
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

            <div className="role-settings-permission-layout">
              <nav
                className="role-settings-permission-categories"
                aria-label="Permission categories"
              >
                <span className="role-settings-permission-nav-label">
                  Modules
                </span>

                <div className="role-settings-permission-category-list">
                  {permissionGroups.map(
                    ([label, group]) => {
                      const selectedCount =
                        group.filter(
                          (permission) =>
                            permissionDraft.includes(
                              permission.id
                            )
                        ).length;

                      const categoryName =
                        MODULE_LABELS[
                          label
                        ] ??
                        label;

                      const active =
                        label ===
                        activePermissionGroupLabelResolved;

                      return (
                        <button
                          key={label}
                          type="button"
                          className={
                            active
                              ? "role-settings-permission-category active"
                              : "role-settings-permission-category"
                          }
                          aria-pressed={active}
                          onClick={() =>
                            setActivePermissionGroupLabel(
                              label
                            )
                          }
                        >
                          <span
                            className="role-settings-permission-category-mark"
                            aria-hidden="true"
                          >
                            {categoryName
                              .slice(0, 1)
                              .toUpperCase()}
                          </span>

                          <span className="role-settings-permission-category-copy">
                            <strong>
                              {categoryName}
                            </strong>
                            <small>
                              Module access + {Math.max(0, group.length - 1)} action{Math.max(0, group.length - 1) === 1 ? "" : "s"}
                            </small>
                          </span>

                          <span className="role-settings-permission-count">
                            {selectedCount}/{group.length}
                          </span>
                        </button>
                      );
                    }
                  )}
                </div>
              </nav>

              <section className="role-settings-permission-panel">
                {activePermissionGroup ? (
                  <>
                    <header className="role-settings-permission-panel-header">
                      <div>
                        <h4>
                          {activePermissionGroupTitle}
                        </h4>
                        <p>
                          Configure this module from top to bottom: enable module access first, then choose the actions this role may perform.
                        </p>

                        {permissionRole?.isArchived ? (
                          <p className="role-settings-readonly-note">
                            This role is archived. Reactivate it before changing permissions.
                          </p>
                        ) : !canManageRoleSettings ? (
                          <p className="role-settings-readonly-note">
                            You have read-only access to Role Settings.
                          </p>
                        ) : !permissionRoleEditable ? (
                          <p className="role-settings-readonly-note">
                            You can only change roles ranked below your own, and never a role you hold.
                          </p>
                        ) : null}
                      </div>

                      <label className="role-settings-permission-select-all">
                        <input
                          type="checkbox"
                          checked={
                            activePermissionAllSelected
                          }
                          disabled={
                            !permissionRoleEditable ||
                            Boolean(permissionRole?.isArchived)
                          }
                          onChange={(event) =>
                            setPermissionGroupSelection(
                              activePermissionGroupPermissions,
                              event.target.checked
                            )
                          }
                        />
                        <span>
                          Enable all in module
                        </span>
                      </label>
                    </header>

                    {permissionRole.systemKey === "MODEL" && activePermissionGroupTitle === "Chat" && (
                      <p className="role-settings-readonly-note">
                        Models can access only their own private Creator chat. Other Chat permissions cannot open ordinary channels or other private conversations for a Model account.
                      </p>
                    )}

                    <div className="role-settings-permission-items">
                      <section className="role-settings-permission-section">
                        <div className="role-settings-permission-section-heading">
                          <span>
                            Access
                          </span>

                          <small>
                            Controls whether this role can enter the module.
                          </small>
                        </div>

                        {activeAccessPermissions.length >
                          0 ? (
                          activeAccessPermissions.map(
                            renderPermissionItem
                          )
                        ) : (
                          <div className="role-settings-permission-empty-inline">
                            No separate module-access permission is required.
                          </div>
                        )}
                      </section>

                      <section className="role-settings-permission-section">
                        <div className="role-settings-permission-section-heading">
                          <span>
                            Actions
                          </span>

                          <small>
                            Actions remain unavailable until their required access permissions are enabled.
                          </small>
                        </div>

                        {activeActionPermissions.length >
                          0 ? (
                          activeActionPermissions.map(
                            renderPermissionItem
                          )
                        ) : (
                          <div className="role-settings-permission-empty-inline">
                            This module has no additional actions.
                          </div>
                        )}
                      </section>
                    </div>
                  </>
                ) : (
                  <div className="role-settings-permission-empty">
                    No permission categories are available.
                  </div>
                )}
              </section>
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
              {permissionRoleEditable && !permissionRole.isArchived ? (
                <button
                  type="button"
                  className="primary-button"
                  disabled={saving}
                  onClick={() => void savePermissions()}
                >
                  {saving ? "Saving…" : "Save permissions"}
                </button>
              ) : (
                <button
                  type="button"
                  className="primary-button"
                  onClick={closePermissions}
                >
                  Close
                </button>
              )}
            </div>
          </section>
        </div>
      )}

      {archiveRole && isOwner && !archiveRole.isArchived && (
        <div className="role-settings-overlay">
          <section
            className="role-settings-modal role-settings-delete-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Archive role"
          >
            <div className="role-settings-modal-header">
              <div>
                <span className="page-eyebrow">Confirmation</span>
                <h3>Archive role?</h3>
              </div>
              <button
                type="button"
                className="role-settings-close"
                onClick={() => setArchiveRoleId(null)}
              >
                ×
              </button>
            </div>
            <div className="role-settings-modal-body">
              <p className="role-settings-delete-copy">
                Archive <strong>{archiveRole.name}</strong>? The role will stop granting access and will no longer be assignable, but its details, permissions, and {archiveRole.affectedUserCount} historical user link{archiveRole.affectedUserCount === 1 ? "" : "s"} will be retained.
              </p>
            </div>
            <div className="role-settings-modal-footer">
              <button
                type="button"
                className="secondary-button"
                disabled={saving}
                onClick={() => setArchiveRoleId(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={saving}
                onClick={() => void archiveSelectedRole()}
              >
                {saving ? "Archiving…" : "Archive role"}
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default RoleSettingsRankPage;
