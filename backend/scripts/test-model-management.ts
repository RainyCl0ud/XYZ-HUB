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
  createManagedModel,
  deactivateManagedModel,
  listManagedModels,
  ModelManagementError,
  reactivateManagedModel,
  renameManagedModel,
} from "../src/services/model-management.js";

async function expectModelError(
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
  } catch (
    error
  ) {
    assert.ok(
      error instanceof
        ModelManagementError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting model-management tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    opsRole,
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
            "OPS_MANAGER",
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
  assert.ok(opsRole);
  assert.ok(managerRole);
  assert.ok(chatterRole);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Model Test Owner",

        email:
          `model-owner-${suffix}@example.test`,

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

  const ops =
    await prisma.user.create({
      data: {
        name:
          "Model Test Ops",

        email:
          `model-ops-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              opsRole.id,
          },
        },
      },
    });

  const manager =
    await prisma.user.create({
      data: {
        name:
          "Model Test Manager",

        email:
          `model-manager-${suffix}@example.test`,

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

  const chatter =
    await prisma.user.create({
      data: {
        name:
          "Model Test Chatter",

        email:
          `model-chatter-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,

        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },
      },
    });

  let createdModelId:
    string | null =
      null;

  const createdUserIds = [
    owner.id,
    ops.id,
    manager.id,
    chatter.id,
  ];

  try {
    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    const opsAccess =
      await getAccessContext(
        ops.id
      );

    const managerAccess =
      await getAccessContext(
        manager.id
      );

    await expectModelError(
      () =>
        listManagedModels(
          managerAccess
        ),

      "MODEL_MANAGEMENT_REQUIRED"
    );

    console.log(
      "✓ Manager cannot manage the model catalog"
    );

    const created =
      await createManagedModel(
        `Model Catalog Test ${suffix}`,
        ownerAccess
      );

    createdModelId =
      created.id;

    assert.equal(
      created.isActive,
      true
    );

    console.log(
      "✓ Owner can create an active model"
    );

    await expectModelError(
      () =>
        createManagedModel(
          `model catalog test ${suffix}`,
          ownerAccess
        ),

      "MODEL_NAME_IN_USE"
    );

    console.log(
      "✓ duplicate model names are blocked case-insensitively"
    );

    const renamed =
      await renameManagedModel(
        created.id,
        `Renamed Model ${suffix}`,
        opsAccess
      );

    assert.equal(
      renamed.name,
      `Renamed Model ${suffix}`
    );

    console.log(
      "✓ Ops Manager can rename a model"
    );

    await prisma.userModelAssignment.create({
      data: {
        userId:
          chatter.id,

        modelId:
          created.id,

        assignedByUserId:
          owner.id,
      },
    });

    const listed =
      await listManagedModels(
        ownerAccess
      );

    const listedModel =
      listed.find(
        (
          model
        ) =>
          model.id ===
          created.id
      );

    assert.ok(
      listedModel
    );

    assert.equal(
      listedModel.peopleCount,
      1
    );

    console.log(
      "✓ model list includes current assignment counts"
    );

    const deactivated =
      await deactivateManagedModel(
        created.id,
        opsAccess
      );

    assert.equal(
      deactivated.isActive,
      false
    );

    const preservedAssignment =
      await prisma.userModelAssignment.findUnique({
        where: {
          userId_modelId: {
            userId:
              chatter.id,

            modelId:
              created.id,
          },
        },
      });

    assert.ok(
      preservedAssignment
    );

    console.log(
      "✓ deactivation preserves existing user assignments"
    );

    await expectModelError(
      () =>
        deactivateManagedModel(
          created.id,
          ownerAccess
        ),

      "MODEL_ALREADY_INACTIVE"
    );

    console.log(
      "✓ inactive model cannot be deactivated twice"
    );

    const reactivated =
      await reactivateManagedModel(
        created.id,
        ownerAccess
      );

    assert.equal(
      reactivated.isActive,
      true
    );

    console.log(
      "✓ Owner can reactivate a model"
    );

    await expectModelError(
      () =>
        reactivateManagedModel(
          created.id,
          ownerAccess
        ),

      "MODEL_ALREADY_ACTIVE"
    );

    console.log(
      "✓ active model cannot be reactivated twice"
    );

    console.log("");
    console.log(
      "All model-management tests passed."
    );
  } finally {
    if (
      createdModelId
    ) {
      await prisma.userModelAssignment.deleteMany({
        where: {
          modelId:
            createdModelId,
        },
      });

      await prisma.agencyModel.deleteMany({
        where: {
          id:
            createdModelId,
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: {
          in:
            createdUserIds,
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
        "Model-management test failed:",
        error
      );

      process.exit(
        1
      );
    }
  )
  .finally(
    async () => {
      await prisma.$disconnect();
    }
  );
