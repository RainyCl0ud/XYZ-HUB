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
  deactivatePerson,
  reactivatePerson,
  PeopleStatusError,
} from "../src/services/people-status.js";

import {
  createSession,
  validateSessionToken,
} from "../src/services/session.js";

async function expectStatusError(
  action: () => Promise<unknown>,
  expectedCode: string
) {
  try {
    await action();

    assert.fail(
      `Expected ${expectedCode}`
    );
  } catch (error) {
    assert.ok(
      error instanceof
        PeopleStatusError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-status tests..."
  );

  const suffix =
    Date.now();

  const ownerRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "OWNER",
      },
    });

  const managerRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "MANAGER",
      },
    });

  const chatterRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "CHATTER",
      },
    });

  const qcRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "QC",
      },
    });

  assert.ok(ownerRole);
  assert.ok(managerRole);
  assert.ok(chatterRole);
  assert.ok(qcRole);

  const modelA =
    await prisma.agencyModel.create({
      data: {
        name:
          `Status Model A ${suffix}`,
      },
    });

  const modelB =
    await prisma.agencyModel.create({
      data: {
        name:
          `Status Model B ${suffix}`,
      },
    });

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Status Test Owner",

        email:
          `status-owner-${suffix}@example.test`,

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
          "Status Test Manager",

        email:
          `status-manager-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              managerRole.id,
          },
        },

        modelAssignments: {
          create: {
            modelId:
              modelA.id,
          },
        },
      },
    });

  const chatter =
    await prisma.user.create({
      data: {
        name:
          "Status Test Chatter",

        email:
          `status-chatter-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },

        modelAssignments: {
          create: {
            modelId:
              modelA.id,
          },
        },
      },
    });

  const inaccessibleChatter =
    await prisma.user.create({
      data: {
        name:
          "Other Model Chatter",

        email:
          `status-other-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },

        modelAssignments: {
          create: {
            modelId:
              modelB.id,
          },
        },
      },
    });

  const qc =
    await prisma.user.create({
      data: {
        name:
          "Status Test QC",

        email:
          `status-qc-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              qcRole.id,
          },
        },

        modelAssignments: {
          create: {
            modelId:
              modelA.id,
          },
        },
      },
    });

  const createdUserIds = [
    owner.id,
    manager.id,
    chatter.id,
    inaccessibleChatter.id,
    qc.id,
  ];

  try {
    const managerAccess =
      await getAccessContext(
        manager.id
      );

    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    const qcAccess =
      await getAccessContext(
        qc.id
      );

    const session =
      await createSession({
        userId:
          chatter.id,

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
      "✓ active Chatter session is valid"
    );

    const deactivated =
      await deactivatePerson(
        chatter.id,
        managerAccess
      );

    assert.equal(
      deactivated.status,
      UserStatus.DEACTIVATED
    );

    assert.ok(
      deactivated.deactivatedAt
    );

    console.log(
      "✓ Manager can deactivate lower-ranked Chatter"
    );

    assert.equal(
      await validateSessionToken(
        session.token
      ),
      null
    );

    console.log(
      "✓ deactivation immediately invalidates existing session"
    );

    const storedSession =
      await prisma.session.findFirst({
        where: {
          userId:
            chatter.id,
        },

        orderBy: {
          createdAt:
            "desc",
        },
      });

    assert.ok(
      storedSession?.revokedAt
    );

    console.log(
      "✓ stored session is permanently revoked"
    );

    await expectStatusError(
      () =>
        deactivatePerson(
          manager.id,
          managerAccess
        ),

      "ROLE_NOT_MANAGEABLE"
    );

    console.log(
      "✓ Manager cannot deactivate another Manager-level account"
    );

    await expectStatusError(
      () =>
        deactivatePerson(
          inaccessibleChatter.id,
          managerAccess
        ),

      "MODEL_NOT_MANAGEABLE"
    );

    console.log(
      "✓ Manager cannot deactivate Chatter on an inaccessible model"
    );

    await expectStatusError(
      () =>
        deactivatePerson(
          inaccessibleChatter.id,
          qcAccess
        ),

      "PEOPLE_DEACTIVATE_REQUIRED"
    );

    console.log(
      "✓ QC cannot deactivate users"
    );

    const reactivated =
      await reactivatePerson(
        chatter.id,
        ownerAccess
      );

    assert.equal(
      reactivated.status,
      UserStatus.ACTIVE
    );

    assert.equal(
      reactivated.deactivatedAt,
      null
    );

    console.log(
      "✓ Owner can reactivate a deactivated account"
    );

    assert.equal(
      await validateSessionToken(
        session.token
      ),
      null
    );

    console.log(
      "✓ old session stays invalid after reactivation"
    );

    const restored =
      await prisma.user.findUnique({
        where: {
          id:
            chatter.id,
        },

        include: {
          roleMemberships:
            true,

          modelAssignments:
            true,
        },
      });

    assert.equal(
      restored
        ?.roleMemberships
        .length,
      1
    );

    assert.equal(
      restored
        ?.modelAssignments
        .length,
      1
    );

    console.log(
      "✓ role and model records are preserved for history/reactivation"
    );

    console.log("");

    console.log(
      "All people-status tests passed."
    );
  } finally {
    await prisma.session.deleteMany({
      where: {
        userId: {
          in:
            createdUserIds,
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in:
            createdUserIds,
        },
      },
    });

    await prisma.agencyModel.deleteMany({
      where: {
        id: {
          in: [
            modelA.id,
            modelB.id,
          ],
        },
      },
    });
  }
}

runTests()
  .catch((error) => {
    console.error(
      "People-status test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });