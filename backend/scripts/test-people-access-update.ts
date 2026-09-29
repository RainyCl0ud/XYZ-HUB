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
  ROOT_TEAM_GROUP_ID,
} from "../src/services/team-hierarchy.js";

import {
  updatePersonAccess,
  PeopleAccessUpdateError,
} from "../src/services/people-access-update.js";

async function expectAccessError(
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
        PeopleAccessUpdateError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-access-update tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    managerRole,
    chatterRole,
    trialRole,
    qcRole,
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

      prisma.role.findUnique({
        where: {
          systemKey:
            "TRIAL_CHATTER",
        },
      }),

      prisma.role.findUnique({
        where: {
          systemKey:
            "QC",
        },
      }),
    ]);

  assert.ok(ownerRole);
  assert.ok(managerRole);
  assert.ok(chatterRole);
  assert.ok(trialRole);
  assert.ok(qcRole);

  const modelA =
    await prisma.agencyModel.create({
      data: {
        name:
          `Access Update Model A ${suffix}`,
      },
    });

  const modelB =
    await prisma.agencyModel.create({
      data: {
        name:
          `Access Update Model B ${suffix}`,
      },
    });

  const manager =
    await prisma.user.create({
      data: {
        name:
          "Access Update Manager",

        email:
          `access-manager-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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
          "Access Update Chatter",

        email:
          `access-chatter-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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

  const otherManager =
    await prisma.user.create({
      data: {
        name:
          "Other Manager",

        email:
          `access-other-manager-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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

  const inaccessibleChatter =
    await prisma.user.create({
      data: {
        name:
          "Inaccessible Chatter",

        email:
          `access-inaccessible-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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
          "Access Update QC",

        email:
          `access-qc-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Access Update Owner",

        email:
          `access-owner-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

        roleMemberships: {
          create: {
            roleId:
              ownerRole.id,
          },
        },
      },
    });

  const createdUserIds = [
    manager.id,
    chatter.id,
    otherManager.id,
    inaccessibleChatter.id,
    qc.id,
    owner.id,
  ];

  try {
    const managerAccess =
      await getAccessContext(
        manager.id
      );

    const qcAccess =
      await getAccessContext(
        qc.id
      );

    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              manager.id,

            roleIds: [
              managerRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          managerAccess
        ),

      "CANNOT_UPDATE_SELF_ACCESS"
    );

    console.log(
      "✓ user cannot change their own roles or model access"
    );

    const originalAssignment =
      await prisma
        .userModelAssignment
        .findUniqueOrThrow({
          where: {
            userId_modelId: {
              userId:
                chatter.id,

              modelId:
                modelA.id,
            },
          },
        });

    const updated =
      await updatePersonAccess(
        {
          userId:
            chatter.id,

          roleIds: [
            trialRole.id,
          ],

          modelIds: [
            modelA.id,
          ],
        },

        managerAccess
      );

    assert.equal(
      updated.roles.length,
      1
    );

    assert.equal(
      updated.roles[0]
        ?.systemKey,
      "TRIAL_CHATTER"
    );

    console.log(
      "✓ Manager can change Chatter to lower-ranked Trial Chatter"
    );

    const preservedAssignment =
      await prisma
        .userModelAssignment
        .findUniqueOrThrow({
          where: {
            userId_modelId: {
              userId:
                chatter.id,

              modelId:
                modelA.id,
            },
          },
        });

    assert.equal(
      preservedAssignment.id,
      originalAssignment.id
    );

    console.log(
      "✓ unchanged model assignment preserves its original record"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              otherManager.id,

            roleIds: [
              chatterRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          managerAccess
        ),

      "CURRENT_ROLE_NOT_MANAGEABLE"
    );

    console.log(
      "✓ Manager cannot strip another Manager's role"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              inaccessibleChatter.id,

            roleIds: [
              chatterRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          managerAccess
        ),

      "CURRENT_MODEL_NOT_MANAGEABLE"
    );

    console.log(
      "✓ Manager cannot remove an inaccessible model from another user"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              chatter.id,

            roleIds: [
              managerRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          managerAccess
        ),

      "ROLE_NOT_ASSIGNABLE"
    );

    console.log(
      "✓ Manager cannot promote a user to Manager"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              chatter.id,

            roleIds: [
              trialRole.id,
            ],

            modelIds: [
              modelB.id,
            ],
          },

          managerAccess
        ),

      "MODEL_NOT_ASSIGNABLE"
    );

    console.log(
      "✓ Manager cannot assign an inaccessible model"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              chatter.id,

            roleIds: [
              trialRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          qcAccess
        ),

      "PEOPLE_MANAGE_REQUIRED"
    );

    console.log(
      "✓ QC cannot edit staff access"
    );

    const ownerUpdated =
      await updatePersonAccess(
        {
          userId:
            otherManager.id,

          roleIds: [
            chatterRole.id,
          ],

          modelIds: [
            modelB.id,
          ],
        },

        ownerAccess
      );

    assert.equal(
      ownerUpdated.roles[0]
        ?.systemKey,
      "CHATTER"
    );

    assert.equal(
      ownerUpdated.models[0]
        ?.id,
      modelB.id
    );

    console.log(
      "✓ Owner can update roles and models across the agency"
    );

    await prisma.agencyModel.update({
      where: {
        id:
          modelB.id,
      },

      data: {
        isActive:
          false,
      },
    });

    const preservedInactive =
      await updatePersonAccess(
        {
          userId:
            otherManager.id,

          roleIds: [
            chatterRole.id,
          ],

          modelIds: [
            modelB.id,
          ],
        },

        ownerAccess
      );

    assert.equal(
      preservedInactive.models[0]
        ?.id,
      modelB.id
    );

    console.log(
      "✓ existing inactive model assignment can be preserved"
    );

    await expectAccessError(
      () =>
        updatePersonAccess(
          {
            userId:
              chatter.id,

            roleIds: [
              trialRole.id,
            ],

            modelIds: [
              modelB.id,
            ],
          },

          ownerAccess
        ),

      "INVALID_MODEL"
    );

    console.log(
      "✓ inactive model cannot be newly assigned"
    );

    console.log("");

    console.log(
      "All people-access-update tests passed."
    );
  } finally {
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
      "People-access-update test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });