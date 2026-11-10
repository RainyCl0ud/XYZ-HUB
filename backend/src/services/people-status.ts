import {
  Prisma,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canManageDelegatedStatusTarget,
  canManageRoleTarget,
  hasPermission,
  isOwner,
  isTrustedStatusOperator,
  type AccessContext,
} from "./access-control.js";

import {
  publishLiveUpdate,
} from "./live-updates.js";

import {
  revokeAllUserSessions,
} from "./session.js";

import {
  canAccessTeamGroup,
} from "./team-hierarchy.js";

export type PeopleStatusErrorCode =
  | "PEOPLE_STATUS_MANAGE_REQUIRED"
  | "USER_NOT_FOUND"
  | "USER_NOT_ACTIVE"
  | "USER_NOT_DEACTIVATED"
  | "CANNOT_DEACTIVATE_SELF"
  | "STATUS_CHANGED"
  | "ROLE_NOT_MANAGEABLE"
  | "MODEL_NOT_MANAGEABLE"
  | "TEAM_GROUP_NOT_MANAGEABLE";

export class PeopleStatusError extends Error {
  readonly code: PeopleStatusErrorCode;

  constructor(
    code: PeopleStatusErrorCode,
    message: string
  ) {
    super(message);
    this.name = "PeopleStatusError";
    this.code = code;
  }
}

async function getTargetUser(
  userId: string,
  db: Pick<Prisma.TransactionClient, "user"> = prisma,
) {
  return db.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      deactivatedAt: true,
      teamGroupId: true,
      roleMemberships: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              systemKey: true,
              rank: true,
              archivedAt: true,
            },
          },
        },
      },
      modelAssignments: {
        select: {
          model: {
            select: {
              id: true,
              name: true,
              isActive: true,
            },
          },
        },
      },
    },
  });
}

async function changeDelegatedStatus(userId: string, access: AccessContext, nextStatus: "ACTIVE" | "DEACTIVATED") {
  if (userId === access.userId) {
    throw new PeopleStatusError("CANNOT_DEACTIVATE_SELF", "You cannot change your own account status.");
  }
  const deactivating = nextStatus === UserStatus.DEACTIVATED;
  try {
    const updated = await prisma.$transaction(async tx => {
      const operator = await tx.userRole.findFirst({
        where: { userId: access.userId, user: { status: UserStatus.ACTIVE }, role: { systemKey: "OPS_MANAGER", archivedAt: null } },
        select: { role: { select: { rank: true } } },
      });
      if (!isTrustedStatusOperator(access.userId) || operator?.role.rank == null) {
        throw new PeopleStatusError("PEOPLE_STATUS_MANAGE_REQUIRED", "You do not have permission to change account status.");
      }
      const target = await getTargetUser(userId, tx);
      if (!target || target.roleMemberships.some(({ role }) => role.systemKey === "OWNER")) {
        throw new PeopleStatusError("USER_NOT_FOUND", "The user does not exist.");
      }
      if (!target.roleMemberships.some(({ role }) => !role.archivedAt) ||
        !canManageDelegatedStatusTarget(access, operator.role.rank, target.roleMemberships.map(({ role }) => role))) {
        throw new PeopleStatusError("ROLE_NOT_MANAGEABLE", "This account requires an Owner to change its status.");
      }
      const currentStatus = deactivating ? UserStatus.ACTIVE : UserStatus.DEACTIVATED;
      if (target.status !== currentStatus) {
        throw new PeopleStatusError(
          deactivating ? "USER_NOT_ACTIVE" : "USER_NOT_DEACTIVATED",
          deactivating ? "Only active users can be deactivated." : "Only deactivated users can be reactivated.",
        );
      }
      const now = new Date();
      const result = await tx.user.update({
        where: { id: userId, status: currentStatus },
        data: { status: nextStatus, deactivatedAt: deactivating ? now : null },
        select: { id: true, name: true, email: true, status: true, deactivatedAt: true },
      });
      if (deactivating) {
        await tx.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } });
      }
      return result;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    if (deactivating) publishLiveUpdate({ type: "session.invalidated", userId, reason: "ACCOUNT_DEACTIVATED" });
    return updated;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2025", "P2034"].includes(error.code)) {
      throw new PeopleStatusError("STATUS_CHANGED", "This account changed. Refresh the profile and try again.");
    }
    throw error;
  }
}

export async function deactivatePerson(
  userId: string,
  access: AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.status.manage"
    )
  ) {
    throw new PeopleStatusError(
      "PEOPLE_STATUS_MANAGE_REQUIRED",
      "You do not have permission to deactivate employees."
    );
  }
  if (!isOwner(access)) return changeDelegatedStatus(userId, access, UserStatus.DEACTIVATED);

  if (
    userId ===
    access.userId
  ) {
    throw new PeopleStatusError(
      "CANNOT_DEACTIVATE_SELF",
      "You cannot deactivate your own account."
    );
  }

  const user =
    await getTargetUser(
      userId
    );

  if (!user) {
    throw new PeopleStatusError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    user.roleMemberships.some(
      (membership) =>
        membership.role.systemKey ===
        "OWNER"
    )
  ) {
    throw new PeopleStatusError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    !await canAccessTeamGroup(
      access,
      user.teamGroupId
    )
  ) {
    throw new PeopleStatusError(
      "TEAM_GROUP_NOT_MANAGEABLE",
      "You are not allowed to manage a person outside your organization scope."
    );
  }

  if (
    user.status !==
    UserStatus.ACTIVE
  ) {
    throw new PeopleStatusError(
      "USER_NOT_ACTIVE",
      "Only active users can be deactivated."
    );
  }

  for (
    const membership
    of user.roleMemberships
  ) {
    if (
      !canManageRoleTarget(
        access,
        membership.role
      )
    ) {
      throw new PeopleStatusError(
        "ROLE_NOT_MANAGEABLE",
        `You are not allowed to manage the role "${membership.role.name}".`
      );
    }
  }

  for (
    const assignment
    of user.modelAssignments
  ) {
    if (
      !canAccessModel(
        access,
        assignment.model.id
      )
    ) {
      throw new PeopleStatusError(
        "MODEL_NOT_MANAGEABLE",
        `You are not allowed to manage the creator "${assignment.model.name}".`
      );
    }
  }

  const now =
    new Date();

  const updatedUser =
    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        status: UserStatus.DEACTIVATED,
        deactivatedAt: now,
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        deactivatedAt: true,
      },
    });

  await revokeAllUserSessions(
    user.id
  );

  publishLiveUpdate({
    type: "session.invalidated",
    userId: user.id,
    reason: "ACCOUNT_DEACTIVATED",
  });

  return updatedUser;
}

export async function reactivatePerson(
  userId: string,
  access: AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.status.manage"
    )
  ) {
    throw new PeopleStatusError(
      "PEOPLE_STATUS_MANAGE_REQUIRED",
      "You do not have permission to reactivate employees."
    );
  }
  if (!isOwner(access)) return changeDelegatedStatus(userId, access, UserStatus.ACTIVE);

  const user =
    await getTargetUser(
      userId
    );

  if (!user) {
    throw new PeopleStatusError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    user.roleMemberships.some(
      (membership) =>
        membership.role.systemKey ===
        "OWNER"
    )
  ) {
    throw new PeopleStatusError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    !await canAccessTeamGroup(
      access,
      user.teamGroupId
    )
  ) {
    throw new PeopleStatusError(
      "TEAM_GROUP_NOT_MANAGEABLE",
      "You are not allowed to manage a person outside your organization scope."
    );
  }

  if (
    user.status !==
    UserStatus.DEACTIVATED
  ) {
    throw new PeopleStatusError(
      "USER_NOT_DEACTIVATED",
      "Only deactivated users can be reactivated."
    );
  }

  return prisma.user.update({
    where: {
      id: user.id,
    },
    data: {
      status: UserStatus.ACTIVE,
      deactivatedAt: null,
    },
    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      deactivatedAt: true,
    },
  });
}
