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

const LAST_SEEN_WRITE_INTERVAL_MS =
  5 * 60 * 1000;

export async function createSession(
  input: CreateSessionInput
) {
  const token =
    generateSessionToken();

  const tokenHash =
    hashSessionToken(
      token
    );

  const session =
    await prisma.session.create({
      data: {
        userId:
          input.userId,
        tokenHash,
        userAgent:
          input.userAgent ??
          null,
        ipAddress:
          input.ipAddress ??
          null,
        expiresAt:
          input.expiresAt,
      },
    });

  return {
    token,
    session,
  };
}

export async function validateSessionToken(
  token: string
): Promise<ValidSession | null> {
  const tokenHash =
    hashSessionToken(
      token
    );

  const session =
    await prisma.session.findUnique({
      where: {
        tokenHash,
      },

      include: {
        user: {
          select: {
            status:
              true,
          },
        },
      },
    });

  if (
    !session ||
    session.revokedAt ||
    session.expiresAt.getTime() <=
      Date.now() ||
    session.user.status !==
      UserStatus.ACTIVE
  ) {
    return null;
  }

  /*
   * lastSeenAt is useful operational metadata,
   * but writing it on every authenticated request
   * creates unnecessary database load. Refresh it
   * at most once every five minutes per session.
   */
  const writeBefore =
    new Date(
      Date.now() -
        LAST_SEEN_WRITE_INTERVAL_MS
    );

  if (
    !session.lastSeenAt ||
    session.lastSeenAt <
      writeBefore
  ) {
    await prisma.session.updateMany({
      where: {
        id:
          session.id,
        revokedAt:
          null,
        OR: [
          {
            lastSeenAt:
              null,
          },
          {
            lastSeenAt: {
              lt:
                writeBefore,
            },
          },
        ],
      },

      data: {
        lastSeenAt:
          new Date(),
      },
    });
  }

  return {
    id:
      session.id,
    userId:
      session.userId,
    expiresAt:
      session.expiresAt,
  };
}

export async function revokeSession(
  sessionId: string
) {
  await prisma.session.updateMany({
    where: {
      id:
        sessionId,
      revokedAt:
        null,
    },

    data: {
      revokedAt:
        new Date(),
    },
  });
}

export async function revokeSessionToken(
  token: string
) {
  const tokenHash =
    hashSessionToken(
      token
    );

  await prisma.session.updateMany({
    where: {
      tokenHash,
      revokedAt:
        null,
    },

    data: {
      revokedAt:
        new Date(),
    },
  });
}

export async function revokeAllUserSessions(
  userId: string
) {
  await prisma.session.updateMany({
    where: {
      userId,
      revokedAt:
        null,
    },

    data: {
      revokedAt:
        new Date(),
    },
  });
}
