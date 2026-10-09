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

import {
  publishLiveUpdate,
} from "./live-updates.js";

import {
  MANAGED_PERMISSION_KEYS,
  MANAGED_PERMISSION_KEY_SET,
  PERMISSION_DEPENDENCIES,
} from "../permissions/permission-catalog.js";

export type RoleBuilderInput = {
  name: string;

  description?:
    string | null;

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
    | "OWNER_REQUIRED"
    | "ROLE_NOT_FOUND"
    | "ROLE_NAME_IN_USE"
    | "INVALID_ROLE_RANK"
    | "INVALID_PERMISSIONS"
    | "OWNER_ROLE_IMMUTABLE"
    | "SYSTEM_ROLE_ARCHIVE_FORBIDDEN"
    | "ROLE_ARCHIVED"
    | "ROLE_NOT_ARCHIVED";

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

function requireRoleRead(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "roles.access"
    )
  ) {
    throw new RoleManagementError(
      "ROLE_MANAGEMENT_REQUIRED",
      "You do not have permission to view Role Settings."
    );
  }
}


function requireRoleManagement(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "roles.manage"
    )
  ) {
    throw new RoleManagementError(
      "ROLE_MANAGEMENT_REQUIRED",
      "You do not have permission to manage roles."
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

const rankedSystemRoleKeys =
  new Set([
    "OWNER",
    "OPS_MANAGER",
    "MANAGER",
    "QC",
    "CHATTER",
    "TRIAL_CHATTER",
  ]);

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
   * The six default operational roles are the
   * documented ranked chain. Owners may change
   * their numeric position, scope and permissions,
   * but they cannot remove one of these roles from
   * the chain entirely by clearing its rank.
   */
  if (
    rank ===
      null &&
    role.systemKey &&
    rankedSystemRoleKeys.has(
      role.systemKey
    )
  ) {
    throw new RoleManagementError(
      "INVALID_ROLE_RANK",
      "This default operational role must remain in the ranked chain."
    );
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

  const existingPermissions =
    await prisma.permission.findMany({
      where: {
        id: {
          in:
            normalized,
        },
      },

      select: {
        id:
          true,

        key:
          true,
      },
    });

  if (
    existingPermissions.length !==
    normalized.length
  ) {
    throw new RoleManagementError(
      "INVALID_PERMISSIONS",
      "One or more selected permissions are invalid."
    );
  }

  const unmanagedPermission =
    existingPermissions.find(
      (
        permission
      ) =>
        !MANAGED_PERMISSION_KEY_SET.has(
          permission.key
        )
    );

  if (
    unmanagedPermission
  ) {
    throw new RoleManagementError(
      "INVALID_PERMISSIONS",
      "One or more selected permissions belong to a legacy or unsupported permission."
    );
  }

  const selectedKeys =
    new Set(
      existingPermissions.map(
        (
          permission
        ) =>
          permission.key
      )
    );

  for (
    const permission
    of existingPermissions
  ) {
    const requirements =
      PERMISSION_DEPENDENCIES[
        permission.key
      ] ??
      [];

    const missingRequirement =
      requirements.find(
        (
          requiredKey
        ) =>
          !selectedKeys.has(
            requiredKey
          )
      );

    if (
      missingRequirement
    ) {
      throw new RoleManagementError(
        "INVALID_PERMISSIONS",
        `Permission "${permission.key}" requires "${missingRequirement}".`
      );
    }
  }

  return normalized;
}


const roleSelect = {
  id:
    true,

  systemKey:
    true,

  name:
    true,

  description:
    true,

  rank:
    true,

  dataScope:
    true,

  landingPath:
    true,

  isSystem:
    true,

  archivedAt:
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
  description: string | null;
  rank: number | null;
  dataScope: RoleDataScope;
  landingPath: string | null;
  isSystem: boolean;
  archivedAt: Date | null;
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

    description:
      role.description,

    rank:
      role.rank,

    dataScope:
      role.dataScope,

    landingPath:
      role.landingPath,

    isSystem:
      role.isSystem,

    archivedAt:
      role.archivedAt,

    isArchived:
      role.archivedAt !== null,

    affectedUserCount:
      role._count.userRoles,

    permissions:
      role.rolePermissions
        .map(
          (
            rolePermission
          ) =>
            rolePermission.permission
        )
        .filter(
          (
            permission
          ) =>
            MANAGED_PERMISSION_KEY_SET.has(
              permission.key
            )
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
  requireRoleRead(
    access
  );

  const [
    roles,
    permissions,
  ] =
    await Promise.all([
      prisma.role.findMany({
        where: {
          OR: [
            {
              systemKey:
                null,
            },
            {
              systemKey: {
                not:
                  "OWNER",
              },
            },
          ],
        },

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
        where: {
          key: {
            in:
              [...MANAGED_PERMISSION_KEYS],
          },
        },

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

        description:
          input.description?.trim() ||
          null,

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

        archivedAt:
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

  if (
    existingRole.systemKey ===
    "OWNER"
  ) {
    throw new RoleManagementError(
      "OWNER_ROLE_IMMUTABLE",
      "The Owner role is managed by the system and cannot be edited."
    );
  }

  if (
    existingRole.archivedAt
  ) {
    throw new RoleManagementError(
      "ROLE_ARCHIVED",
      "Reactivate this role before editing it."
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

  const permissionIds =
    await validatePermissionIds(
      input.permissionIds
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

            description:
              input.description?.trim() ||
              null,

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

  publishLiveUpdate({
    type:
      "access.changed",
    roleId:
      role.id,
  });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeRole(
    role
  );
}

export async function archiveRole(
  roleId:
    string,
  access:
    AccessContext
) {
  if (
    !isOwner(
      access
    )
  ) {
    throw new RoleManagementError(
      "OWNER_REQUIRED",
      "Only an Owner can archive a role."
    );
  }

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

        archivedAt:
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
      "SYSTEM_ROLE_ARCHIVE_FORBIDDEN",
      "Default system roles cannot be archived."
    );
  }

  if (
    role.archivedAt
  ) {
    throw new RoleManagementError(
      "ROLE_ARCHIVED",
      "This role is already archived."
    );
  }

  const archived =
    await prisma.role.update({
      where: {
        id:
          role.id,
      },

      data: {
        archivedAt:
          new Date(),
      },

      select:
        roleSelect,
    });

  publishLiveUpdate({
    type:
      "access.changed",
    roleId:
      role.id,
  });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeRole(
    archived
  );
}

export async function reactivateRole(
  roleId:
    string,
  access:
    AccessContext
) {
  if (
    !isOwner(
      access
    )
  ) {
    throw new RoleManagementError(
      "OWNER_REQUIRED",
      "Only an Owner can reactivate a role."
    );
  }

  const role =
    await prisma.role.findUnique({
      where: {
        id:
          roleId,
      },

      select: {
        id:
          true,

        isSystem:
          true,

        systemKey:
          true,

        archivedAt:
          true,
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
      "SYSTEM_ROLE_ARCHIVE_FORBIDDEN",
      "Default system roles cannot be archived or reactivated."
    );
  }

  if (
    !role.archivedAt
  ) {
    throw new RoleManagementError(
      "ROLE_NOT_ARCHIVED",
      "This role is already active."
    );
  }

  const reactivated =
    await prisma.role.update({
      where: {
        id:
          role.id,
      },

      data: {
        archivedAt:
          null,
      },

      select:
        roleSelect,
    });

  publishLiveUpdate({
    type:
      "access.changed",
    roleId:
      role.id,
  });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeRole(
    reactivated
  );
}
