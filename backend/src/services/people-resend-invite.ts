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
  type AccessContext,
} from "./access-control.js";

import {
  createInvite,
} from "./invite.js";

export type ResendInviteErrorCode =
  | "PEOPLE_MANAGE_REQUIRED"
  | "USER_NOT_FOUND"
  | "USER_NOT_PENDING"
  | "ROLE_NOT_ASSIGNABLE"
  | "MODEL_NOT_ASSIGNABLE";

export class ResendInviteError extends Error {
  readonly code: ResendInviteErrorCode;

  constructor(
    code: ResendInviteErrorCode,
    message: string
  ) {
    super(message);

    this.name =
      "ResendInviteError";

    this.code =
      code;
  }
}

export async function resendPersonInvite(
  userId: string,
  access: AccessContext
) {
  if (
    !hasPermission(
      access,
      "people.manage"
    )
  ) {
    throw new ResendInviteError(
      "PEOPLE_MANAGE_REQUIRED",
      "You do not have permission to manage invitations."
    );
  }

  const user =
    await prisma.user.findUnique({
      where: {
        id:
          userId,
      },

      select: {
        id: true,
        name: true,
        email: true,
        status: true,

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

  if (!user) {
    throw new ResendInviteError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
  }

  if (
    user.status !==
    UserStatus.PENDING_SETUP
  ) {
    throw new ResendInviteError(
      "USER_NOT_PENDING",
      "Only pending-setup users can receive another setup invitation."
    );
  }

  /*
   * The sender must still be allowed to
   * assign every role currently held by
   * this pending user.
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
      throw new ResendInviteError(
        "ROLE_NOT_ASSIGNABLE",
        `You are not allowed to manage the role "${membership.role.name}".`
      );
    }
  }

  /*
   * The sender must also still be allowed
   * to assign every model attached to the
   * pending user.
   */
  for (
    const assignment
    of user.modelAssignments
  ) {
    if (
      !assignment.model.isActive ||
      !canAccessModel(
        access,
        assignment.model.id
      )
    ) {
      throw new ResendInviteError(
        "MODEL_NOT_ASSIGNABLE",
        `You are not allowed to manage the model "${assignment.model.name}".`
      );
    }
  }

  /*
   * createInvite() already revokes any older
   * unused invitation before issuing the new
   * 7-day token.
   */
  const {
    token,
    invite,
  } =
    await createInvite({
      userId:
        user.id,

      createdByUserId:
        access.userId,
    });

  return {
    user: {
      id:
        user.id,

      name:
        user.name,

      email:
        user.email,
    },

    invite: {
      id:
        invite.id,

      expiresAt:
        invite.expiresAt,
    },

    token,
  };
}