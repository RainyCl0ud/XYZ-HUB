import {
  TwoFactorMethodType,
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

export type PeopleTwoFactorErrorCode =
  | "OWNER_REQUIRED"
  | "TWO_FACTOR_RESET_REQUIRED"
  | "USER_NOT_FOUND";

export class PeopleTwoFactorError extends Error {
  readonly code:
    PeopleTwoFactorErrorCode;

  constructor(
    code:
      PeopleTwoFactorErrorCode,
    message:
      string
  ) {
    super(message);

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
    !isOwner(
      access
    )
  ) {
    throw new PeopleTwoFactorError(
      "OWNER_REQUIRED",
      "Only an Owner may reset another user's two-factor authentication."
    );
  }

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
        emailVerifiedAt: true,
      },
    });

  if (!user) {
    throw new PeopleTwoFactorError(
      "USER_NOT_FOUND",
      "The user does not exist."
    );
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
    type: "session.invalidated",
    userId: user.id,
    reason: "TWO_FACTOR_RESET",
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
