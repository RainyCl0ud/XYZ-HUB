import {
  TwoFactorMethodType,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  hashPassword,
} from "./password.js";

import {
  generateInviteToken,
  hashInviteToken,
} from "./invite-token.js";

import {
  publishLiveUpdate,
} from "./live-updates.js";

export const INVITE_TTL_MS =
  7 * 24 * 60 * 60 * 1000;

export type CreateInviteInput = {
  userId: string;
  createdByUserId?: string | null;
};

export type ValidInvite = {
  id: string;
  userId: string;
  expiresAt: Date;

  user: {
    id: string;
    name: string;
    email: string;
    status: UserStatus;
  };
};

export type AcceptInviteResult =
  | {
      status: "ACCEPTED";

      user: {
        id: string;
        name: string;
        email: string;
        status: UserStatus;
      };
    }
  | {
      status: "INVALID_INVITE";
    };

/*
 * =========================================================
 * CREATE / RESEND INVITE
 * =========================================================
 */

export async function createInvite(
  input: CreateInviteInput
) {
  const user =
    await prisma.user.findUnique({
      where: {
        id: input.userId,
      },

      select: {
        id: true,
        status: true,
      },
    });

  if (!user) {
    throw new Error(
      "Invite user does not exist."
    );
  }

  if (
    user.status !==
    UserStatus.PENDING_SETUP
  ) {
    throw new Error(
      "Only pending-setup users can receive an invite."
    );
  }

  const now =
    new Date();

  /*
   * Resending an invitation revokes
   * all older unused invitations.
   */
  await prisma.invite.updateMany({
    where: {
      userId:
        user.id,

      acceptedAt:
        null,

      revokedAt:
        null,
    },

    data: {
      revokedAt:
        now,
    },
  });

  const token =
    generateInviteToken();

  const tokenHash =
    hashInviteToken(
      token
    );

  const expiresAt =
    new Date(
      now.getTime() +
        INVITE_TTL_MS
    );

  const invite =
    await prisma.invite.create({
      data: {
        userId:
          user.id,

        tokenHash,

        createdByUserId:
          input.createdByUserId ??
          null,

        sentAt:
          now,

        expiresAt,
      },
    });

  /*
   * Raw token is returned only for the
   * invitation delivery layer.
   *
   * PostgreSQL stores only tokenHash.
   */
  return {
    token,
    invite,
  };
}

/*
 * =========================================================
 * VALIDATE INVITE
 * =========================================================
 */

export async function validateInviteToken(
  token: string
): Promise<ValidInvite | null> {
  const tokenHash =
    hashInviteToken(
      token
    );

  const invite =
    await prisma.invite.findUnique({
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
          },
        },
      },
    });

  if (!invite) {
    return null;
  }

  if (invite.revokedAt) {
    return null;
  }

  if (invite.acceptedAt) {
    return null;
  }

  if (
    invite.expiresAt.getTime() <=
    Date.now()
  ) {
    return null;
  }

  if (
    invite.user.status !==
    UserStatus.PENDING_SETUP
  ) {
    return null;
  }

  return {
    id:
      invite.id,

    userId:
      invite.userId,

    expiresAt:
      invite.expiresAt,

    user:
      invite.user,
  };
}

/*
 * =========================================================
 * ACCEPT INVITE + SET PASSWORD
 * =========================================================
 *
 * This operation is transactional.
 *
 * Either ALL of these happen:
 *
 * - invite is claimed
 * - password is stored securely
 * - user becomes ACTIVE
 * - email is considered verified
 * - email 2FA method is enabled
 *
 * or NONE of them happen.
 */
export async function acceptInviteToken(
  token: string,
  password: string
): Promise<AcceptInviteResult> {
  const tokenHash =
    hashInviteToken(
      token
    );

  /*
   * Password hashing is intentionally done
   * before opening the database transaction.
   *
   * scrypt is relatively expensive and we
   * don't want to hold a database transaction
   * open while hashing.
   */
  const passwordHash =
    await hashPassword(
      password
    );

  const now =
    new Date();

  try {
    const result:
      AcceptInviteResult =
      await prisma.$transaction(
        async (
          tx
        ): Promise<
          AcceptInviteResult
        > => {
        const invite =
          await tx.invite.findUnique({
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
                },
              },
            },
          });

        if (!invite) {
          return {
            status:
              "INVALID_INVITE",
          };
        }

        if (
          invite.revokedAt ||
          invite.acceptedAt ||
          invite.expiresAt.getTime() <=
            now.getTime() ||
          invite.user.status !==
            UserStatus.PENDING_SETUP
        ) {
          return {
            status:
              "INVALID_INVITE",
          };
        }

        /*
         * Atomically claim the invitation.
         *
         * If another request accepted it
         * moments earlier, count will be 0.
         */
        const claimedInvite =
          await tx.invite.updateMany({
            where: {
              id:
                invite.id,

              acceptedAt:
                null,

              revokedAt:
                null,

              expiresAt: {
                gt:
                  now,
              },
            },

            data: {
              acceptedAt:
                now,
            },
          });

        if (
          claimedInvite.count !==
          1
        ) {
          return {
            status:
              "INVALID_INVITE",
          };
        }

        /*
         * Activate only if the account is
         * still PENDING_SETUP.
         */
        const activatedUser =
          await tx.user.updateMany({
            where: {
              id:
                invite.userId,

              status:
                UserStatus.PENDING_SETUP,
            },

            data: {
              passwordHash,

              status:
                UserStatus.ACTIVE,

              emailVerifiedAt:
                now,

              deactivatedAt:
                null,
            },
          });

        if (
          activatedUser.count !==
          1
        ) {
          /*
           * Throwing here rolls back the
           * invite claim as well.
           */
          throw new Error(
            "Unable to activate invited user."
          );
        }

        /*
         * Email 2FA is the default sign-in
         * second factor for XYZ Hub.
         */
        await tx.userTwoFactorMethod.upsert({
          where: {
            userId_type: {
              userId:
                invite.userId,

              type:
                TwoFactorMethodType.EMAIL,
            },
          },

          update: {
            isEnabled:
              true,

            verifiedAt:
              now,
          },

          create: {
            userId:
              invite.userId,

            type:
              TwoFactorMethodType.EMAIL,

            isEnabled:
              true,

            verifiedAt:
              now,
          },
        });

        return {
          status:
            "ACCEPTED",

          user: {
            id:
              invite.user.id,

            name:
              invite.user.name,

            email:
              invite.user.email,

            status:
              UserStatus.ACTIVE,
          },
        };
        }
      );

    if (
      result.status ===
      "ACCEPTED"
    ) {
      publishLiveUpdate({
        type:
          "people.changed",
        userId:
          result.user.id,
      });
    }

    return result;
  } catch (error) {
    console.error(
      "Invite acceptance failed:",
      error
    );

    throw error;
  }
}

/*
 * =========================================================
 * REVOKE INVITE
 * =========================================================
 */

export async function revokeInvite(
  inviteId: string
) {
  await prisma.invite.updateMany({
    where: {
      id:
        inviteId,

      acceptedAt:
        null,

      revokedAt:
        null,
    },

    data: {
      revokedAt:
        new Date(),
    },
  });
}