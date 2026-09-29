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
  getAccessContext,
} from "../src/services/access-control.js";

import {
  deactivatePerson,
  PeopleStatusError,
} from "../src/services/people-status.js";

import {
  getPeopleManagementOptions,
} from "../src/services/people-options.js";

import {
  getPersonDetail,
  listPeople,
  PeopleReadError,
} from "../src/services/people-read.js";

import {
  invitePerson,
  PeopleInviteError,
} from "../src/services/people-invite.js";

import {
  resendPersonInvite,
  ResendInviteError,
} from "../src/services/people-resend-invite.js";

import {
  updatePersonAccess,
  PeopleAccessUpdateError,
} from "../src/services/people-access-update.js";

import {
  ROOT_TEAM_GROUP_ID,
} from "../src/services/team-hierarchy.js";

async function expectCode(
  action: () => Promise<unknown>,
  errorType:
    | typeof PeopleReadError
    | typeof PeopleInviteError
    | typeof PeopleAccessUpdateError
    | typeof PeopleStatusError
    | typeof ResendInviteError,
  expectedCode: string
) {
  try {
    await action();
    assert.fail(
      `Expected ${expectedCode}`
    );
  } catch (error) {
    assert.ok(
      error instanceof errorType
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function main() {
  console.log(
    "Starting People hierarchy authorization tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    managerRole,
    chatterRole,
  ] =
    await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey:
            "OWNER",
        },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey:
            "MANAGER",
        },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey:
            "CHATTER",
        },
      }),
    ]);

  const [
    modelA,
    modelB,
  ] =
    await Promise.all([
      prisma.agencyModel.create({
        data: {
          name:
            `Hierarchy Auth A ${suffix}`,
        },
      }),
      prisma.agencyModel.create({
        data: {
          name:
            `Hierarchy Auth B ${suffix}`,
        },
      }),
    ]);

  const operations =
    await prisma.teamGroup.create({
      data: {
        name:
          `Operations Auth ${suffix}`,
        parentId:
          ROOT_TEAM_GROUP_ID,
      },
    });

  const quality =
    await prisma.teamGroup.create({
      data: {
        name:
          `Quality Auth ${suffix}`,
        parentId:
          ROOT_TEAM_GROUP_ID,
      },
    });

  const [
    alpha,
    beta,
  ] =
    await Promise.all([
      prisma.teamGroup.create({
        data: {
          name:
            `Alpha Auth ${suffix}`,
          parentId:
            operations.id,
        },
      }),
      prisma.teamGroup.create({
        data: {
          name:
            `Beta Auth ${suffix}`,
          parentId:
            operations.id,
        },
      }),
    ]);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Auth Owner",
        email:
          `hierarchy-owner-${suffix}@example.test`,
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

  const manager =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Auth Manager",
        email:
          `hierarchy-manager-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        teamGroupId:
          operations.id,
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

  const visibleChatter =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Visible Chatter",
        email:
          `hierarchy-visible-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        teamGroupId:
          alpha.id,
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

  const outsideGroupChatter =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Outside Chatter",
        email:
          `hierarchy-outside-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        teamGroupId:
          quality.id,
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

  const wrongCreatorChatter =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Wrong Creator",
        email:
          `hierarchy-wrong-model-${suffix}@example.test`,
        status:
          UserStatus.ACTIVE,
        teamGroupId:
          alpha.id,
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

  const outsidePending =
    await prisma.user.create({
      data: {
        name:
          "Hierarchy Outside Pending",
        email:
          `hierarchy-pending-${suffix}@example.test`,
        status:
          UserStatus.PENDING_SETUP,
        teamGroupId:
          quality.id,
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

  const createdUserIds = [
    owner.id,
    manager.id,
    visibleChatter.id,
    outsideGroupChatter.id,
    wrongCreatorChatter.id,
    outsidePending.id,
  ];

  try {
    const [
      ownerAccess,
      managerAccess,
    ] =
      await Promise.all([
        getAccessContext(
          owner.id
        ),
        getAccessContext(
          manager.id
        ),
      ]);

    assert.equal(
      managerAccess.effectiveDataScope,
      RoleDataScope.SELF_AND_TEAM
    );

    const managerPeople =
      await listPeople(
        managerAccess
      );

    const managerVisibleIds =
      new Set(
        managerPeople.map(
          (
            person
          ) =>
            person.id
        )
      );

    assert.equal(
      managerVisibleIds.has(
        visibleChatter.id
      ),
      true
    );

    assert.equal(
      managerVisibleIds.has(
        outsideGroupChatter.id
      ),
      false
    );

    assert.equal(
      managerVisibleIds.has(
        wrongCreatorChatter.id
      ),
      false
    );

    console.log(
      "✓ People visibility requires both hierarchy scope and existing role/creator authorization"
    );

    await expectCode(
      () =>
        getPersonDetail(
          outsideGroupChatter.id,
          managerAccess
        ),
      PeopleReadError,
      "PERSON_NOT_VISIBLE"
    );

    const ownerPeople =
      await listPeople(
        ownerAccess
      );

    assert.equal(
      ownerPeople.some(
        (
          person
        ) =>
          person.id ===
          owner.id
      ),
      false
    );

    assert.equal(
      ownerPeople.some(
        (
          person
        ) =>
          person.id ===
          outsideGroupChatter.id
      ),
      true
    );

    await expectCode(
      () =>
        getPersonDetail(
          owner.id,
          ownerAccess
        ),
      PeopleReadError,
      "PERSON_NOT_VISIBLE"
    );

    console.log(
      "✓ Owner is hidden from People Management at the backend service layer"
    );

    const options =
      await getPeopleManagementOptions(
        managerAccess
      );

    const optionGroupIds =
      new Set(
        options.organization.groups.map(
          (
            group
          ) =>
            group.id
        )
      );

    assert.equal(
      optionGroupIds.has(
        operations.id
      ),
      true
    );
    assert.equal(
      optionGroupIds.has(
        alpha.id
      ),
      true
    );
    assert.equal(
      optionGroupIds.has(
        beta.id
      ),
      true
    );
    assert.equal(
      optionGroupIds.has(
        quality.id
      ),
      false
    );

    assert.equal(
      options.roles.some(
        (
          role
        ) =>
          role.systemKey ===
          "OWNER"
      ),
      false
    );

    console.log(
      "✓ People options expose only scoped groups and never offer the Owner role"
    );

    const invited =
      await invitePerson(
        {
          name:
            "Hierarchy Invited Chatter",
          email:
            `hierarchy-invited-${suffix}@example.test`,
          roleIds: [
            chatterRole.id,
          ],
          modelIds: [
            modelA.id,
          ],
          teamGroupId:
            alpha.id,
        },
        managerAccess
      );

    createdUserIds.push(
      invited.user.id
    );

    const invitedRecord =
      await prisma.user.findUniqueOrThrow({
        where: {
          id:
            invited.user.id,
        },
        select: {
          teamGroupId:
            true,
        },
      });

    assert.equal(
      invitedRecord.teamGroupId,
      alpha.id
    );

    await expectCode(
      () =>
        invitePerson(
          {
            name:
              "Hierarchy Invalid Group Invite",
            email:
              `hierarchy-invalid-invite-${suffix}@example.test`,
            roleIds: [
              chatterRole.id,
            ],
            modelIds: [
              modelA.id,
            ],
            teamGroupId:
              quality.id,
          },
          managerAccess
        ),
      PeopleInviteError,
      "TEAM_GROUP_NOT_ASSIGNABLE"
    );

    await expectCode(
      () =>
        invitePerson(
          {
            name:
              "Invalid Owner Invite",
            email:
              `hierarchy-owner-invite-${suffix}@example.test`,
            roleIds: [
              ownerRole.id,
            ],
            modelIds: [],
            teamGroupId:
              ROOT_TEAM_GROUP_ID,
          },
          ownerAccess
        ),
      PeopleInviteError,
      "ROLE_NOT_ASSIGNABLE"
    );

    await expectCode(
      () =>
        updatePersonAccess(
          {
            userId:
              visibleChatter.id,
            roleIds: [
              ownerRole.id,
            ],
            modelIds: [
              modelA.id,
            ],
          },
          ownerAccess
        ),
      PeopleAccessUpdateError,
      "ROLE_NOT_ASSIGNABLE"
    );

    console.log(
      "✓ ordinary People APIs cannot create or promote an employee to Owner"
    );

    console.log(
      "✓ invite group selection is limited to the manager's visible organization subtree"
    );

    await expectCode(
      () =>
        updatePersonAccess(
          {
            userId:
              outsideGroupChatter.id,
            roleIds: [
              chatterRole.id,
            ],
            modelIds: [
              modelA.id,
            ],
          },
          managerAccess
        ),
      PeopleAccessUpdateError,
      "CURRENT_TEAM_GROUP_NOT_MANAGEABLE"
    );

    await expectCode(
      () =>
        deactivatePerson(
          outsideGroupChatter.id,
          managerAccess
        ),
      PeopleStatusError,
      "TEAM_GROUP_NOT_MANAGEABLE"
    );

    await expectCode(
      () =>
        resendPersonInvite(
          outsidePending.id,
          managerAccess
        ),
      ResendInviteError,
      "TEAM_GROUP_NOT_ASSIGNABLE"
    );

    console.log(
      "✓ direct-ID People mutations cannot bypass hierarchy scope"
    );

    const moved =
      await updatePersonAccess(
        {
          userId:
            visibleChatter.id,
          roleIds: [
            chatterRole.id,
          ],
          modelIds: [
            modelA.id,
          ],
          teamGroupId:
            beta.id,
        },
        managerAccess
      );

    assert.equal(
      moved.teamGroup?.id,
      beta.id
    );

    console.log(
      "✓ a manager can move manageable staff between groups inside the same visible subtree"
    );

    console.log("");
    console.log(
      "All People hierarchy authorization tests passed."
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

    await prisma.teamGroup.deleteMany({
      where: {
        id: {
          in: [
            alpha.id,
            beta.id,
          ],
        },
      },
    });

    await prisma.teamGroup.deleteMany({
      where: {
        id: {
          in: [
            operations.id,
            quality.id,
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
        "People hierarchy authorization test failed:",
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
