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
  createInvite,
  revokeInvite,
  validateInviteToken,
} from "../src/services/invite.js";

async function runTests() {
  console.log(
    "Starting invite service tests..."
  );

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "Invite Test User",

        email:
          `invite-test-${Date.now()}@example.test`,

        status:
          UserStatus.PENDING_SETUP,
      },
    });

  try {
    /*
     * ========================================
     * CREATE INVITE
     * ========================================
     */

    const first =
      await createInvite({
        userId:
          testUser.id,
      });

    assert.notEqual(
      first.token,
      first.invite.tokenHash
    );

    assert.equal(
      first.invite.tokenHash.includes(
        first.token
      ),
      false
    );

    console.log(
      "✓ raw invite token is not stored"
    );

    const validFirst =
      await validateInviteToken(
        first.token
      );

    assert.ok(
      validFirst
    );

    assert.equal(
      validFirst.userId,
      testUser.id
    );

    console.log(
      "✓ valid invite token is accepted"
    );

    /*
     * ========================================
     * RESEND REVOKES OLD INVITE
     * ========================================
     */

    const second =
      await createInvite({
        userId:
          testUser.id,
      });

    const firstAfterResend =
      await validateInviteToken(
        first.token
      );

    assert.equal(
      firstAfterResend,
      null
    );

    const validSecond =
      await validateInviteToken(
        second.token
      );

    assert.ok(
      validSecond
    );

    console.log(
      "✓ new invite revokes older unused invite"
    );

    /*
     * ========================================
     * EXPIRED INVITE
     * ========================================
     */

    await prisma.invite.update({
      where: {
        id:
          second.invite.id,
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
      await validateInviteToken(
        second.token
      );

    assert.equal(
      expiredResult,
      null
    );

    console.log(
      "✓ expired invite is rejected"
    );

    /*
     * ========================================
     * MANUAL REVOCATION
     * ========================================
     */

    const third =
      await createInvite({
        userId:
          testUser.id,
      });

    await revokeInvite(
      third.invite.id
    );

    const revokedResult =
      await validateInviteToken(
        third.token
      );

    assert.equal(
      revokedResult,
      null
    );

    console.log(
      "✓ revoked invite is rejected"
    );

    /*
     * ========================================
     * ACCEPTED INVITE
     * ========================================
     */

    const fourth =
      await createInvite({
        userId:
          testUser.id,
      });

    await prisma.invite.update({
      where: {
        id:
          fourth.invite.id,
      },

      data: {
        acceptedAt:
          new Date(),
      },
    });

    const acceptedResult =
      await validateInviteToken(
        fourth.token
      );

    assert.equal(
      acceptedResult,
      null
    );

    console.log(
      "✓ accepted invite cannot be reused"
    );

    /*
     * ========================================
     * ACTIVE USER CANNOT RECEIVE SETUP INVITE
     * ========================================
     */

    await prisma.user.update({
      where: {
        id:
          testUser.id,
      },

      data: {
        status:
          UserStatus.ACTIVE,
      },
    });

    let activeUserRejected =
      false;

    try {
      await createInvite({
        userId:
          testUser.id,
      });
    } catch {
      activeUserRejected =
        true;
    }

    assert.equal(
      activeUserRejected,
      true
    );

    console.log(
      "✓ active user cannot receive setup invite"
    );

    console.log("");

    console.log(
      "All invite service tests passed."
    );
  } finally {
    await prisma.user.delete({
      where: {
        id:
          testUser.id,
      },
    });
  }
}

runTests()
  .catch((error) => {
    console.error(
      "Invite service test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });