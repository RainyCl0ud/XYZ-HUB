import {
  RoleDataScope,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  OWNER_ONLY_PERMISSION_KEY_SET,
  PERMISSION_DEPENDENCIES,
} from "../permissions/permission-catalog.js";

export type AccessContext = {
  userId: string;

  roles: {
    id: string;
    systemKey: string | null;
    name: string;
    rank: number | null;
    dataScope: RoleDataScope;
  }[];

  highestRank: number | null;

  teamGroupId: string | null;

  effectiveDataScope: RoleDataScope;

  permissions: Set<string>;

  assignedModelIds: string[];

  canSeeAllModels: boolean;
};

/*
 * Lower numeric rank = higher authority.
 *
 * Owner = 1
 * Ops Manager = 2
 * Manager = 3
 * ...
 *
 * Unranked roles do not participate in the
 * chain-of-command rank calculation.
 */
export function getHighestRank(
  roles: {
    rank: number | null;
  }[]
): number | null {
  const rankedRoles = roles
    .map((role) => role.rank)
    .filter(
      (rank): rank is number =>
        rank !== null
    );

  if (rankedRoles.length === 0) {
    return null;
  }

  return Math.min(...rankedRoles);
}

/*
 * Roles stack.
 *
 * If any role grants a broader data scope,
 * use the broadest effective scope.
 */
export function getEffectiveDataScope(
  roles: {
    dataScope: RoleDataScope;
  }[]
): RoleDataScope {
  if (
    roles.some(
      (role) =>
        role.dataScope ===
        RoleDataScope.ALL
    )
  ) {
    return RoleDataScope.ALL;
  }

  if (
    roles.some(
      (role) =>
        role.dataScope ===
        RoleDataScope.SELF_AND_TEAM
    )
  ) {
    return RoleDataScope.SELF_AND_TEAM;
  }

  return RoleDataScope.SELF;
}

export async function getAccessContext(
  userId: string
): Promise<AccessContext> {
  const user =
    await prisma.user.findUnique({
      where: {
        id: userId,
      },

      select: {
        id: true,
        teamGroupId: true,

        roleMemberships: {
          select: {
            role: {
              select: {
                id: true,
                systemKey: true,
                name: true,
                rank: true,
                dataScope: true,

                rolePermissions: {
                  select: {
                    permission: {
                      select: {
                        key: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },

        modelAssignments: {
          select: {
            modelId: true,
          },
        },
      },
    });

  if (!user) {
    throw new Error(
      "User not found."
    );
  }

  const roles =
    user.roleMemberships.map(
      ({ role }) => ({
        id: role.id,
        systemKey: role.systemKey,
        name: role.name,
        rank: role.rank,
        dataScope: role.dataScope,
      })
    );

  const permissions = new Set<string>();

  for (
    const membership
    of user.roleMemberships
  ) {
    for (
      const rolePermission
      of membership.role.rolePermissions
    ) {
      permissions.add(
        rolePermission.permission.key
      );
    }
  }

  const systemKeys = new Set(
    roles
      .map(
        (role) => role.systemKey
      )
      .filter(
        (key): key is string =>
          key !== null
      )
  );

  /*
   * Effective permissions now come from Role Settings.
   * Parent-child requirements are enforced by hasPermission().
   */

  /*
   * Per the build brief:
   *
   * Owner, Ops Manager and Dev see every model
   * without needing individual assignments.
   */
  const canSeeAllModels =
    systemKeys.has("OWNER") ||
    systemKeys.has("OPS_MANAGER") ||
    systemKeys.has("DEV");

  const assignedModelIds = [
    ...new Set(
      user.modelAssignments.map(
        (assignment) =>
          assignment.modelId
      )
    ),
  ];

  return {
    userId: user.id,
    roles,
    highestRank:
      getHighestRank(roles),
    teamGroupId:
      user.teamGroupId,
    effectiveDataScope:
      getEffectiveDataScope(roles),
    permissions,
    assignedModelIds,
    canSeeAllModels,
  };
}

function hasPermissionWithDependencies(
  access: AccessContext,
  permissionKey: string,
  visiting: Set<string>
): boolean {
  if (
    !access.permissions.has(
      permissionKey
    )
  ) {
    return false;
  }

  if (
    visiting.has(
      permissionKey
    )
  ) {
    /*
     * Dependency cycles are invalid configuration.
     * Fail closed rather than accidentally granting access.
     */
    return false;
  }

  visiting.add(
    permissionKey
  );

  const requirements =
    PERMISSION_DEPENDENCIES[
      permissionKey
    ] ??
    [];

  const allowed =
    requirements.every(
      (
        requiredKey
      ) =>
        hasPermissionWithDependencies(
          access,
          requiredKey,
          visiting
        )
    );

  visiting.delete(
    permissionKey
  );

  return allowed;
}


export function hasPermission(
  access: AccessContext,
  permissionKey: string
): boolean {
  if (
    OWNER_ONLY_PERMISSION_KEY_SET.has(
      permissionKey
    )
  ) {
    return isOwner(
      access
    );
  }

  return hasPermissionWithDependencies(
    access,
    permissionKey,
    new Set<string>()
  );
}

/*
 * Example:
 *
 * Owner rank 1 can assign Manager rank 3.
 * Manager rank 3 can assign Chatter rank 5.
 * Manager rank 3 cannot assign Owner rank 1.
 *
 * Unranked roles are handled separately because,
 * according to the brief, they are Owner-only.
 */
function canAssignRankedRole(
  access: AccessContext,
  targetRoleRank: number | null
): boolean {
  if (
    access.highestRank === null ||
    targetRoleRank === null
  ) {
    return false;
  }

  return (
    targetRoleRank >
    access.highestRank
  );
}

export function isOwner(
  access: AccessContext
): boolean {
  return access.roles.some(
    (role) =>
      role.systemKey === "OWNER"
  );
}

export function canManageRoleTarget(
  access: AccessContext,
  targetRole: {
    systemKey: string | null;
    rank: number | null;
  }
): boolean {
  /*
   * Protected system roles remain manageable only by Owner.
   *
   * Ordinary ranked roles follow the existing authority chain.
   * This helper deliberately contains no action permission check:
   * callers must first prove the specific action being performed.
   */
  const ownerOnlyRoles =
    new Set([
      "OWNER",
      "OPS_MANAGER",
      "DEV",
      "ACCOUNTANT",
      "MODEL",
      "GENERAL_STAFF",
    ]);

  if (
    targetRole.systemKey &&
    ownerOnlyRoles.has(
      targetRole.systemKey
    )
  ) {
    return isOwner(
      access
    );
  }

  return canAssignRankedRole(
    access,
    targetRole.rank
  );
}


export function canAssignRole(
  access: AccessContext,
  targetRole: {
    systemKey: string | null;
    rank: number | null;
  }
): boolean {
  /*
   * Creating an employee necessarily includes assigning an
   * initial role. Updating an existing employee's roles requires
   * the dedicated Assign Roles permission.
   */
  if (
    !hasPermission(
      access,
      "people.assign_roles"
    ) &&
    !hasPermission(
      access,
      "people.create"
    )
  ) {
    return false;
  }

  return canManageRoleTarget(
    access,
    targetRole
  );
}


export function canInviteRole(
  access: AccessContext,
  targetRole: {
    systemKey: string | null;
    rank: number | null;
  }
): boolean {
  if (
    !hasPermission(
      access,
      "people.create"
    ) ||
    access.highestRank ===
      null ||
    access.highestRank >=
      4 ||
    targetRole.rank ===
      null
  ) {
    return false;
  }

  return (
    targetRole.rank >
    access.highestRank
  );
}

export function canAccessModel(
  access: AccessContext,
  modelId: string
): boolean {
  if (access.canSeeAllModels) {
    return true;
  }

  return (
    access.assignedModelIds.includes(
      modelId
    )
  );
}