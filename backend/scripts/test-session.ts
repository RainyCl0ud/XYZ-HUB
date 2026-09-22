/// <reference types="node" />

import assert from "node:assert/strict";

import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  createSession,
  revokeAllUserSessions,
  revokeSessionToken,
  validateSessionToken,
} from "../src/services/session.js";

async function runTests() {
  console.log(
    "Starting session service tests..."
  );

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "Session Test User",

        email:
          `session-test-${Date.now()}@example.test`,

        status:
          UserStatus.ACTIVE,
      },
    });

  try {
    /*
     * ========================================
     * CREATE + VALIDATE SESSION
     * ========================================
     */

    const {
      token,
      session,
    } =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),

        userAgent:
          "XYZ Hub test",

        ipAddress:
          "127.0.0.1",
      });

    assert.notEqual(
      session.tokenHash,
      token
    );

    console.log(
      "✓ raw session token is not stored"
    );

    const validSession =
      await validateSessionToken(
        token
      );

    assert.ok(
      validSession
    );

    assert.equal(
      validSession.userId,
      testUser.id
    );

    console.log(
      "✓ valid session is accepted"
    );

    /*
     * ========================================
     * INVALID TOKEN
     * ========================================
     */

    const invalidSession =
      await validateSessionToken(
        "not-a-real-session-token"
      );

    assert.equal(
      invalidSession,
      null
    );

    console.log(
      "✓ invalid token is rejected"
    );

    /*
     * ========================================
     * REVOKE ONE SESSION
     * ========================================
     */

    await revokeSessionToken(
      token
    );

    const revokedSession =
      await validateSessionToken(
        token
      );

    assert.equal(
      revokedSession,
      null
    );

    console.log(
      "✓ revoked session is rejected"
    );

    /*
     * ========================================
     * EXPIRED SESSION
     * ========================================
     */

    const expired =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() -
              60 * 1000
          ),
      });

    const expiredResult =
      await validateSessionToken(
        expired.token
      );

    assert.equal(
      expiredResult,
      null
    );

    console.log(
      "✓ expired session is rejected"
    );

    /*
     * ========================================
     * DEACTIVATED USER
     * ========================================
     */

    const activeSession =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),
      });

    await prisma.user.update({
      where: {
        id: testUser.id,
      },

      data: {
        status:
          UserStatus.DEACTIVATED,

        deactivatedAt:
          new Date(),
      },
    });

    const deactivatedResult =
      await validateSessionToken(
        activeSession.token
      );

    assert.equal(
      deactivatedResult,
      null
    );

    console.log(
      "✓ deactivated user cannot use existing session"
    );

    /*
     * Reactivate only for the remaining test.
     */
    await prisma.user.update({
      where: {
        id: testUser.id,
      },

      data: {
        status:
          UserStatus.ACTIVE,

        deactivatedAt:
          null,
      },
    });

    /*
     * ========================================
     * REVOKE ALL USER SESSIONS
     * ========================================
     */

    const sessionOne =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),
      });

    const sessionTwo =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),
      });

    await revokeAllUserSessions(
      testUser.id
    );

    assert.equal(
      await validateSessionToken(
        sessionOne.token
      ),
      null
    );

    assert.equal(
      await validateSessionToken(
        sessionTwo.token
      ),
      null
    );

    console.log(
      "✓ all user sessions can be revoked immediately"
    );

    console.log("");

    console.log(
      "All session service tests passed."
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
      "Session test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });