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
  getAccessContext,
} from "../src/services/access-control.js";

import {
  deletePerson,
  PeopleDeleteError,
} from "../src/services/people-delete.js";

async function expectDeleteError(
  action:
    () => Promise<unknown>,

  expectedCode:
    string
) {
  try {
    await action();

    assert.fail(
      `Expected ${expectedCode}`
    );
  } catch (error) {
    assert.ok(
      error instanceof
        PeopleDeleteError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-delete tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    managerRole,
    chatterRole,
  ] =
    await Promise.all([
      prisma.role.findUnique({
        where: {
          systemKey:
            "OWNER",
        },
      }),

      prisma.role.findUnique({
        where: {
          systemKey:
            "MANAGER",
        },
      }),

      prisma.role.findUnique({
        where: {
          systemKey:
            "CHATTER",
        },
      }),
    ]);

  assert.ok(ownerRole);
  assert.ok(managerRole);
  assert.ok(chatterRole);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Delete Test Owner",

        email:
          `delete-owner-${suffix}@example.test`,

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

  const manager =
    await prisma.user.create({
      data: {
        name:
          "Delete Test Manager",

        email:
          `delete-manager-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              managerRole.id,
          },
        },
      },
    });

  const target =
    await prisma.user.create({
      data: {
        name:
          "Delete Target",

        email:
          `delete-target-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },

        sessions: {
          create: {
            tokenHash:
              `delete-session-${suffix}`,

            expiresAt:
              new Date(
                Date.now() +
                  60 * 60 * 1000
              ),
          },
        },
      },
    });

  const chatter =
    await prisma.chatter.create({
      data: {
        name:
          "Preserved QA Chatter",

        userId:
          target.id,
      },
    });

  try {
    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    const managerAccess =
      await getAccessContext(
        manager.id
      );

    await expectDeleteError(
      () =>
        deletePerson(
          {
            userId:
              target.id,

            confirmEmail:
              target.email,
          },

          managerAccess
        ),

      "OWNER_REQUIRED"
    );

    console.log(
      "✓ Manager cannot permanently delete users"
    );

    await expectDeleteError(
      () =>
        deletePerson(
          {
            userId:
              owner.id,

            confirmEmail:
              owner.email,
          },

          ownerAccess
        ),

      "CANNOT_DELETE_SELF"
    );

    console.log(
      "✓ Owner cannot permanently delete own account"
    );

    await expectDeleteError(
      () =>
        deletePerson(
          {
            userId:
              target.id,

            confirmEmail:
              "wrong@example.test",
          },

          ownerAccess
        ),

      "CONFIRMATION_MISMATCH"
    );

    console.log(
      "✓ deletion requires exact target email confirmation"
    );

    const result =
      await deletePerson(
        {
          userId:
            target.id,

          confirmEmail:
            target.email.toUpperCase(),
        },

        ownerAccess
      );

    assert.equal(
      result.id,
      target.id
    );

    console.log(
      "✓ Owner can permanently delete another user"
    );

    const deletedUser =
      await prisma.user.findUnique({
        where: {
          id:
            target.id,
        },
      });

    assert.equal(
      deletedUser,
      null
    );

    console.log(
      "✓ Login Gate user record is removed"
    );

    const preservedChatter =
      await prisma.chatter.findUnique({
        where: {
          id:
            chatter.id,
        },
      });

    assert.ok(
      preservedChatter
    );

    assert.equal(
      preservedChatter.userId,
      null
    );

    console.log(
      "✓ QA Chatter record is preserved and detached"
    );

    const sessions =
      await prisma.session.count({
        where: {
          userId:
            target.id,
        },
      });

    assert.equal(
      sessions,
      0
    );

    console.log(
      "✓ deleted user's authentication sessions are removed"
    );

    console.log("");

    console.log(
      "All people-delete tests passed."
    );
  } finally {
    await prisma.chatter.deleteMany({
      where: {
        id:
          chatter.id,
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            target.id,
            manager.id,
            owner.id,
          ],
        },
      },
    });
  }
}

runTests()
  .catch((error) => {
    console.error(
      "People-delete test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });