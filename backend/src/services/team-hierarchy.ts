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

export const ROOT_TEAM_GROUP_ID =
  "xyz_management_root";

export const ROOT_TEAM_GROUP_NAME =
  "XYZ Management";

const GROUP_COLOR_PATTERN =
  /^#[0-9A-F]{6}$/i;

const GROUP_COLOR_AUDIT_ACTION =
  "team_group.color_set";

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
  | "INVALID_GROUP_COLOR"
  | "INVALID_GROUP_ORDER";

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
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
  _count: {
    children: number;
    members: number;
  };
};

function assertPeopleManagementAccess(
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.access"
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

    sortOrder: group.sortOrder,

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
  const events =
    await prisma.auditEvent.findMany({
      where: {
        action:
          GROUP_COLOR_AUDIT_ACTION,

        success:
          true,

        targetType:
          "team_group",
      },

      orderBy: {
        occurredAt:
          "desc",
      },

      select: {
        targetId:
          true,

        metadata:
          true,
      },
    });

  const colors =
    new Map<
      string,
      string | null
    >();

  for (
    const event
    of events
  ) {
    if (
      !event.targetId ||
      colors.has(
        event.targetId
      )
    ) {
      continue;
    }

    const metadata =
      event.metadata;

    if (
      metadata &&
      typeof metadata ===
        "object" &&
      !Array.isArray(
        metadata
      ) &&
      "color" in metadata
    ) {
      const value =
        metadata.color;

      colors.set(
        event.targetId,
        typeof value ===
          "string"
          ? value
          : null
      );
    }
  }

  return colors;
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

      sortOrder: true,

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
        sortOrder: "asc",
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

      sortOrder: true,

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

  const siblingCount = await prisma.teamGroup.count({ where: { parentId: parent.id } });

  const group =
    await prisma.teamGroup.create({
      data: {
        name,

        parentId:
          parent.id,

        isRoot:
          false,
        sortOrder: siblingCount,
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

        sortOrder: true,

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

        sortOrder: true,

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

  await prisma.auditEvent.create({
    data: {
      action:
        GROUP_COLOR_AUDIT_ACTION,

      success:
        true,

      statusCode:
        200,

      actorUserId:
        access.userId,

      targetType:
        "team_group",

      targetId:
        groupId,

      metadata: {
        color,
      },
    },
  });

  publishLiveUpdate({
    type:
      "people.changed",
  });

  return serializeGroup(
    group,
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
  input: { userId: string; groupId: string },
  access: AccessContext
) {
  assertPeopleManagementAccess(access);
  const owner = isOwner(access);
  if (!owner && (
    !hasPermission(access, "people.assign_roles") ||
    access.highestRank === null ||
    access.highestRank > 3
  )) {
    throw new TeamHierarchyError(
      "OWNER_REQUIRED",
      "Only an Owner or an authorized Manager may transfer employees."
    );
  }

  if (input.userId === access.userId) {
    throw new TeamHierarchyError(
      "GROUP_OUT_OF_SCOPE",
      "You cannot transfer your own account."
    );
  }

  const [user, group, visibleIds] = await Promise.all([
    prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        name: true,
        teamGroupId: true,
        roleMemberships: {
          where: { role: { archivedAt: null } },
          select: {
            role: { select: { systemKey: true, rank: true } },
          },
        },
      },
    }),
    prisma.teamGroup.findUnique({
      where: { id: input.groupId },
      select: { id: true, name: true },
    }),
    getVisibleTeamGroupIds(access),
  ]);

  if (!user) {
    throw new TeamHierarchyError("USER_NOT_FOUND", "The person no longer exists.");
  }
  if (!group) {
    throw new TeamHierarchyError("GROUP_NOT_FOUND", "The selected group no longer exists.");
  }
  if (user.roleMemberships.some(({ role }) => role.systemKey === "OWNER")) {
    throw new TeamHierarchyError(
      "OWNER_GROUP_ASSIGNMENT_FORBIDDEN",
      "The Owner is not managed as a team employee."
    );
  }
  if (!visibleIds.has(group.id) || (
    !owner && (!user.teamGroupId || !visibleIds.has(user.teamGroupId))
  )) {
    throw new TeamHierarchyError(
      "GROUP_OUT_OF_SCOPE",
      "Both the current and destination teams must be within your authorized hierarchy."
    );
  }
  if (!owner && user.roleMemberships.some(({ role }) =>
    role.rank === null || role.rank <= (access.highestRank ?? 999)
  )) {
    throw new TeamHierarchyError(
      "GROUP_OUT_OF_SCOPE",
      "You cannot transfer someone with an equal or higher role."
    );
  }

  const previousTeamId = user.teamGroupId;
  if (previousTeamId === group.id) {
    return prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: {
        id: true, name: true,
        teamGroup: { select: { id: true, name: true, parentId: true } },
      },
    });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const person = await tx.user.update({
      where: { id: user.id },
      data: { teamGroupId: group.id },
      select: {
        id: true, name: true,
        teamGroup: { select: { id: true, name: true, parentId: true } },
      },
    });
    await tx.auditEvent.create({
      data: {
        action: "people.team_changed",
        success: true,
        statusCode: 200,
        actorUserId: access.userId,
        targetType: "user",
        targetId: user.id,
        metadata: { previousTeamId, newTeamId: group.id },
      },
    });
    return person;
  });

  publishLiveUpdate({ type: "people.changed" });
  return updated;
}

/**
 * Owner-only sibling reordering. The payload must contain every current sibling,
 * exactly once. Validate and write in one transaction to avoid partial orders.
 */
export async function reorderTeamGroups(
  parentId: string,
  orderedIds: string[],
  access: AccessContext
) {
  assertOwnerMutationAccess(access);
  if (!parentId || !Array.isArray(orderedIds) || new Set(orderedIds).size !== orderedIds.length) {
    throw new TeamHierarchyError("INVALID_GROUP_ORDER", "Invalid team ordering.");
  }
  const result = await prisma.$transaction(async (tx) => {
    const parent = await tx.teamGroup.findUnique({ where: { id: parentId }, select: { id: true } });
    if (!parent) throw new TeamHierarchyError("PARENT_GROUP_NOT_FOUND", "Parent team not found.");
    const siblings = await tx.teamGroup.findMany({
      where: { parentId, isRoot: false },
      select: { id: true, sortOrder: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    });
    const valid = siblings.length === orderedIds.length &&
      siblings.every((sibling) => orderedIds.includes(sibling.id));
    if (!valid) throw new TeamHierarchyError("INVALID_GROUP_ORDER", "Team list changed. Refresh and try again.");
    const before = siblings.map((sibling) => sibling.id);
    if (before.join("\u0000") === orderedIds.join("\u0000")) return { changed: false };
    for (const [sortOrder, id] of orderedIds.entries()) {
      await tx.teamGroup.update({ where: { id }, data: { sortOrder } });
    }
    await tx.auditEvent.create({
      data: {
        action: "team_group.reordered",
        success: true,
        statusCode: 200,
        actorUserId: access.userId,
        targetType: "team_group",
        targetId: parentId,
        metadata: { parentId, before, after: orderedIds },
      },
    });
    return { changed: true };
  });
  if (result.changed) publishLiveUpdate({ type: "people.changed" });
  return result;
}
