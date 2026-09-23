import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canAssignRole,
  hasPermission,
  isOwner,
  type AccessContext,
} from "./access-control.js";

import {
  revokeAllUserSessions,
} from "./session.js";

export type PeopleStatusErrorCode =
  | "PEOPLE_DEACTIVATE_REQUIRED"
  | "OWNER_REQUIRED"
  | "USER_NOT_FOUND"
  | "USER_NOT_ACTIVE"
  | "USER_NOT_DEACTIVATED"
  | "CANNOT_DEACTIVATE_SELF"
  | "ROLE_NOT_MANAGEABLE"
  | "MODEL_NOT_MANAGEABLE";

export class PeopleStatusError extends Error {
  readonly code: PeopleStatusErrorCode;

  constructor(
    code: PeopleStatusErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "PeopleStatusError";

    this.code =
      code;
  }
}

async function getTargetUser(
  userId: string
) {
  return prisma.user.findUnique({
    where: {
      id: userId,
    },

    select: {
      id: true,
      name: true,
      email: true,
      status: true,
      deactivatedAt: true,

      roleMemberships: {
        select: {
          role: {
            select: {
              id: true,
              name: true,
              systemKey: true,
              rank: true,
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

export async function deactivatePerson(
  userId: string,
  access: AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.deactivate"
    )
  ) {
    throw new PeopleStatusError(
      "PEOPLE_DEACTIVATE_REQUIRED",
      "You do not have permission to deactivate people."
    );
  }

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
    user.status !==
    UserStatus.ACTIVE
  ) {
    throw new PeopleStatusError(
      "USER_NOT_ACTIVE",
      "Only active users can be deactivated."
    );
  }

  /*
   * A person may only deactivate somebody
   * whose roles they would be allowed to assign.
   */
  for (
    const membership
    of user.roleMemberships
  ) {
    if (
      !canAssignRole(
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

  /*
   * They must also be allowed to manage
   * every model assigned to the target.
   */
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
        `You are not allowed to manage the model "${assignment.model.name}".`
      );
    }
  }

  const now =
    new Date();

  const updatedUser =
    await prisma.user.update({
      where: {
        id:
          user.id,
      },

      data: {
        status:
          UserStatus.DEACTIVATED,

        deactivatedAt:
          now,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        deactivatedAt: true,
      },
    });

  /*
   * Session validation already rejects
   * non-ACTIVE users immediately.
   *
   * We also revoke every stored session so
   * those credentials can never become usable
   * again if the account is later reactivated.
   */
  await revokeAllUserSessions(
    user.id
  );

  return updatedUser;
}

export async function reactivatePerson(
  userId: string,
  access: AccessContext
) {
  /*
   * The build brief explicitly reserves
   * reactivation for Owners.
   */
  if (!isOwner(access)) {
    throw new PeopleStatusError(
      "OWNER_REQUIRED",
      "Only an Owner may reactivate a user."
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
      id:
        user.id,
    },

    data: {
      status:
        UserStatus.ACTIVE,

      deactivatedAt:
        null,
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