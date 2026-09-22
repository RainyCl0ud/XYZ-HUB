/// <reference types="node" />

import assert from "node:assert/strict";

import type {
  NextFunction,
  Response,
} from "express";

import {
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  loadSession,
  type SessionAuthenticatedRequest,
} from "../src/middleware/session-auth.js";

import {
  createSession,
} from "../src/services/session.js";

import {
  SESSION_COOKIE_NAME,
} from "../src/services/session-cookie.js";

type MockResponse = {
  response: Response;
  clearedCookies: string[];
};

function createMockResponse(): MockResponse {
  const clearedCookies: string[] = [];

  const response = {
    clearCookie(
      name: string
    ) {
      clearedCookies.push(
        name
      );

      return this;
    },
  } as Response;

  return {
    response,
    clearedCookies,
  };
}

async function runTests() {
  console.log(
    "Starting session-auth tests..."
  );

  /*
   * ==========================================
   * NO COOKIE
   * ==========================================
   */

  {
    const req = {
      cookies: {},
    } as SessionAuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    const next: NextFunction =
      () => {
        nextCalled = true;
      };

    await loadSession(
      req,
      res.response,
      next
    );

    assert.equal(
      nextCalled,
      true
    );

    assert.equal(
      req.userId,
      undefined
    );

    console.log(
      "✓ request without session continues anonymously"
    );
  }

  /*
   * ==========================================
   * INVALID COOKIE
   * ==========================================
   */

  {
    const req = {
      cookies: {
        [SESSION_COOKIE_NAME]:
          "invalid-session-token",
      },
    } as SessionAuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    await loadSession(
      req,
      res.response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(
      nextCalled,
      true
    );

    assert.equal(
      req.userId,
      undefined
    );

    assert.equal(
      res.clearedCookies.includes(
        SESSION_COOKIE_NAME
      ),
      true
    );

    console.log(
      "✓ invalid session cookie is cleared"
    );
  }

  /*
   * ==========================================
   * REAL VALID SESSION
   * ==========================================
   */

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "Session Auth Test User",

        email:
          `session-auth-${Date.now()}@example.test`,

        status:
          UserStatus.ACTIVE,
      },
    });

  try {
    const created =
      await createSession({
        userId:
          testUser.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),
      });

    const req = {
      cookies: {
        [SESSION_COOKIE_NAME]:
          created.token,
      },
    } as SessionAuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    await loadSession(
      req,
      res.response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(
      nextCalled,
      true
    );

    assert.equal(
      req.userId,
      testUser.id
    );

    assert.equal(
      req.sessionId,
      created.session.id
    );

    console.log(
      "✓ valid cookie loads user and session"
    );

    /*
     * ========================================
     * DEACTIVATED USER
     * ========================================
     */

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

    const deactivatedReq = {
      cookies: {
        [SESSION_COOKIE_NAME]:
          created.token,
      },
    } as SessionAuthenticatedRequest;

    const deactivatedRes =
      createMockResponse();

    await loadSession(
      deactivatedReq,
      deactivatedRes.response,
      () => {}
    );

    assert.equal(
      deactivatedReq.userId,
      undefined
    );

    assert.equal(
      deactivatedRes.clearedCookies.includes(
        SESSION_COOKIE_NAME
      ),
      true
    );

    console.log(
      "✓ deactivated user's cookie is rejected and cleared"
    );
  } finally {
    await prisma.user.delete({
      where: {
        id: testUser.id,
      },
    });
  }

  console.log("");

  console.log(
    "All session-auth tests passed."
  );
}

runTests()
  .catch((error) => {
    console.error(
      "Session-auth test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });