/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  RoleDataScope,
  UserStatus,
} from "@prisma/client";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  type AccessContext,
} from "../src/services/access-control.js";

import {
  ROOT_TEAM_GROUP_ID,
} from "../src/services/team-hierarchy.js";

import {
  invitePerson,
  PeopleInviteError,
} from "../src/services/people-invite.js";

async function expectInviteError(
  action: () => Promise<unknown>,
  expectedCode: string
) {
  try {
    await action();

    assert.fail(
      `Expected ${expectedCode} error.`
    );
  } catch (error) {
    assert.ok(
      error instanceof
        PeopleInviteError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-invite tests..."
  );

  const suffix =
    Date.now();

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

  const ownerRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "OWNER",
      },
    });

  const opsRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "OPS_MANAGER",
      },
    });

  assert.ok(managerRole);
  assert.ok(chatterRole);
  assert.ok(qcRole);
  assert.ok(ownerRole);
  assert.ok(opsRole);

  const modelA =
    await prisma.agencyModel.create({
      data: {
        name:
          `Invite Test Model A ${suffix}`,
      },
    });

  const modelB =
    await prisma.agencyModel.create({
      data: {
        name:
          `Invite Test Model B ${suffix}`,
      },
    });

  const manager =
    await prisma.user.create({
      data: {
        name:
          "People Invite Manager Test",

        email:
          `people-manager-${suffix}@example.test`,

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

  const qc =
    await prisma.user.create({
      data: {
        name:
          "People Invite QC Test",

        email:
          `people-qc-${suffix}@example.test`,

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
          "People Invite Owner Test",

        email:
          `people-owner-${suffix}@example.test`,

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

  const createdUserIds: string[] =
    [];

  try {
    /*
     * Use explicit authorization contexts so this service test
     * does not depend on RolePermission rows in the developer DB.
     * invitePerson() still performs its real DB operations.
     */
    const managerAccess:
      AccessContext = {
        userId:
          manager.id,

        roles: [
          {
            id:
              managerRole.id,

            systemKey:
              "MANAGER",

            name:
              managerRole.name,

            rank:
              3,

            dataScope:
              RoleDataScope.SELF_AND_TEAM,
          },
        ],

        highestRank:
          3,

        teamGroupId:
          ROOT_TEAM_GROUP_ID,

        effectiveDataScope:
          RoleDataScope.SELF_AND_TEAM,

        permissions:
          new Set([
            "people.access",
            "people.profile.view",
            "people.create",
            "people.assign_roles",
          ]),

        assignedModelIds: [
          modelA.id,
        ],

        canSeeAllModels:
          false,
      };

    /*
     * QC deliberately receives people.create.
     * The hard rank rule must still block invitations.
     */
    const qcAccess:
      AccessContext = {
        userId:
          qc.id,

        roles: [
          {
            id:
              qcRole.id,

            systemKey:
              "QC",

            name:
              qcRole.name,

            rank:
              4,

            dataScope:
              RoleDataScope.SELF_AND_TEAM,
          },
        ],

        highestRank:
          4,

        teamGroupId:
          ROOT_TEAM_GROUP_ID,

        effectiveDataScope:
          RoleDataScope.SELF_AND_TEAM,

        permissions:
          new Set([
            "people.access",
            "people.profile.view",
            "people.create",
          ]),

        assignedModelIds: [
          modelA.id,
        ],

        canSeeAllModels:
          false,
      };

    const ownerAccess:
      AccessContext = {
        userId:
          owner.id,

        roles: [
          {
            id:
              ownerRole.id,

            systemKey:
              "OWNER",

            name:
              ownerRole.name,

            rank:
              1,

            dataScope:
              RoleDataScope.ALL,
          },
        ],

        highestRank:
          1,

        teamGroupId:
          ROOT_TEAM_GROUP_ID,

        effectiveDataScope:
          RoleDataScope.ALL,

        permissions:
          new Set([
            "people.access",
            "people.profile.view",
            "people.create",
            "people.assign_roles",
          ]),

        /*
         * Invitation model assignment is intentionally based
         * on explicit assignments, even for users who can see
         * every model.
         */
        assignedModelIds: [
          modelA.id,
        ],

        canSeeAllModels:
          true,
      };

    /*
     * ========================================
     * MANAGER → CHATTER
     * ========================================
     */

    const chatterInvite =
      await invitePerson(
        {
          name:
            "Invited Chatter",

          email:
            `invited-chatter-${suffix}@example.test`,

          roleIds: [
            chatterRole.id,
          ],

          modelIds: [
            modelA.id,
          ],
        },

        managerAccess
      );

    createdUserIds.push(
      chatterInvite.user.id
    );

    assert.equal(
      chatterInvite.user.status,
      UserStatus.PENDING_SETUP
    );

    console.log(
      "✓ Manager can invite lower-ranked Chatter"
    );

    const createdChatter =
      await prisma.user.findUnique({
        where: {
          id:
            chatterInvite.user.id,
        },

        include: {
          roleMemberships: true,
          modelAssignments: true,
          invites: true,
        },
      });

    assert.ok(
      createdChatter
    );

    assert.equal(
      createdChatter.passwordHash,
      null
    );

    assert.equal(
      createdChatter.roleMemberships.length,
      1
    );

    assert.equal(
      createdChatter.roleMemberships[0]
        ?.roleId,
      chatterRole.id
    );

    assert.equal(
      createdChatter.modelAssignments.length,
      1
    );

    assert.equal(
      createdChatter.modelAssignments[0]
        ?.modelId,
      modelA.id
    );

    assert.equal(
      createdChatter.invites.length,
      1
    );

    assert.notEqual(
      createdChatter.invites[0]
        ?.tokenHash,
      chatterInvite.token
    );

    console.log(
      "✓ user, role, model and hashed invite are created together"
    );

    /*
     * ========================================
     * MANAGER CANNOT ASSIGN SAME-RANK MANAGER
     * ========================================
     */

    await expectInviteError(
      () =>
        invitePerson(
          {
            name:
              "Invalid Manager",

            email:
              `invalid-manager-${suffix}@example.test`,

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
      "✓ Manager cannot assign Manager role"
    );

    /*
     * ========================================
     * MANAGER CANNOT ASSIGN UNAUTHORIZED MODEL
     * ========================================
     */

    await expectInviteError(
      () =>
        invitePerson(
          {
            name:
              "Wrong Model Chatter",

            email:
              `wrong-model-${suffix}@example.test`,

            roleIds: [
              chatterRole.id,
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
      "✓ Manager cannot assign an unassigned model"
    );

    /*
     * ========================================
     * QC CANNOT INVITE PEOPLE
     * ========================================
     */

    await expectInviteError(
      () =>
        invitePerson(
          {
            name:
              "QC Invite Attempt",

            email:
              `qc-attempt-${suffix}@example.test`,

            roleIds: [
              chatterRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          qcAccess
        ),

      "ROLE_NOT_ASSIGNABLE"
    );

    console.log(
      "✓ QC cannot invite people even with people.create"
    );

    /*
     * ========================================
     * OWNER CAN ASSIGN OPS MANAGER
     * ========================================
     */

    const opsInvite =
      await invitePerson(
        {
          name:
            "Invited Ops Manager",

          email:
            `invited-ops-${suffix}@example.test`,

          roleIds: [
            opsRole.id,
          ],

          modelIds: [],
        },

        ownerAccess
      );

    createdUserIds.push(
      opsInvite.user.id
    );

    assert.equal(
      opsInvite.user.status,
      UserStatus.PENDING_SETUP
    );

    console.log(
      "✓ Owner can assign Owner-only Ops Manager role"
    );

    /*
     * ========================================
     * DUPLICATE EMAIL
     * ========================================
     */

    await expectInviteError(
      () =>
        invitePerson(
          {
            name:
              "Duplicate Email",

            email:
              chatterInvite.user.email.toUpperCase(),

            roleIds: [
              chatterRole.id,
            ],

            modelIds: [
              modelA.id,
            ],
          },

          managerAccess
        ),

      "EMAIL_IN_USE"
    );

    console.log(
      "✓ duplicate email is rejected case-insensitively"
    );

    console.log("");

    console.log(
      "All people-invite tests passed."
    );
  } finally {
    if (
      createdUserIds.length > 0
    ) {
      await prisma.user.deleteMany({
        where: {
          id: {
            in:
              createdUserIds,
          },
        },
      });
    }

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            manager.id,
            qc.id,
            owner.id,
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

runTests()
  .catch((error) => {
    console.error(
      "People-invite test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });