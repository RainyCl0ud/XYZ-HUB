import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from "node:crypto";

import {
  TwoFactorMethodType,
} from "@prisma/client";

import {
  prisma,
} from "../lib/prisma.js";

export const TWO_FACTOR_CODE_TTL_MS =
  10 * 60 * 1000;

export const TWO_FACTOR_MAX_ATTEMPTS =
  5;

function getTwoFactorSecret(): string {
  const secret =
    process.env.TWO_FACTOR_CODE_SECRET;

  if (!secret) {
    throw new Error(
      "TWO_FACTOR_CODE_SECRET is not configured."
    );
  }

  return secret;
}

function generateTwoFactorCode(): string {
  return randomInt(
    0,
    1_000_000
  )
    .toString()
    .padStart(6, "0");
}

function hashTwoFactorCode(
  code: string
): string {
  const nonce =
    randomBytes(16).toString("hex");

  const digest =
    createHmac(
      "sha256",
      getTwoFactorSecret()
    )
      .update(
        `${nonce}:${code}`
      )
      .digest("hex");

  return `${nonce}.${digest}`;
}

function verifyTwoFactorCodeHash(
  code: string,
  storedHash: string
): boolean {
  const [
    nonce,
    expectedDigest,
  ] =
    storedHash.split(".");

  if (
    !nonce ||
    !expectedDigest
  ) {
    return false;
  }

  const actualDigest =
    createHmac(
      "sha256",
      getTwoFactorSecret()
    )
      .update(
        `${nonce}:${code}`
      )
      .digest("hex");

  const expectedBuffer =
    Buffer.from(
      expectedDigest,
      "hex"
    );

  const actualBuffer =
    Buffer.from(
      actualDigest,
      "hex"
    );

  if (
    expectedBuffer.length !==
    actualBuffer.length
  ) {
    return false;
  }

  return timingSafeEqual(
    expectedBuffer,
    actualBuffer
  );
}

export async function createEmailTwoFactorChallenge(
  userId: string
) {
  const now =
    new Date();

  await prisma.twoFactorChallenge.updateMany({
    where: {
      userId,
      methodType:
        TwoFactorMethodType.EMAIL,
      consumedAt:
        null,
    },

    data: {
      consumedAt:
        now,
    },
  });

  const code =
    generateTwoFactorCode();

  const codeHash =
    hashTwoFactorCode(
      code
    );

  const expiresAt =
    new Date(
      now.getTime() +
        TWO_FACTOR_CODE_TTL_MS
    );

  const challenge =
    await prisma.twoFactorChallenge.create({
      data: {
        userId,
        methodType:
          TwoFactorMethodType.EMAIL,
        codeHash,
        expiresAt,
      },
    });

  return {
    challenge,
    code,
  };
}

export type TwoFactorVerifyResult =
  | "VERIFIED"
  | "INVALID"
  | "EXPIRED"
  | "LOCKED"
  | "CONSUMED"
  | "NOT_FOUND";

async function getUnavailableResult(
  challengeId:
    string
): Promise<TwoFactorVerifyResult> {
  const current =
    await prisma.twoFactorChallenge.findUnique({
      where: {
        id:
          challengeId,
      },

      select: {
        consumedAt:
          true,
        expiresAt:
          true,
        failedAttempts:
          true,
      },
    });

  if (
    !current
  ) {
    return "NOT_FOUND";
  }

  if (
    current.failedAttempts >=
    TWO_FACTOR_MAX_ATTEMPTS
  ) {
    return "LOCKED";
  }

  if (
    current.expiresAt.getTime() <=
    Date.now()
  ) {
    return "EXPIRED";
  }

  if (
    current.consumedAt
  ) {
    return "CONSUMED";
  }

  return "CONSUMED";
}

export async function verifyTwoFactorChallenge(
  challengeId: string,
  code: string
): Promise<TwoFactorVerifyResult> {
  const challenge =
    await prisma.twoFactorChallenge.findUnique({
      where: {
        id:
          challengeId,
      },
    });

  if (!challenge) {
    return "NOT_FOUND";
  }

  if (
    challenge.consumedAt
  ) {
    return "CONSUMED";
  }

  const now =
    new Date();

  if (
    challenge.expiresAt.getTime() <=
    now.getTime()
  ) {
    return "EXPIRED";
  }

  if (
    challenge.failedAttempts >=
    TWO_FACTOR_MAX_ATTEMPTS
  ) {
    return "LOCKED";
  }

  const isValid =
    verifyTwoFactorCodeHash(
      code,
      challenge.codeHash
    );

  if (
    isValid
  ) {
    /*
     * Conditional claim prevents two concurrent
     * requests using the same correct code from
     * both succeeding. Only one request can move
     * consumedAt from null to a timestamp.
     */
    const claimed =
      await prisma.twoFactorChallenge.updateMany({
        where: {
          id:
            challenge.id,
          consumedAt:
            null,
          expiresAt: {
            gt:
              now,
          },
          failedAttempts: {
            lt:
              TWO_FACTOR_MAX_ATTEMPTS,
          },
        },

        data: {
          consumedAt:
            now,
        },
      });

    if (
      claimed.count ===
      1
    ) {
      return "VERIFIED";
    }

    return getUnavailableResult(
      challenge.id
    );
  }

  /*
   * Invalid attempts use an atomic increment.
   * Concurrent bad guesses therefore cannot
   * overwrite each other's attempt counts.
   */
  const attempt =
    await prisma.twoFactorChallenge.updateMany({
      where: {
        id:
          challenge.id,
        consumedAt:
          null,
        expiresAt: {
          gt:
            now,
        },
        failedAttempts: {
          lt:
            TWO_FACTOR_MAX_ATTEMPTS,
        },
      },

      data: {
        failedAttempts: {
          increment:
            1,
        },
      },
    });

  if (
    attempt.count ===
    0
  ) {
    return getUnavailableResult(
      challenge.id
    );
  }

  const updated =
    await prisma.twoFactorChallenge.findUnique({
      where: {
        id:
          challenge.id,
      },

      select: {
        failedAttempts:
          true,
        consumedAt:
          true,
      },
    });

  if (
    updated &&
    updated.failedAttempts >=
      TWO_FACTOR_MAX_ATTEMPTS
  ) {
    await prisma.twoFactorChallenge.updateMany({
      where: {
        id:
          challenge.id,
        consumedAt:
          null,
      },

      data: {
        consumedAt:
          new Date(),
      },
    });

    return "LOCKED";
  }

  return "INVALID";
}
