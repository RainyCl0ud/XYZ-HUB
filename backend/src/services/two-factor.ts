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

  /*
   * Invalidate any older unused email
   * challenge for this user.
   */
  await prisma.twoFactorChallenge.updateMany({
    where: {
      userId,

      methodType:
        TwoFactorMethodType.EMAIL,

      consumedAt: null,
    },

    data: {
      consumedAt: now,
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

  /*
   * The plain code is returned ONLY so the
   * email service can send it.
   *
   * It is never stored in PostgreSQL.
   */
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

export async function verifyTwoFactorChallenge(
  challengeId: string,
  code: string
): Promise<TwoFactorVerifyResult> {
  const challenge =
    await prisma.twoFactorChallenge.findUnique({
      where: {
        id: challengeId,
      },
    });

  if (!challenge) {
    return "NOT_FOUND";
  }

  if (challenge.consumedAt) {
    return "CONSUMED";
  }

  if (
    challenge.expiresAt.getTime() <=
    Date.now()
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

  if (!isValid) {
    const nextAttempts =
      challenge.failedAttempts + 1;

    await prisma.twoFactorChallenge.update({
      where: {
        id: challenge.id,
      },

      data: {
        failedAttempts:
          nextAttempts,

        consumedAt:
          nextAttempts >=
          TWO_FACTOR_MAX_ATTEMPTS
            ? new Date()
            : null,
      },
    });

    return nextAttempts >=
      TWO_FACTOR_MAX_ATTEMPTS
      ? "LOCKED"
      : "INVALID";
  }

  await prisma.twoFactorChallenge.update({
    where: {
      id: challenge.id,
    },

    data: {
      consumedAt:
        new Date(),
    },
  });

  return "VERIFIED";
}