/// <reference types="node" />

import assert from "node:assert/strict";

import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  createEmailTwoFactorChallenge,
  verifyTwoFactorChallenge,
} from "../src/services/two-factor.js";

async function runTests() {
  console.log(
    "Starting 2FA tests..."
  );

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "2FA Test User",

        email:
          `two-factor-${Date.now()}@example.test`,

        status:
          UserStatus.ACTIVE,
      },
    });

  try {
    const {
      challenge,
      code,
    } =
      await createEmailTwoFactorChallenge(
        testUser.id
      );

    assert.match(
      code,
      /^\d{6}$/
    );

    console.log(
      "✓ six-digit code generated"
    );

    assert.notEqual(
      challenge.codeHash,
      code
    );

    assert.equal(
      challenge.codeHash.includes(
        code
      ),
      false
    );

    console.log(
      "✓ plain 2FA code is not stored"
    );

    const wrongResult =
      await verifyTwoFactorChallenge(
        challenge.id,
        "999999" === code
          ? "888888"
          : "999999"
      );

    assert.equal(
      wrongResult,
      "INVALID"
    );

    console.log(
      "✓ incorrect code is rejected"
    );

    const correctResult =
      await verifyTwoFactorChallenge(
        challenge.id,
        code
      );

    assert.equal(
      correctResult,
      "VERIFIED"
    );

    console.log(
      "✓ correct code verifies"
    );

    const reusedResult =
      await verifyTwoFactorChallenge(
        challenge.id,
        code
      );

    assert.equal(
      reusedResult,
      "CONSUMED"
    );

    console.log(
      "✓ verified code cannot be reused"
    );

    /*
     * ========================================
     * OLD CHALLENGE INVALIDATION
     * ========================================
     */

    const first =
      await createEmailTwoFactorChallenge(
        testUser.id
      );

    await createEmailTwoFactorChallenge(
      testUser.id
    );

    const oldChallengeResult =
      await verifyTwoFactorChallenge(
        first.challenge.id,
        first.code
      );

    assert.equal(
      oldChallengeResult,
      "CONSUMED"
    );

    console.log(
      "✓ new challenge invalidates older code"
    );

    /*
     * ========================================
     * EXPIRED CHALLENGE
     * ========================================
     */

    const expired =
      await createEmailTwoFactorChallenge(
        testUser.id
      );

    await prisma.twoFactorChallenge.update({
      where: {
        id:
          expired.challenge.id,
      },

      data: {
        expiresAt:
          new Date(
            Date.now() -
              60 * 1000
          ),
      },
    });

    const expiredResult =
      await verifyTwoFactorChallenge(
        expired.challenge.id,
        expired.code
      );

    assert.equal(
      expiredResult,
      "EXPIRED"
    );

    console.log(
      "✓ expired code is rejected"
    );

    console.log("");

    console.log(
      "All 2FA tests passed."
    );
  } finally {
    await prisma.user.delete({
      where: {
        id: testUser.id,
      },
    });
  }
}

runTests()
  .catch((error) => {
    console.error(
      "2FA test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });