import {
  TwoFactorMethodType,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  canAccessModel,
  canManageRoleTarget,
  hasPermission,
  type AccessContext,
} from "./access-control.js";

import {
  canAccessTeamGroup,
} from "./team-hierarchy.js";

import {
  publishLiveUpdate,
} from "./live-updates.js";


export type PeopleTwoFactorErrorCode =
  | "TWO_FACTOR_RESET_REQUIRED"
  | "CANNOT_RESET_SELF"
  | "USER_NOT_FOUND"
  | "ROLE_NOT_MANAGEABLE"
  | "MODEL_NOT_MANAGEABLE"
  | "TEAM_GROUP_NOT_MANAGEABLE";


export class PeopleTwoFactorError
  extends Error {
  readonly code:
    PeopleTwoFactorErrorCode;

  constructor(
    code:
      PeopleTwoFactorErrorCode,
    message:
      string
  ) {
    super(
      message
    );

    this.name =
      "PeopleTwoFactorError";

    this.code =
      code;
  }
}


export async function resetPersonTwoFactor(
  userId:
    string,
  access:
    AccessContext
) {
  if (
    !hasPermission(
      access,
      "two_factor.reset"
    )
  ) {
    throw new PeopleTwoFactorError(
      "TWO_FACTOR_RESET_REQUIRED",
      "You do not have permission to reset two-factor authentication."
    );
  }

  if (
    userId ===
    access.userId
  ) {
    throw new PeopleTwoFactorError(
      "CANNOT_RESET_SELF",
      "Use your own account security settings to manage your two-factor authentication."
    );
  }

  const user =
    await prisma.user.findUnique({
      where: {
        id:
          userId,
      },

      select: {
        id:
          true,

        name:
          true,

        email:
          true,

        status:
          true,

        emailVerifiedAt:
          true,

        teamGroupId:
          true,

        roleMemberships: {
          select: {
            role: {
              select: {
                systemKey:
                  true,

                rank:
                  true,
              },
            },
          },
        },

        modelAssignments: {
          select: {
            modelId:
              true,

            model: {
              select: {
                name:
                  true,
              },
            },
          },
        },
      },
    });

  if (!user) {
    throw new PeopleTwoFactorError(
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
    throw new PeopleTwoFactorError(
      "TEAM_GROUP_NOT_MANAGEABLE",
      "You are not allowed to reset security for an employee outside your organization scope."
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
      throw new PeopleTwoFactorError(
        "ROLE_NOT_MANAGEABLE",
        "You are not allowed to reset security for an employee with a higher or protected role."
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
        assignment.modelId
      )
    ) {
      throw new PeopleTwoFactorError(
        "MODEL_NOT_MANAGEABLE",
        `You are not allowed to manage the creator "${assignment.model.name}".`
      );
    }
  }

  const now =
    new Date();

  const result =
    await prisma.$transaction(
      async (
        tx
      ) => {
        const invalidatedChallenges =
          await tx
            .twoFactorChallenge
            .updateMany({
              where: {
                userId:
                  user.id,

                consumedAt:
                  null,
              },

              data: {
                consumedAt:
                  now,
              },
            });

        await tx
          .userTwoFactorMethod
          .deleteMany({
            where: {
              userId:
                user.id,

              type:
                TwoFactorMethodType
                  .AUTHENTICATOR,
            },
          });

        // Recovery codes belong to the removed app.
        await tx
          .twoFactorRecoveryCode
          .deleteMany({
            where: {
              userId:
                user.id,
            },
          });

        await tx
          .userTwoFactorMethod
          .upsert({
            where: {
              userId_type: {
                userId:
                  user.id,

                type:
                  TwoFactorMethodType
                    .EMAIL,
              },
            },

            update: {
              isEnabled:
                true,
            },

            create: {
              userId:
                user.id,

              type:
                TwoFactorMethodType
                  .EMAIL,

              isEnabled:
                true,

              verifiedAt:
                user.emailVerifiedAt,
            },
          });

        const revokedSessions =
          await tx.session.updateMany({
            where: {
              userId:
                user.id,

              revokedAt:
                null,
            },

            data: {
              revokedAt:
                now,
            },
          });

        return {
          challengesInvalidated:
            invalidatedChallenges.count,

          sessionsRevoked:
            revokedSessions.count,
        };
      }
    );

  publishLiveUpdate({
    type:
      "session.invalidated",

    userId:
      user.id,

    reason:
      "TWO_FACTOR_RESET",
  });

  return {
    user: {
      id:
        user.id,

      name:
        user.name,

      email:
        user.email,

      status:
        user.status,
    },

    method:
      "EMAIL" as const,

    challengesInvalidated:
      result.challengesInvalidated,

    sessionsRevoked:
      result.sessionsRevoked,

    resetAt:
      now,
  };
}
