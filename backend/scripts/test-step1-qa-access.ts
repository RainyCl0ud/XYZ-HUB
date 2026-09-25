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
  canConfigureQa,
  canViewQa,
  listAccessibleQaModels,
  QaAccessError,
  resolveIncidentCreationModel,
  resolveQaModelScope,
} from "../src/services/qa-access.js";

async function expectQaError(
  action:
    () => Promise<unknown>,
  expectedCode:
    QaAccessError["code"]
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
        QaAccessError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function main() {
  console.log(
    "Starting Step 1 QA model-scope tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    managerRole,
    qcRole,
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
            "QC",
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
  assert.ok(qcRole);
  assert.ok(chatterRole);

  const modelA =
    await prisma.agencyModel.create({
      data: {
        name:
          `QA Scope A ${suffix}`,
      },
    });

  const modelB =
    await prisma.agencyModel.create({
      data: {
        name:
          `QA Scope B ${suffix}`,
      },
    });

  const owner =
    await prisma.user.create({
      data: {
        name:
          "QA Scope Owner",
        email:
          `qa-owner-${suffix}@example.test`,
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
          "QA Scope Manager",
        email:
          `qa-manager-${suffix}@example.test`,
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

  const qc =
    await prisma.user.create({
      data: {
        name:
          "QA Scope QC",
        email:
          `qa-qc-${suffix}@example.test`,
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

  const chatterUser =
    await prisma.user.create({
      data: {
        name:
          "QA Scope Chatter",
        email:
          `qa-chatter-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        roleMemberships: {
          create: {
            roleId:
              chatterRole.id,
          },
        },
        modelAssignments: {
          create: [
            {
              modelId:
                modelA.id,
            },
            {
              modelId:
                modelB.id,
            },
          ],
        },
      },
    });

  const chatter =
    await prisma.chatter.create({
      data: {
        name:
          `QA Scope Chatter ${suffix}`,
        userId:
          chatterUser.id,
      },
    });

  try {
    const [
      ownerAccess,
      managerAccess,
      qcAccess,
      chatterAccess,
    ] =
      await Promise.all([
        getAccessContext(
          owner.id
        ),
        getAccessContext(
          manager.id
        ),
        getAccessContext(
          qc.id
        ),
        getAccessContext(
          chatterUser.id
        ),
      ]);

    assert.equal(
      canViewQa(
        ownerAccess
      ),
      true
    );

    assert.equal(
      canViewQa(
        managerAccess
      ),
      true
    );

    assert.equal(
      canViewQa(
        qcAccess
      ),
      true
    );

    assert.equal(
      canConfigureQa(
        qcAccess
      ),
      false
    );

    assert.equal(
      canViewQa(
        chatterAccess
      ),
      false
    );

    console.log(
      "✓ operational QA roles and QC read-only boundary are enforced"
    );

    const ownerModels =
      await listAccessibleQaModels(
        ownerAccess
      );

    assert.ok(
      ownerModels.some(
        (
          model
        ) =>
          model.id ===
          modelA.id
      )
    );

    assert.ok(
      ownerModels.some(
        (
          model
        ) =>
          model.id ===
          modelB.id
      )
    );

    const managerModels =
      await listAccessibleQaModels(
        managerAccess
      );

    assert.deepEqual(
      managerModels.map(
        (
          model
        ) =>
          model.id
      ),
      [
        modelA.id,
      ]
    );

    const qcModels =
      await listAccessibleQaModels(
        qcAccess
      );

    assert.deepEqual(
      qcModels.map(
        (
          model
        ) =>
          model.id
      ),
      [
        modelA.id,
      ]
    );

    console.log(
      "✓ Owner sees all models while Manager/QC are assignment-scoped"
    );

    await expectQaError(
      () =>
        resolveQaModelScope(
          managerAccess,
          modelB.id
        ),
      "MODEL_NOT_ACCESSIBLE"
    );

    console.log(
      "✓ Manager cannot select an unassigned model"
    );

    const managerCreation =
      await resolveIncidentCreationModel(
        managerAccess,
        chatter.id,
        null
      );

    assert.equal(
      managerCreation?.model
        ?.id,
      modelA.id
    );

    console.log(
      "✓ single accessible chatter/model intersection auto-selects safely"
    );

    await expectQaError(
      () =>
        resolveIncidentCreationModel(
          ownerAccess,
          chatter.id,
          null
        ),
      "MODEL_CONTEXT_REQUIRED"
    );

    console.log(
      "✓ multi-model chatter requires explicit model context for global users"
    );

    const ownerExplicit =
      await resolveIncidentCreationModel(
        ownerAccess,
        chatter.id,
        modelB.id
      );

    assert.equal(
      ownerExplicit?.model
        ?.id,
      modelB.id
    );

    console.log(
      "✓ global user can explicitly log against an assigned model"
    );

    console.log("");
    console.log(
      "All Step 1 QA model-scope tests passed."
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
            owner.id,
            manager.id,
            qc.id,
            chatterUser.id,
          ],
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

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "Step 1 QA scope test failed:",
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
