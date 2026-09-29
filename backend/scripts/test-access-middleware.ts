/// <reference types="node" />

import assert from "node:assert/strict";

import type {
  NextFunction,
  Response,
} from "express";

import {
  RoleDataScope,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import type {
  AccessContext,
} from "../src/services/access-control.js";

import {
  requireAuth,
  requireModelAccess,
  requireOwner,
  requirePermission,
  type AuthenticatedRequest,
} from "../src/middleware/access.js";

/*
 * =========================================================
 * MOCK RESPONSE
 * =========================================================
 */

type MockResponse = {
  readonly statusCode: number;
  readonly body: unknown;
  response: Response;
};

function createMockResponse(): MockResponse {
  const state = {
    statusCode: 200,
    body: undefined as unknown,
  };

  const response = {
    status(code: number) {
      state.statusCode = code;

      return this;
    },

    json(body: unknown) {
      state.body = body;

      return this;
    },
  } as Response;

  return {
    get statusCode() {
      return state.statusCode;
    },

    get body() {
      return state.body;
    },

    response,
  };
}

/*
 * =========================================================
 * TEST ACCESS CONTEXT
 * =========================================================
 */

function createAccessContext(
  overrides: Partial<AccessContext> = {}
): AccessContext {
  return {
    userId: "test-user",

    roles: [],

    highestRank: null,

    teamGroupId: null,

    effectiveDataScope:
      RoleDataScope.SELF,

    permissions:
      new Set<string>(),

    assignedModelIds: [],

    canSeeAllModels: false,

    ...overrides,
  };
}

/*
 * =========================================================
 * MODEL ID PARAMETER HELPER
 * =========================================================
 *
 * Express can type a route parameter as either:
 *
 * string
 *
 * or
 *
 * string[]
 *
 * requireModelAccess expects:
 *
 * string | undefined
 *
 * This helper safely handles both cases.
 */

function getModelIdFromParams(
  request: AuthenticatedRequest
): string | undefined {
  const modelId =
    request.params.modelId;

  if (Array.isArray(modelId)) {
    return modelId[0];
  }

  return modelId;
}

/*
 * =========================================================
 * TESTS
 * =========================================================
 */

async function runTests() {
  console.log(
    "Starting access middleware tests..."
  );

  /*
   * =======================================================
   * REQUIRE AUTH — NO USER
   * =======================================================
   */

  {
    const req =
      {} as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    const next: NextFunction =
      () => {
        nextCalled = true;
      };

    await requireAuth(
      req,
      res.response,
      next
    );

    assert.equal(
      res.statusCode,
      401
    );

    assert.equal(
      nextCalled,
      false
    );

    console.log(
      "✓ unauthenticated request returns 401"
    );
  }

  /*
   * =======================================================
   * REQUIRE PERMISSION — DENIED
   * =======================================================
   */

  {
    const req = {
      access:
        createAccessContext(),
    } as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    const next: NextFunction =
      () => {
        nextCalled = true;
      };

    requirePermission(
      "people.manage"
    )(
      req,
      res.response,
      next
    );

    assert.equal(
      res.statusCode,
      403
    );

    assert.equal(
      nextCalled,
      false
    );

    console.log(
      "✓ missing permission returns 403"
    );
  }

  /*
   * =======================================================
   * REQUIRE PERMISSION — ALLOWED
   * =======================================================
   */

  {
    const req = {
      access:
        createAccessContext({
          permissions:
            new Set([
              "people.manage",
            ]),
        }),
    } as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    const next: NextFunction =
      () => {
        nextCalled = true;
      };

    requirePermission(
      "people.manage"
    )(
      req,
      res.response,
      next
    );

    assert.equal(
      nextCalled,
      true
    );

    console.log(
      "✓ valid permission continues"
    );
  }

  /*
   * =======================================================
   * REQUIRE OWNER — DENIED
   * =======================================================
   */

  {
    const req = {
      access:
        createAccessContext({
          roles: [
            {
              id: "manager-role",
              systemKey: "MANAGER",
              name: "Manager",
              rank: 3,
              dataScope:
                RoleDataScope.SELF_AND_TEAM,
            },
          ],
        }),
    } as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    requireOwner(
      req,
      res.response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(
      res.statusCode,
      403
    );

    assert.equal(
      nextCalled,
      false
    );

    console.log(
      "✓ non-Owner returns 403"
    );
  }

  /*
   * =======================================================
   * REQUIRE OWNER — ALLOWED
   * =======================================================
   */

  {
    const req = {
      access:
        createAccessContext({
          roles: [
            {
              id: "owner-role",
              systemKey: "OWNER",
              name: "Owner",
              rank: 1,
              dataScope:
                RoleDataScope.ALL,
            },
          ],
        }),
    } as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    requireOwner(
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

    console.log(
      "✓ Owner access continues"
    );
  }

  /*
   * =======================================================
   * MODEL ACCESS — DENIED
   * =======================================================
   */

  {
    const req = {
      params: {
        modelId: "model-b",
      },

      access:
        createAccessContext({
          assignedModelIds: [
            "model-a",
          ],
        }),
    } as unknown as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    requireModelAccess(
      getModelIdFromParams
    )(
      req,
      res.response,
      () => {
        nextCalled = true;
      }
    );

    assert.equal(
      res.statusCode,
      403
    );

    assert.equal(
      nextCalled,
      false
    );

    console.log(
      "✓ unassigned model returns 403"
    );
  }

  /*
   * =======================================================
   * MODEL ACCESS — ASSIGNED MODEL
   * =======================================================
   */

  {
    const req = {
      params: {
        modelId: "model-a",
      },

      access:
        createAccessContext({
          assignedModelIds: [
            "model-a",
          ],
        }),
    } as unknown as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    requireModelAccess(
      getModelIdFromParams
    )(
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

    console.log(
      "✓ assigned model access continues"
    );
  }

  /*
   * =======================================================
   * MODEL ACCESS — GLOBAL ACCESS
   * =======================================================
   */

  {
    const req = {
      params: {
        modelId: "any-model",
      },

      access:
        createAccessContext({
          canSeeAllModels: true,
        }),
    } as unknown as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    requireModelAccess(
      getModelIdFromParams
    )(
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

    console.log(
      "✓ global model access continues"
    );
  }

  /*
   * =======================================================
   * REQUIRE AUTH — REAL LOCAL DATABASE USER
   * =======================================================
   *
   * Creates a temporary local user,
   * gives them the Owner role,
   * runs the real access-context lookup,
   * then deletes the temporary user.
   */

  const ownerRole =
    await prisma.role.findUnique({
      where: {
        systemKey: "OWNER",
      },
    });

  assert.ok(
    ownerRole,
    "Owner role must exist before middleware tests."
  );

  const testEmail =
    `middleware-test-${Date.now()}@example.test`;

  const testUser =
    await prisma.user.create({
      data: {
        name:
          "Middleware Test User",

        email:
          testEmail,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              ownerRole.id,
          },
        },
      },
    });

  try {
    const req = {
      userId:
        testUser.id,
    } as AuthenticatedRequest;

    const res =
      createMockResponse();

    let nextCalled = false;

    await requireAuth(
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

    assert.ok(
      req.access
    );

    assert.equal(
      req.access.highestRank,
      1
    );

    assert.equal(
      req.access.roles.some(
        (role) =>
          role.systemKey ===
          "OWNER"
      ),
      true
    );

    assert.equal(
      req.access.permissions.has(
        "people.manage"
      ),
      true
    );

    assert.equal(
      req.access.canSeeAllModels,
      true
    );

    console.log(
      "✓ authenticated user loads real access context"
    );
  } finally {
    await prisma.user.delete({
      where: {
        id: testUser.id,
      },
    });
  }

  /*
   * =======================================================
   * COMPLETE
   * =======================================================
   */

  console.log("");

  console.log(
    "All access middleware tests passed."
  );
}

runTests()
  .catch((error) => {
    console.error(
      "Middleware test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });