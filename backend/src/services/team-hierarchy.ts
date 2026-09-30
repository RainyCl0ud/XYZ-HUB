import {
  Prisma,
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

export const ROOT_TEAM_GROUP_ID =
  "xyz_management_root";

export const ROOT_TEAM_GROUP_NAME =
  "XYZ Management";

const GROUP_COLOR_PATTERN =
  /^#[0-9A-F]{6}$/i;

export type TeamHierarchyErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "OWNER_REQUIRED"
  | "GROUP_NOT_FOUND"
  | "PARENT_GROUP_NOT_FOUND"
  | "GROUP_NAME_IN_USE"
  | "ROOT_GROUP_IMMUTABLE"
  | "GROUP_HAS_CHILDREN"
  | "GROUP_HAS_MEMBERS"
  | "GROUP_OUT_OF_SCOPE"
  | "USER_NOT_FOUND"
  | "OWNER_GROUP_ASSIGNMENT_FORBIDDEN"
  | "INVALID_GROUP_COLOR";

export class TeamHierarchyError extends Error {
  readonly code:
    TeamHierarchyErrorCode;

  constructor(
    code:
      TeamHierarchyErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "TeamHierarchyError";

    this.code =
      code;
  }
}

type GroupRecord = {
  id: string;
  name: string;
  parentId: string | null;
  isRoot: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    children: number;
    members: number;
  };
};

type GroupColorRow = {
  id: string;
  color: string | null;
};

function assertPeopleManagementAccess(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.manage"
    )
  ) {
    throw new TeamHierarchyError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to view team management."
    );
  }
}

function assertOwnerMutationAccess(
  access:
    AccessContext
) {
  assertPeopleManagementAccess(
    access
  );

  if (
    !isOwner(
      access
    )
  ) {
    throw new TeamHierarchyError(
      "OWNER_REQUIRED",
      "Only an Owner may change the organization hierarchy."
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

function normalizeColor(
  value:
    string | null
) {
  if (
    value ===
    null
  ) {
    return null;
  }

  const normalized =
    value
      .trim()
      .toUpperCase();

  if (
    !GROUP_COLOR_PATTERN.test(
      normalized
    )
  ) {
    throw new TeamHierarchyError(
      "INVALID_GROUP_COLOR",
      "Group colors must use a valid #RRGGBB hexadecimal value."
    );
  }

  return normalized;
}

function serializeGroup(
  group:
    GroupRecord,
  color:
    string | null =
      null
) {
  return {
    id:
      group.id,

    name:
      group.name,

    parentId:
      group.parentId,

    isRoot:
      group.isRoot,

    color,

    memberCount:
      group._count
        .members,

    childCount:
      group._count
        .children,

    createdAt:
      group.createdAt,

    updatedAt:
      group.updatedAt,
  };
}

async function loadGroupColors() {
  try {
    const rows =
      await prisma.$queryRaw<
        GroupColorRow[]
      >(
        Prisma.sql`
          SELECT "id", "color"
          FROM "TeamGroup"
        `
      );

    return new Map(
      rows.map(
        (
          row
        ) => [
          row.id,
          row.color,
        ]
      )
    );
  } catch (
    error
  ) {
    /*
     * Keep local development usable before the migration has
     * been applied. Staging/production migrations will create
     * the column before the updated application starts.
     */
    console.warn(
      "Unable to load team group colors; falling back to no colors:",
      error
    );

    return new Map<
      string,
      string | null
    >();
  }
}

async function loadAllGroups() {
  return prisma.teamGroup.findMany({
    select: {
      id:
        true,

      name:
        true,

      parentId:
        true,

      isRoot:
        true,

      createdAt:
        true,

      updatedAt:
        true,

      _count: {
        select: {
          children:
            true,

          members:
            true,
        },
      },
    },

    orderBy: [
      {
        isRoot:
          "desc",
      },

      {
        name:
          "asc",
      },
    ],
  });
}

function collectDescendantGroupIds(
  groups:
    {
      id:
        string;

      parentId:
        string | null;
    }[],
  rootGroupId:
    string
) {
  const result =
    new Set<string>([
      rootGroupId,
    ]);

  let changed =
    true;

  while (
    changed
  ) {
    changed =
      false;

    for (
      const group
      of groups
    ) {
      if (
        group.parentId &&
        result.has(
          group.parentId
        ) &&
        !result.has(
          group.id
        )
      ) {
        result.add(
          group.id
        );

        changed =
          true;
      }
    }
  }

  return result;
}

async function getScopedTeamGroupIds(
  access:
    AccessContext
) {
  const groups =
    await prisma.teamGroup.findMany({
      select: {
        id:
          true,

        parentId:
          true,
      },
    });

  if (
    isOwner(
      access
    ) ||
    access.effectiveDataScope ===
      RoleDataScope.ALL
  ) {
    return new Set(
      groups.map(
        (
          group
        ) =>
          group.id
      )
    );
  }

  if (
    !access.teamGroupId
  ) {
    return new Set<string>();
  }

  if (
    access.effectiveDataScope ===
      RoleDataScope.SELF
  ) {
    return new Set([
      access.teamGroupId,
    ]);
  }

  return collectDescendantGroupIds(
    groups,
    access.teamGroupId
  );
}

export async function getVisibleTeamGroupIds(
  access:
    AccessContext
) {
  assertPeopleManagementAccess(
    access
  );

  return getScopedTeamGroupIds(
    access
  );
}

export async function canAccessTeamGroup(
  access:
    AccessContext,
  teamGroupId:
    string | null
) {
  if (
    !teamGroupId
  ) {
    return isOwner(
      access
    );
  }

  const visibleIds =
    await getScopedTeamGroupIds(
      access
    );

  return visibleIds.has(
    teamGroupId
  );
}

export async function listTeamGroups(
  access:
    AccessContext
) {
  assertPeopleManagementAccess(
    access
  );

  const [
    groups,
    visibleIds,
    colors,
  ] =
    await Promise.all([
      loadAllGroups(),
      getVisibleTeamGroupIds(
        access
      ),
      loadGroupColors(),
    ]);

  return {
    rootGroupId:
      ROOT_TEAM_GROUP_ID,

    groups:
      groups
        .filter(
          (
            group
          ) =>
            visibleIds.has(
              group.id
            )
        )
        .map(
          (
            group
          ) =>
            serializeGroup(
              group,
              colors.get(
                group.id
              ) ??
                null
            )
        ),
  };
}

async function ensureUniqueSiblingName(
  name:
    string,
  parentId:
    string,
  excludeGroupId?:
    string
) {
  const siblings =
    await prisma.teamGroup.findMany({
      where: {
        parentId,
      },

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
    siblings.find(
      (
        group
      ) =>
        group.id !==
          excludeGroupId &&
        group.name
          .trim()
          .toLocaleLowerCase() ===
          normalized
    );

  if (
    duplicate
  ) {
    throw new TeamHierarchyError(
      "GROUP_NAME_IN_USE",
      "Another subgroup under this parent already uses that name."
    );
  }
}

async function loadGroupRecord(
  groupId:
    string
) {
  return prisma.teamGroup.findUnique({
    where: {
      id:
        groupId,
    },

    select: {
      id:
        true,

      name:
        true,

      parentId:
        true,

      isRoot:
        true,

      createdAt:
        true,

      updatedAt:
        true,

      _count: {
        select: {
          children:
            true,

          members:
            true,
        },
      },
    },
  });
}

export async function createTeamGroup(
  input: {
    name:
      string;

    parentGroupId:
      string;
  },
  access:
    AccessContext
) {
  assertOwnerMutationAccess(
    access
  );

  const name =
    normalizeName(
      input.name
    );

  const parent =
    await prisma.teamGroup.findUnique({
      where: {
        id:
          input.parentGroupId,
      },

      select: {
        id:
          true,
      },
    });

  if (
    !parent
  ) {
    throw new TeamHierarchyError(
      "PARENT_GROUP_NOT_FOUND",
      "The parent group no longer exists."
    );
  }

  await ensureUniqueSiblingName(
    name,
    parent.id
  );

  const group =
    await prisma.teamGroup.create({
      data: {
        name,

        parentId:
          parent.id,

        isRoot:
          false,
      },

      select: {
        id:
          true,

        name:
          true,

        parentId:
          true,

        isRoot:
          true,

        createdAt:
          true,

        updatedAt:
          true,

        _count: {
          select: {
            children:
              true,

            members:
              true,
          },
        },
      },
    });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeGroup(
    group
  );
}

export async function renameTeamGroup(
  groupId:
    string,
  nameInput:
    string,
  access:
    AccessContext
) {
  assertOwnerMutationAccess(
    access
  );

  const existing =
    await prisma.teamGroup.findUnique({
      where: {
        id:
          groupId,
      },

      select: {
        id:
          true,

        parentId:
          true,

        isRoot:
          true,
      },
    });

  if (
    !existing
  ) {
    throw new TeamHierarchyError(
      "GROUP_NOT_FOUND",
      "The group no longer exists."
    );
  }

  if (
    existing.isRoot
  ) {
    throw new TeamHierarchyError(
      "ROOT_GROUP_IMMUTABLE",
      "The XYZ Management root group cannot be renamed."
    );
  }

  if (
    !existing.parentId
  ) {
    throw new TeamHierarchyError(
      "PARENT_GROUP_NOT_FOUND",
      "The group does not have a valid parent."
    );
  }

  const name =
    normalizeName(
      nameInput
    );

  await ensureUniqueSiblingName(
    name,
    existing.parentId,
    groupId
  );

  const group =
    await prisma.teamGroup.update({
      where: {
        id:
          groupId,
      },

      data: {
        name,
      },

      select: {
        id:
          true,

        name:
          true,

        parentId:
          true,

        isRoot:
          true,

        createdAt:
          true,

        updatedAt:
          true,

        _count: {
          select: {
            children:
              true,

            members:
              true,
          },
        },
      },
    });

  const colors =
    await loadGroupColors();

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeGroup(
    group,
    colors.get(
      group.id
    ) ??
      null
  );
}

export async function setTeamGroupColor(
  groupId:
    string,
  colorInput:
    string | null,
  access:
    AccessContext
) {
  assertOwnerMutationAccess(
    access
  );

  const group =
    await loadGroupRecord(
      groupId
    );

  if (
    !group
  ) {
    throw new TeamHierarchyError(
      "GROUP_NOT_FOUND",
      "The group no longer exists."
    );
  }

  if (
    group.isRoot
  ) {
    throw new TeamHierarchyError(
      "ROOT_GROUP_IMMUTABLE",
      "The XYZ Management root group uses the system accent and cannot set a custom color."
    );
  }

  const color =
    normalizeColor(
      colorInput
    );

  await prisma.$executeRaw(
    Prisma.sql`
      UPDATE "TeamGroup"
      SET "color" = ${color},
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = ${groupId}
    `
  );

  const updated =
    await loadGroupRecord(
      groupId
    );

  if (
    !updated
  ) {
    throw new TeamHierarchyError(
      "GROUP_NOT_FOUND",
      "The group no longer exists."
    );
  }

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeGroup(
    updated,
    color
  );
}

export async function deleteTeamGroup(
  groupId:
    string,
  access:
    AccessContext
) {
  assertOwnerMutationAccess(
    access
  );

  const group =
    await prisma.teamGroup.findUnique({
      where: {
        id:
          groupId,
      },

      select: {
        id:
          true,

        name:
          true,

        isRoot:
          true,

        _count: {
          select: {
            children:
              true,

            members:
              true,
          },
        },
      },
    });

  if (
    !group
  ) {
    throw new TeamHierarchyError(
      "GROUP_NOT_FOUND",
      "The group no longer exists."
    );
  }

  if (
    group.isRoot
  ) {
    throw new TeamHierarchyError(
      "ROOT_GROUP_IMMUTABLE",
      "The XYZ Management root group cannot be deleted."
    );
  }

  if (
    group._count.children >
    0
  ) {
    throw new TeamHierarchyError(
      "GROUP_HAS_CHILDREN",
      "Move or delete this group's subgroups before deleting it."
    );
  }

  if (
    group._count.members >
    0
  ) {
    throw new TeamHierarchyError(
      "GROUP_HAS_MEMBERS",
      "Move this group's people to another group before deleting it."
    );
  }

  await prisma.teamGroup.delete({
    where: {
      id:
        group.id,
    },
  });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return {
    id:
      group.id,

    name:
      group.name,
  };
}

export async function assignPersonToTeamGroup(
  input: {
    userId:
      string;

    groupId:
      string;
  },
  access:
    AccessContext
) {
  assertOwnerMutationAccess(
    access
  );

  const [
    user,
    group,
  ] =
    await Promise.all([
      prisma.user.findUnique({
        where: {
          id:
            input.userId,
        },

        select: {
          id:
            true,

          name:
            true,

          roleMemberships: {
            select: {
              role: {
                select: {
                  systemKey:
                    true,
                },
              },
            },
          },
        },
      }),

      prisma.teamGroup.findUnique({
        where: {
          id:
            input.groupId,
        },

        select: {
          id:
            true,

          name:
            true,
        },
      }),
    ]);

  if (
    !user
  ) {
    throw new TeamHierarchyError(
      "USER_NOT_FOUND",
      "The person no longer exists."
    );
  }

  if (
    !group
  ) {
    throw new TeamHierarchyError(
      "GROUP_NOT_FOUND",
      "The selected group no longer exists."
    );
  }

  if (
    user.roleMemberships.some(
      (
        membership
      ) =>
        membership.role
          .systemKey ===
        "OWNER"
    )
  ) {
    throw new TeamHierarchyError(
      "OWNER_GROUP_ASSIGNMENT_FORBIDDEN",
      "The Owner is not managed as a team employee."
    );
  }

  const updated =
    await prisma.user.update({
      where: {
        id:
          user.id,
      },

      data: {
        teamGroupId:
          group.id,
      },

      select: {
        id:
          true,

        name:
          true,

        teamGroup: {
          select: {
            id:
              true,

            name:
              true,

            parentId:
              true,
          },
        },
      },
    });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return updated;
}
