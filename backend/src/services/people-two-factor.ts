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
  /*
   * The build brief reserves 2FA reset
   * for Owners.
   */
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

  /*
   * Owner status alone is not enough.
   *
   * The explicit permission still has to
   * exist on the Owner's effective roles.
   */
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
        /*
         * Any code issued before the reset
         * must immediately become unusable.
         */
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

        /*
         * AUTHENTICATOR is reserved for the
         * future authenticator-app feature.
         *
         * A reset removes that enrollment so
         * the user cannot remain tied to an
         * old authenticator device.
         */
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

        /*
         * Email remains the Step 1 fallback
         * and current supported method.
         *
         * Preserve an existing verifiedAt
         * timestamp if the method already
         * exists.
         */
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

        /*
         * Resetting an authentication factor
         * is a security-sensitive operation.
         *
         * Every existing session is revoked
         * so the user must authenticate again
         * with the freshly-reset factor.
         */
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
      result
        .challengesInvalidated,

    sessionsRevoked:
      result
        .sessionsRevoked,

    resetAt:
      now,
  };
}