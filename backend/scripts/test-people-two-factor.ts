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
  getAccessContext,
} from "../src/services/access-control.js";

import {
  createSession,
  validateSessionToken,
} from "../src/services/session.js";

import {
  createEmailTwoFactorChallenge,
} from "../src/services/two-factor.js";

import {
  resetPersonTwoFactor,
  PeopleTwoFactorError,
} from "../src/services/people-two-factor.js";

async function expectResetError(
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
        PeopleTwoFactorError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-two-factor tests..."
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
          "2FA Reset Owner",

        email:
          `2fa-owner-${suffix}@example.test`,

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
          "2FA Reset Manager",

        email:
          `2fa-manager-${suffix}@example.test`,

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
          "2FA Reset Target",

        email:
          `2fa-target-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        emailVerifiedAt:
          new Date(),

        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },

        twoFactorMethods: {
          create: [
            {
              type:
                TwoFactorMethodType.EMAIL,

              isEnabled:
                true,

              verifiedAt:
                new Date(),
            },

            {
              type:
                TwoFactorMethodType.AUTHENTICATOR,

              isEnabled:
                true,

              verifiedAt:
                new Date(),

              secretEncrypted:
                "future-test-secret",
            },
          ],
        },
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

    await expectResetError(
      () =>
        resetPersonTwoFactor(
          target.id,
          managerAccess
        ),

      "TWO_FACTOR_RESET_REQUIRED"
    );

    console.log(
      "✓ Manager cannot reset 2FA"
    );

    const ownerWithoutPermission = {
      ...ownerAccess,

      permissions:
        new Set(
          [...ownerAccess.permissions]
            .filter(
              (permission) =>
                permission !==
                "two_factor.reset"
            )
        ),
    };

    await expectResetError(
      () =>
        resetPersonTwoFactor(
          target.id,
          ownerWithoutPermission
        ),

      "TWO_FACTOR_RESET_REQUIRED"
    );

    console.log(
      "✓ explicit two_factor.reset permission is required"
    );

    const session =
      await createSession({
        userId:
          target.id,

        expiresAt:
          new Date(
            Date.now() +
              60 * 60 * 1000
          ),
      });

    assert.ok(
      await validateSessionToken(
        session.token
      )
    );

    console.log(
      "✓ target has a valid session before reset"
    );

    const challenge =
      await createEmailTwoFactorChallenge(
        target.id
      );

    assert.equal(
      challenge
        .challenge
        .consumedAt,
      null
    );

    console.log(
      "✓ target has an active 2FA challenge before reset"
    );

    const reset =
      await resetPersonTwoFactor(
        target.id,
        ownerAccess
      );

    assert.equal(
      reset.user.id,
      target.id
    );

    assert.equal(
      reset.method,
      "EMAIL"
    );

    console.log(
      "✓ Owner can reset another user's 2FA"
    );

    const storedChallenge =
      await prisma
        .twoFactorChallenge
        .findUniqueOrThrow({
          where: {
            id:
              challenge.challenge.id,
          },
        });

    assert.ok(
      storedChallenge.consumedAt
    );

    console.log(
      "✓ outstanding 2FA challenge is invalidated"
    );

    assert.equal(
      await validateSessionToken(
        session.token
      ),
      null
    );

    console.log(
      "✓ existing session is revoked"
    );

    const authenticator =
      await prisma
        .userTwoFactorMethod
        .findUnique({
          where: {
            userId_type: {
              userId:
                target.id,

              type:
                TwoFactorMethodType
                  .AUTHENTICATOR,
            },
          },
        });

    assert.equal(
      authenticator,
      null
    );

    console.log(
      "✓ authenticator enrollment is cleared"
    );

    const emailMethod =
      await prisma
        .userTwoFactorMethod
        .findUnique({
          where: {
            userId_type: {
              userId:
                target.id,

              type:
                TwoFactorMethodType
                  .EMAIL,
            },
          },
        });

    assert.ok(
      emailMethod
    );

    assert.equal(
      emailMethod.isEnabled,
      true
    );

    console.log(
      "✓ email 2FA remains enabled"
    );

    const freshChallenge =
      await createEmailTwoFactorChallenge(
        target.id
      );

    assert.ok(
      freshChallenge.code
    );

    assert.equal(
      freshChallenge
        .code
        .length,
      6
    );

    console.log(
      "✓ fresh email 2FA challenge can be issued after reset"
    );

    console.log("");

    console.log(
      "All people-two-factor tests passed."
    );
  } finally {
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
      "People-two-factor test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });