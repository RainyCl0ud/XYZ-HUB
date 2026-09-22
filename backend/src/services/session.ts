import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

import {
  generateSessionToken,
  hashSessionToken,
} from "./session-token.js";

export type CreateSessionInput = {
  userId: string;
  expiresAt: Date;
  userAgent?: string | null;
  ipAddress?: string | null;
};

export type ValidSession = {
  id: string;
  userId: string;
  expiresAt: Date;
};

/*
 * Creates a new session.
 *
 * The raw token is returned to the caller
 * so it can later go into a secure cookie.
 *
 * Only the token hash is stored in PostgreSQL.
 */
export async function createSession(
  input: CreateSessionInput
) {
  const token =
    generateSessionToken();

  const tokenHash =
    hashSessionToken(token);

  const session =
    await prisma.session.create({
      data: {
        userId: input.userId,

        tokenHash,

        userAgent:
          input.userAgent ?? null,

        ipAddress:
          input.ipAddress ?? null,

        expiresAt:
          input.expiresAt,
      },
    });

  return {
    token,
    session,
  };
}

/*
 * Validates a raw session token.
 *
 * A session is invalid when:
 *
 * - it does not exist
 * - it has been revoked
 * - it has expired
 * - the user is not ACTIVE
 */
export async function validateSessionToken(
  token: string
): Promise<ValidSession | null> {
  const tokenHash =
    hashSessionToken(token);

  const session =
    await prisma.session.findUnique({
      where: {
        tokenHash,
      },

      include: {
        user: {
          select: {
            status: true,
          },
        },
      },
    });

  if (!session) {
    return null;
  }

  if (session.revokedAt) {
    return null;
  }

  if (
    session.expiresAt.getTime() <=
    Date.now()
  ) {
    return null;
  }

  if (
    session.user.status !==
    UserStatus.ACTIVE
  ) {
    return null;
  }

  /*
   * Record that the session has recently
   * been used.
   */
  await prisma.session.update({
    where: {
      id: session.id,
    },

    data: {
      lastSeenAt: new Date(),
    },
  });

  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
  };
}

/*
 * Revokes one specific session.
 *
 * Used for normal logout.
 */
export async function revokeSession(
  sessionId: string
) {
  await prisma.session.updateMany({
    where: {
      id: sessionId,
      revokedAt: null,
    },

    data: {
      revokedAt: new Date(),
    },
  });
}

/*
 * Revokes a session using the browser's
 * raw token.
 */
export async function revokeSessionToken(
  token: string
) {
  const tokenHash =
    hashSessionToken(token);

  await prisma.session.updateMany({
    where: {
      tokenHash,
      revokedAt: null,
    },

    data: {
      revokedAt: new Date(),
    },
  });
}

/*
 * Immediately invalidates every active
 * session belonging to a user.
 *
 * This is important when:
 *
 * - someone is deactivated
 * - security requires forced logout
 */
export async function revokeAllUserSessions(
  userId: string
) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt: null,
    },

    data: {
      revokedAt: new Date(),
    },
  });
}