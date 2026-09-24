import {
  RoleDataScope,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

export type RoleBuilderInput = {
  name: string;

  rank:
    number | null;

  dataScope:
    RoleDataScope;

  permissionIds:
    string[];
};

export class RoleManagementError
  extends Error {
  code:
    | "ROLE_MANAGEMENT_REQUIRED"
    | "ROLE_NOT_FOUND"
    | "ROLE_NAME_IN_USE"
    | "INVALID_ROLE_RANK"
    | "INVALID_PERMISSIONS"
    | "SYSTEM_ROLE_DELETE_FORBIDDEN"
    | "ROLE_IN_USE";

  constructor(
    code:
      RoleManagementError["code"],
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "RoleManagementError";

    this.code =
      code;
  }
}

function requireRoleManagement(
  access:
    AccessContext
) {
  if (
    !isOwner(
      access
    ) ||
    !hasPermission(
      access,
      "roles.manage"
    )
  ) {
    throw new RoleManagementError(
      "ROLE_MANAGEMENT_REQUIRED",
      "Owner access with role-management permission is required."
    );
  }
}

function normalizeName(
  value:
    string
) {
  return value
    .trim()
    .replace(
      /\s+/g,
      " "
    );
}

function normalizePermissionIds(
  permissionIds:
    string[]
) {
  return [
    ...new Set(
      permissionIds
    ),
  ];
}

function validateRank(
  role:
    {
      systemKey:
        string | null;

      isSystem:
        boolean;
    },
  rank:
    number | null
) {
  /*
   * Owner remains the root of the ranked chain.
   * No other role can be equal to or above Owner.
   */
  if (
    role.systemKey ===
    "OWNER"
  ) {
    if (
      rank !==
      1
    ) {
      throw new RoleManagementError(
        "INVALID_ROLE_RANK",
        "Owner must remain rank 1."
      );
    }

    return;
  }

  /*
   * Existing unranked system roles may remain
   * unranked. Custom roles must slot into the
   * ranked chain.
   */
  if (
    rank ===
    null
  ) {
    if (
      role.isSystem
    ) {
      return;
    }

    throw new RoleManagementError(
      "INVALID_ROLE_RANK",
      "Custom roles require a rank."
    );
  }

  if (
    !Number.isInteger(
      rank
    ) ||
    rank < 2 ||
    rank > 999
  ) {
    throw new RoleManagementError(
      "INVALID_ROLE_RANK",
      "Role rank must be a whole number from 2 to 999."
    );
  }
}

async function ensureUniqueName(
  name:
    string,
  excludeRoleId?:
    string
) {
  const roles =
    await prisma.role.findMany({
      select: {
        id:
          true,

        name:
          true,
      },
    });

  const normalized =
    name.toLocaleLowerCase();

  const duplicate =
    roles.find(
      (
        role
      ) =>
        role.id !==
          excludeRoleId &&
        role.name
          .trim()
          .toLocaleLowerCase() ===
          normalized
    );

  if (
    duplicate
  ) {
    throw new RoleManagementError(
      "ROLE_NAME_IN_USE",
      "Another role already uses that name."
    );
  }
}

async function validatePermissionIds(
  permissionIds:
    string[]
) {
  const normalized =
    normalizePermissionIds(
      permissionIds
    );

  if (
    normalized.length ===
    0
  ) {
    return normalized;
  }

  const existingCount =
    await prisma.permission.count({
      where: {
        id: {
          in:
            normalized,
        },
      },
    });

  if (
    existingCount !==
    normalized.length
  ) {
    throw new RoleManagementError(
      "INVALID_PERMISSIONS",
      "One or more selected permissions are invalid."
    );
  }

  return normalized;
}

function ensureOwnerBuilderPermission(
  systemKey:
    string | null,
  permissionIds:
    string[],
  roleManagePermissionId:
    string | undefined
) {
  if (
    systemKey !==
      "OWNER" ||
    !roleManagePermissionId
  ) {
    return permissionIds;
  }

  return [
    ...new Set([
      ...permissionIds,
      roleManagePermissionId,
    ]),
  ];
}

const roleSelect = {
  id:
    true,

  systemKey:
    true,

  name:
    true,

  rank:
    true,

  dataScope:
    true,

  landingPath:
    true,

  isSystem:
    true,

  createdAt:
    true,

  updatedAt:
    true,

  rolePermissions: {
    select: {
      permission: {
        select: {
          id:
            true,

          key:
            true,

          name:
            true,

          description:
            true,

          pageKey:
            true,

          categoryKey:
            true,

          actionKey:
            true,
        },
      },
    },

    orderBy: {
      permission: {
        key:
          "asc" as const,
      },
    },
  },

  _count: {
    select: {
      userRoles:
        true,
    },
  },
} as const;

type RoleWithBuilderData = {
  id: string;
  systemKey: string | null;
  name: string;
  rank: number | null;
  dataScope: RoleDataScope;
  landingPath: string | null;
  isSystem: boolean;
  createdAt: Date;
  updatedAt: Date;
  rolePermissions: {
    permission: {
      id: string;
      key: string;
      name: string;
      description: string | null;
      pageKey: string;
      categoryKey: string | null;
      actionKey: string;
    };
  }[];
  _count: {
    userRoles: number;
  };
};

function serializeRole(
  role:
    RoleWithBuilderData
) {
  return {
    id:
      role.id,

    systemKey:
      role.systemKey,

    name:
      role.name,

    rank:
      role.rank,

    dataScope:
      role.dataScope,

    landingPath:
      role.landingPath,

    isSystem:
      role.isSystem,

    affectedUserCount:
      role._count.userRoles,

    permissions:
      role.rolePermissions.map(
        (
          rolePermission
        ) =>
          rolePermission.permission
      ),

    createdAt:
      role.createdAt,

    updatedAt:
      role.updatedAt,
  };
}

export async function getRoleBuilderData(
  access:
    AccessContext
) {
  requireRoleManagement(
    access
  );

  const [
    roles,
    permissions,
  ] =
    await Promise.all([
      prisma.role.findMany({
        select:
          roleSelect,

        orderBy: [
          {
            rank:
              "asc",
          },

          {
            name:
              "asc",
          },
        ],
      }),

      prisma.permission.findMany({
        select: {
          id:
            true,

          key:
            true,

          name:
            true,

          description:
            true,

          pageKey:
            true,

          categoryKey:
            true,

          actionKey:
            true,
        },

        orderBy: [
          {
            pageKey:
              "asc",
          },

          {
            categoryKey:
              "asc",
          },

          {
            name:
              "asc",
          },
        ],
      }),
    ]);

  return {
    roles:
      roles.map(
        (
          role
        ) =>
          serializeRole(
            role
          )
      ),

    permissions,

    dataScopes:
      Object.values(
        RoleDataScope
      ),
  };
}

export async function createRole(
  input:
    RoleBuilderInput,
  access:
    AccessContext
) {
  requireRoleManagement(
    access
  );

  const name =
    normalizeName(
      input.name
    );

  await ensureUniqueName(
    name
  );

  validateRank(
    {
      systemKey:
        null,

      isSystem:
        false,
    },
    input.rank
  );

  const permissionIds =
    await validatePermissionIds(
      input.permissionIds
    );

  const role =
    await prisma.role.create({
      data: {
        systemKey:
          null,

        name,

        rank:
          input.rank,

        dataScope:
          input.dataScope,

        isSystem:
          false,

        landingPath:
          null,

        rolePermissions: {
          create:
            permissionIds.map(
              (
                permissionId
              ) => ({
                permissionId,
              })
            ),
        },
      },

      select:
        roleSelect,
    });

  return serializeRole(
    role
  );
}

export async function updateRole(
  roleId:
    string,
  input:
    RoleBuilderInput,
  access:
    AccessContext
) {
  requireRoleManagement(
    access
  );

  const existingRole =
    await prisma.role.findUnique({
      where: {
        id:
          roleId,
      },

      select: {
        id:
          true,

        systemKey:
          true,

        isSystem:
          true,
      },
    });

  if (
    !existingRole
  ) {
    throw new RoleManagementError(
      "ROLE_NOT_FOUND",
      "Role not found."
    );
  }

  const name =
    normalizeName(
      input.name
    );

  await ensureUniqueName(
    name,
    roleId
  );

  validateRank(
    existingRole,
    input.rank
  );

  let permissionIds =
    await validatePermissionIds(
      input.permissionIds
    );

  const roleManagePermission =
    await prisma.permission.findUnique({
      where: {
        key:
          "roles.manage",
      },

      select: {
        id:
          true,
      },
    });

  permissionIds =
    ensureOwnerBuilderPermission(
      existingRole.systemKey,
      permissionIds,
      roleManagePermission?.id
    );

  const role =
    await prisma.$transaction(
      async (
        tx
      ) => {
        await tx.rolePermission.deleteMany({
          where: {
            roleId,
          },
        });

        return tx.role.update({
          where: {
            id:
              roleId,
          },

          data: {
            name,

            rank:
              input.rank,

            dataScope:
              input.dataScope,

            rolePermissions: {
              create:
                permissionIds.map(
                  (
                    permissionId
                  ) => ({
                    permissionId,
                  })
                ),
            },
          },

          select:
            roleSelect,
        });
      }
    );

  return serializeRole(
    role
  );
}

export async function deleteRole(
  roleId:
    string,
  access:
    AccessContext
) {
  requireRoleManagement(
    access
  );

  const role =
    await prisma.role.findUnique({
      where: {
        id:
          roleId,
      },

      select: {
        id:
          true,

        name:
          true,

        isSystem:
          true,

        systemKey:
          true,

        _count: {
          select: {
            userRoles:
              true,
          },
        },
      },
    });

  if (
    !role
  ) {
    throw new RoleManagementError(
      "ROLE_NOT_FOUND",
      "Role not found."
    );
  }

  if (
    role.isSystem ||
    role.systemKey
  ) {
    throw new RoleManagementError(
      "SYSTEM_ROLE_DELETE_FORBIDDEN",
      "Default system roles cannot be deleted."
    );
  }

  if (
    role._count.userRoles >
    0
  ) {
    throw new RoleManagementError(
      "ROLE_IN_USE",
      role._count.userRoles +
        " people still hold this role. Remove the role from those people before deleting it."
    );
  }

  await prisma.role.delete({
    where: {
      id:
        roleId,
    },
  });

  return {
    id:
      role.id,

    name:
      role.name,
  };
}
