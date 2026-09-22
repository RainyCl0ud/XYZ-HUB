import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hashPassword,
} from "./password.js";

import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "./password-reset-token.js";

/*
 * Temporary implementation default.
 *
 * The build brief requires an emailed
 * password-reset link but does not specify
 * the exact expiration time.
 */
export const PASSWORD_RESET_TTL_MS =
  60 * 60 * 1000;

export type CompletePasswordResetResult =
  | {
      status:
        "RESET_COMPLETE";

      user: {
        id: string;
        name: string;
        email: string;
      };
    }
  | {
      status:
        "INVALID_RESET";
    };

/*
 * =========================================================
 * CREATE PASSWORD RESET
 * =========================================================
 *
 * SECURITY:
 *
 * This function returns null for:
 *
 * - unknown email
 * - pending setup account
 * - deactivated account
 * - malformed account without password
 *
 * The public API will use the same generic
 * response in all of those cases to reduce
 * account enumeration.
 */
export async function createPasswordReset(
  email:
    string
) {
  const normalizedEmail =
    email
      .trim()
      .toLowerCase();

  const user =
    await prisma.user.findFirst({
      where: {
        email: {
          equals:
            normalizedEmail,

          mode:
            "insensitive",
        },
      },

      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        status: true,
      },
    });

  if (
    !user ||
    !user.passwordHash ||
    user.status !==
      UserStatus.ACTIVE
  ) {
    return null;
  }

  const token =
    generatePasswordResetToken();

  const tokenHash =
    hashPasswordResetToken(
      token
    );

  const now =
    new Date();

  const expiresAt =
    new Date(
      now.getTime() +
        PASSWORD_RESET_TTL_MS
    );

  const reset =
    await prisma.$transaction(
      async (
        tx
      ) => {
        /*
         * Creating a new reset request
         * invalidates all older unused
         * reset links for the account.
         */
        await tx.passwordResetToken.updateMany({
          where: {
            userId:
              user.id,

            usedAt:
              null,
          },

          data: {
            usedAt:
              now,
          },
        });

        return tx.passwordResetToken.create({
          data: {
            userId:
              user.id,

            tokenHash,

            expiresAt,
          },
        });
      }
    );

  /*
   * Raw token is returned ONLY to the
   * delivery layer.
   *
   * PostgreSQL stores tokenHash only.
   */
  return {
    token,

    reset,

    user: {
      id:
        user.id,

      name:
        user.name,

      email:
        user.email,
    },
  };
}


/*
 * =========================================================
 * VALIDATE PASSWORD RESET
 * =========================================================
 */

export async function validatePasswordResetToken(
  token:
    string
) {
  const tokenHash =
    hashPasswordResetToken(
      token
    );

  const reset =
    await prisma.passwordResetToken.findUnique({
      where: {
        tokenHash,
      },

      include: {
        user: {
          select: {
            id: true,
            status: true,
            passwordHash: true,
          },
        },
      },
    });

  if (!reset) {
    return null;
  }

  if (
    reset.usedAt ||
    reset.expiresAt.getTime() <=
      Date.now() ||
    reset.user.status !==
      UserStatus.ACTIVE ||
    !reset.user.passwordHash
  ) {
    return null;
  }

  return {
    id:
      reset.id,

    userId:
      reset.userId,

    expiresAt:
      reset.expiresAt,
  };
}


/*
 * =========================================================
 * COMPLETE PASSWORD RESET
 * =========================================================
 *
 * Successful reset:
 *
 * - atomically claims reset token
 * - replaces password with a new secure hash
 * - invalidates all other reset tokens
 * - revokes every existing session
 * - invalidates outstanding 2FA challenges
 *
 * The user must then sign in normally and
 * complete email 2FA again.
 */
export async function completePasswordReset(
  token:
    string,
  newPassword:
    string
): Promise<CompletePasswordResetResult> {
  const tokenHash =
    hashPasswordResetToken(
      token
    );

  /*
   * scrypt is intentionally performed
   * before opening the database transaction.
   */
  const passwordHash =
    await hashPassword(
      newPassword
    );

  const now =
    new Date();

  return prisma.$transaction(
    async (
      tx
    ) => {
      const reset =
        await tx.passwordResetToken.findUnique({
          where: {
            tokenHash,
          },

          include: {
            user: {
              select: {
                id: true,
                name: true,
                email: true,
                status: true,
                passwordHash: true,
              },
            },
          },
        });

      if (!reset) {
        return {
          status:
            "INVALID_RESET",
        };
      }

      if (
        reset.usedAt ||
        reset.expiresAt.getTime() <=
          now.getTime() ||
        reset.user.status !==
          UserStatus.ACTIVE ||
        !reset.user.passwordHash
      ) {
        return {
          status:
            "INVALID_RESET",
        };
      }

      /*
       * Atomically claim this reset token.
       *
       * Two simultaneous requests cannot
       * successfully use the same token.
       */
      const claimedReset =
        await tx.passwordResetToken.updateMany({
          where: {
            id:
              reset.id,

            usedAt:
              null,

            expiresAt: {
              gt:
                now,
            },
          },

          data: {
            usedAt:
              now,
          },
        });

      if (
        claimedReset.count !==
        1
      ) {
        return {
          status:
            "INVALID_RESET",
        };
      }

      /*
       * Account must still be ACTIVE when
       * the password is actually replaced.
       */
      const updatedUser =
        await tx.user.updateMany({
          where: {
            id:
              reset.userId,

            status:
              UserStatus.ACTIVE,
          },

          data: {
            passwordHash,
          },
        });

      if (
        updatedUser.count !==
        1
      ) {
        throw new Error(
          "Unable to update password-reset user."
        );
      }

      /*
       * Invalidate every OTHER outstanding
       * reset link belonging to this user.
       */
      await tx.passwordResetToken.updateMany({
        where: {
          userId:
            reset.userId,

          id: {
            not:
              reset.id,
          },

          usedAt:
            null,
        },

        data: {
          usedAt:
            now,
        },
      });

      /*
       * A password reset is a sensitive
       * security event.
       *
       * Existing authenticated sessions must
       * not survive a credential replacement.
       */
      await tx.session.updateMany({
        where: {
          userId:
            reset.userId,

          revokedAt:
            null,
        },

        data: {
          revokedAt:
            now,
        },
      });

      /*
       * Any password-authenticated login that
       * was waiting at the 2FA stage before
       * this reset must also become invalid.
       */
      await tx.twoFactorChallenge.updateMany({
        where: {
          userId:
            reset.userId,

          consumedAt:
            null,
        },

        data: {
          consumedAt:
            now,
        },
      });

      return {
        status:
          "RESET_COMPLETE",

        user: {
          id:
            reset.user.id,

          name:
            reset.user.name,

          email:
            reset.user.email,
        },
      };
    }
  );
}


/*
 * Used when delivery of a newly-created
 * reset email fails.
 */
export async function invalidatePasswordReset(
  resetId:
    string
) {
  await prisma.passwordResetToken.updateMany({
    where: {
      id:
        resetId,

      usedAt:
        null,
    },

    data: {
      usedAt:
        new Date(),
    },
  });
}