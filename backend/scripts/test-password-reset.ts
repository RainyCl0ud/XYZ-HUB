/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  hashPassword,
  verifyPassword,
} from "../src/services/password.js";

import {
  createSession,
  validateSessionToken,
} from "../src/services/session.js";

import {
  createEmailTwoFactorChallenge,
} from "../src/services/two-factor.js";

import {
  completePasswordReset,
  createPasswordReset,
  validatePasswordResetToken,
} from "../src/services/password-reset.js";

import {
  generatePasswordResetToken,
  hashPasswordResetToken,
} from "../src/services/password-reset-token.js";

async function runTests() {
  console.log(
    "Starting password-reset tests..."
  );

  const suffix =
    Date.now();

  const oldPassword =
    "OldPassword!2026";

  const newPassword =
    "NewPassword!2026";

  const oldPasswordHash =
    await hashPassword(
      oldPassword
    );

  const activeUser =
    await prisma.user.create({
      data: {
        name:
          "Password Reset Active",

        email:
          `password-reset-active-${suffix}@example.test`,

        passwordHash:
          oldPasswordHash,

        status:
          UserStatus.ACTIVE,

        emailVerifiedAt:
          new Date(),
      },
    });

  const pendingUser =
    await prisma.user.create({
      data: {
        name:
          "Password Reset Pending",

        email:
          `password-reset-pending-${suffix}@example.test`,

        status:
          UserStatus.PENDING_SETUP,
      },
    });

  const deactivatedUser =
    await prisma.user.create({
      data: {
        name:
          "Password Reset Deactivated",

        email:
          `password-reset-deactivated-${suffix}@example.test`,

        passwordHash:
          oldPasswordHash,

        status:
          UserStatus.DEACTIVATED,

        deactivatedAt:
          new Date(),
      },
    });

  try {
    const unknown =
      await createPasswordReset(
        `missing-${suffix}@example.test`
      );

    assert.equal(
      unknown,
      null
    );

    console.log(
      "✓ unknown email does not create a reset token"
    );

    const pending =
      await createPasswordReset(
        pendingUser.email
      );

    assert.equal(
      pending,
      null
    );

    console.log(
      "✓ pending-setup account does not receive password reset"
    );

    const deactivated =
      await createPasswordReset(
        deactivatedUser.email
      );

    assert.equal(
      deactivated,
      null
    );

    console.log(
      "✓ deactivated account does not receive password reset"
    );

    const firstReset =
      await createPasswordReset(
        activeUser.email
      );

    assert.ok(
      firstReset
    );

    const storedFirst =
      await prisma.passwordResetToken.findUniqueOrThrow({
        where: {
          id:
            firstReset.reset.id,
        },
      });

    assert.notEqual(
      storedFirst.tokenHash,
      firstReset.token
    );

    assert.equal(
      storedFirst.tokenHash,
      hashPasswordResetToken(
        firstReset.token
      )
    );

    console.log(
      "✓ raw password-reset token is not stored"
    );

    const firstValid =
      await validatePasswordResetToken(
        firstReset.token
      );

    assert.ok(
      firstValid
    );

    console.log(
      "✓ active password-reset token validates"
    );

    const secondReset =
      await createPasswordReset(
        activeUser.email
      );

    assert.ok(
      secondReset
    );

    const oldResetAfterResend =
      await validatePasswordResetToken(
        firstReset.token
      );

    assert.equal(
      oldResetAfterResend,
      null
    );

    console.log(
      "✓ newer reset request invalidates older reset link"
    );

    const session =
      await createSession({
        userId:
          activeUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 *
                60 *
                1000
          ),
      });

    assert.ok(
      await validateSessionToken(
        session.token
      )
    );

    console.log(
      "✓ existing user session is valid before reset"
    );

    const challenge =
      await createEmailTwoFactorChallenge(
        activeUser.id
      );

    assert.equal(
      challenge
        .challenge
        .consumedAt,
      null
    );

    console.log(
      "✓ active 2FA challenge exists before reset"
    );

    const completed =
      await completePasswordReset(
        secondReset.token,
        newPassword
      );

    assert.equal(
      completed.status,
      "RESET_COMPLETE"
    );

    console.log(
      "✓ valid reset token changes the password"
    );

    const updatedUser =
      await prisma.user.findUniqueOrThrow({
        where: {
          id:
            activeUser.id,
        },

        select: {
          passwordHash:
            true,
        },
      });

    assert.ok(
      updatedUser.passwordHash
    );

    assert.equal(
      await verifyPassword(
        newPassword,
        updatedUser.passwordHash
      ),
      true
    );

    assert.equal(
      await verifyPassword(
        oldPassword,
        updatedUser.passwordHash
      ),
      false
    );

    console.log(
      "✓ new password works and old password no longer verifies"
    );

    assert.equal(
      await validateSessionToken(
        session.token
      ),
      null
    );

    console.log(
      "✓ existing sessions are revoked after password reset"
    );

    const storedChallenge =
      await prisma.twoFactorChallenge.findUniqueOrThrow({
        where: {
          id:
            challenge.challenge.id,
        },
      });

    assert.ok(
      storedChallenge.consumedAt
    );

    console.log(
      "✓ outstanding 2FA challenges are invalidated after reset"
    );

    const reused =
      await completePasswordReset(
        secondReset.token,
        "AnotherPassword!2026"
      );

    assert.equal(
      reused.status,
      "INVALID_RESET"
    );

    console.log(
      "✓ password-reset token cannot be reused"
    );

    const userAfterReuse =
      await prisma.user.findUniqueOrThrow({
        where: {
          id:
            activeUser.id,
        },

        select: {
          passwordHash:
            true,
        },
      });

    assert.ok(
      userAfterReuse.passwordHash
    );

    assert.equal(
      await verifyPassword(
        newPassword,
        userAfterReuse.passwordHash
      ),
      true
    );

    console.log(
      "✓ reset-token reuse cannot overwrite the password"
    );

    const expiredRawToken =
      generatePasswordResetToken();

    await prisma.passwordResetToken.create({
      data: {
        userId:
          activeUser.id,

        tokenHash:
          hashPasswordResetToken(
            expiredRawToken
          ),

        expiresAt:
          new Date(
            Date.now() -
              60_000
          ),
      },
    });

    const expired =
      await validatePasswordResetToken(
        expiredRawToken
      );

    assert.equal(
      expired,
      null
    );

    console.log(
      "✓ expired password-reset token is rejected"
    );

    console.log("");

    console.log(
      "All password-reset tests passed."
    );
  } finally {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            activeUser.id,
            pendingUser.id,
            deactivatedUser.id,
          ],
        },
      },
    });
  }
}

runTests()
  .catch(
    (
      error
    ) => {
      console.error(
        "Password-reset test failed:",
        error
      );

      process.exit(1);
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );