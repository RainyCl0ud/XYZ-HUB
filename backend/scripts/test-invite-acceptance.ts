/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  TwoFactorMethodType,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  createInvite,
  acceptInviteToken,
  validateInviteToken,
} from "../src/services/invite.js";

import {
  verifyPassword,
} from "../src/services/password.js";

async function runTests() {
  console.log(
    "Starting invite-acceptance tests..."
  );

  const password =
    "Invite-Test-Password-2026!";

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "Invite Acceptance Test User",

        email:
          `invite-accept-${Date.now()}@example.test`,

        status:
          UserStatus.PENDING_SETUP,
      },
    });

  try {
    /*
     * ========================================
     * CREATE INVITATION
     * ========================================
     */

    const {
      token,
      invite,
    } =
      await createInvite({
        userId:
          testUser.id,
      });

    assert.equal(
      invite.acceptedAt,
      null
    );

    console.log(
      "✓ pending user received invite"
    );

    /*
     * ========================================
     * ACCEPT INVITATION
     * ========================================
     */

    const result =
      await acceptInviteToken(
        token,
        password
      );

    assert.equal(
      result.status,
      "ACCEPTED"
    );

    console.log(
      "✓ valid invite can be accepted"
    );

    /*
     * ========================================
     * USER BECOMES ACTIVE
     * ========================================
     */

    const activatedUser =
      await prisma.user.findUnique({
        where: {
          id:
            testUser.id,
        },
      });

    assert.ok(
      activatedUser
    );

    assert.equal(
      activatedUser.status,
      UserStatus.ACTIVE
    );

    assert.ok(
      activatedUser.passwordHash
    );

    assert.notEqual(
      activatedUser.passwordHash,
      password
    );

    console.log(
      "✓ account becomes ACTIVE with hashed password"
    );

    /*
     * ========================================
     * PASSWORD VERIFICATION
     * ========================================
     */

    assert.equal(
      await verifyPassword(
        password,
        activatedUser.passwordHash!
      ),
      true
    );

    console.log(
      "✓ invitee-created password verifies correctly"
    );

    /*
     * ========================================
     * EMAIL VERIFIED
     * ========================================
     */

    assert.ok(
      activatedUser.emailVerifiedAt
    );

    console.log(
      "✓ invite acceptance verifies email ownership"
    );

    /*
     * ========================================
     * EMAIL 2FA INITIALIZED
     * ========================================
     */

    const emailTwoFactor =
      await prisma.userTwoFactorMethod.findUnique({
        where: {
          userId_type: {
            userId:
              testUser.id,

            type:
              TwoFactorMethodType.EMAIL,
          },
        },
      });

    assert.ok(
      emailTwoFactor
    );

    assert.equal(
      emailTwoFactor.isEnabled,
      true
    );

    assert.ok(
      emailTwoFactor.verifiedAt
    );

    console.log(
      "✓ email 2FA method initialized"
    );

    /*
     * ========================================
     * INVITE MARKED ACCEPTED
     * ========================================
     */

    const acceptedInvite =
      await prisma.invite.findUnique({
        where: {
          id:
            invite.id,
        },
      });

    assert.ok(
      acceptedInvite?.acceptedAt
    );

    console.log(
      "✓ invite marked accepted"
    );

    /*
     * ========================================
     * ACCEPTED TOKEN IS NO LONGER VALID
     * ========================================
     */

    const validationAfterAcceptance =
      await validateInviteToken(
        token
      );

    assert.equal(
      validationAfterAcceptance,
      null
    );

    console.log(
      "✓ accepted invite is no longer valid"
    );

    /*
     * ========================================
     * TOKEN CANNOT BE ACCEPTED TWICE
     * ========================================
     */

    const reuseResult =
      await acceptInviteToken(
        token,
        "Another-Password-2026!"
      );

    assert.equal(
      reuseResult.status,
      "INVALID_INVITE"
    );

    console.log(
      "✓ accepted invite cannot be reused"
    );

    /*
     * Make sure reuse did NOT change the
     * user's original password.
     */
    const afterReuse =
      await prisma.user.findUnique({
        where: {
          id:
            testUser.id,
        },
      });

    assert.ok(
      afterReuse?.passwordHash
    );

    assert.equal(
      await verifyPassword(
        password,
        afterReuse.passwordHash
      ),
      true
    );

    console.log(
      "✓ reuse attempt cannot overwrite password"
    );

    console.log("");

    console.log(
      "All invite-acceptance tests passed."
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
      "Invite-acceptance test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });