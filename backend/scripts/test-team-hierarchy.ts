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

import type {
  AccessContext,
} from "../src/services/access-control.js";

import {
  assignPersonToTeamGroup,
  createTeamGroup,
  deleteTeamGroup,
  listTeamGroups,
  renameTeamGroup,
  ROOT_TEAM_GROUP_ID,
  TeamHierarchyError,
} from "../src/services/team-hierarchy.js";

async function expectHierarchyError(
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
        TeamHierarchyError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

function createAccess(
  input: {
    userId:
      string;

    owner?:
      boolean;

    groupId?:
      string | null;

    scope?:
      RoleDataScope;
  }
): AccessContext {
  const owner =
    input.owner ??
    false;

  return {
    userId:
      input.userId,

    roles: [
      {
        id:
          owner
            ? "owner-role"
            : "manager-role",

        systemKey:
          owner
            ? "OWNER"
            : "MANAGER",

        name:
          owner
            ? "Owner"
            : "Manager",

        rank:
          owner
            ? 1
            : 3,

        dataScope:
          input.scope ??
          (
            owner
              ? RoleDataScope.ALL
              : RoleDataScope.SELF_AND_TEAM
          ),
      },
    ],

    highestRank:
      owner
        ? 1
        : 3,

    teamGroupId:
      input.groupId ??
      ROOT_TEAM_GROUP_ID,

    effectiveDataScope:
      input.scope ??
      (
        owner
          ? RoleDataScope.ALL
          : RoleDataScope.SELF_AND_TEAM
      ),

    permissions:
      new Set([
        "people.manage",
      ]),

    assignedModelIds:
      [],

    canSeeAllModels:
      owner,
  };
}

async function runTests() {
  console.log(
    "Starting team-hierarchy tests..."
  );

  const suffix =
    Date.now();

  const root =
    await prisma.teamGroup.findUnique({
      where: {
        id:
          ROOT_TEAM_GROUP_ID,
      },
    });

  assert.ok(
    root
  );

  assert.equal(
    root.isRoot,
    true
  );

  console.log(
    "✓ permanent XYZ Management root group exists"
  );

  const ownerAccess =
    createAccess({
      userId:
        `hierarchy-owner-${suffix}`,

      owner:
        true,

      groupId:
        ROOT_TEAM_GROUP_ID,
    });

  let groupAId:
    string | null =
      null;

  let groupA1Id:
    string | null =
      null;

  let groupBId:
    string | null =
      null;

  let memberId:
    string | null =
      null;

  try {
    const groupA =
      await createTeamGroup(
        {
          name:
            `Operations ${suffix}`,

          parentGroupId:
            ROOT_TEAM_GROUP_ID,
        },
        ownerAccess
      );

    groupAId =
      groupA.id;

    const groupA1 =
      await createTeamGroup(
        {
          name:
            `Team Alpha ${suffix}`,

          parentGroupId:
            groupA.id,
        },
        ownerAccess
      );

    groupA1Id =
      groupA1.id;

    const groupB =
      await createTeamGroup(
        {
          name:
            `Quality ${suffix}`,

          parentGroupId:
            ROOT_TEAM_GROUP_ID,
        },
        ownerAccess
      );

    groupBId =
      groupB.id;

    console.log(
      "✓ Owner can create parent and child groups"
    );

    await expectHierarchyError(
      () =>
        createTeamGroup(
          {
            name:
              `operations ${suffix}`,

            parentGroupId:
              ROOT_TEAM_GROUP_ID,
          },
          ownerAccess
        ),

      "GROUP_NAME_IN_USE"
    );

    console.log(
      "✓ sibling group names are unique case-insensitively"
    );

    const managerAccess =
      createAccess({
        userId:
          `hierarchy-manager-${suffix}`,

        groupId:
          groupA.id,

        scope:
          RoleDataScope.SELF_AND_TEAM,
      });

    const managerHierarchy =
      await listTeamGroups(
        managerAccess
      );

    const managerVisibleIds =
      new Set(
        managerHierarchy.groups.map(
          (
            group
          ) =>
            group.id
        )
      );

    assert.equal(
      managerVisibleIds.has(
        groupA.id
      ),
      true
    );

    assert.equal(
      managerVisibleIds.has(
        groupA1.id
      ),
      true
    );

    assert.equal(
      managerVisibleIds.has(
        groupB.id
      ),
      false
    );

    assert.equal(
      managerVisibleIds.has(
        ROOT_TEAM_GROUP_ID
      ),
      false
    );

    console.log(
      "✓ Self + subordinates scope sees only the current group subtree"
    );

    const selfOnlyAccess =
      createAccess({
        userId:
          `hierarchy-self-${suffix}`,

        groupId:
          groupA.id,

        scope:
          RoleDataScope.SELF,
      });

    const selfHierarchy =
      await listTeamGroups(
        selfOnlyAccess
      );

    assert.deepEqual(
      selfHierarchy.groups.map(
        (
          group
        ) =>
          group.id
      ),
      [
        groupA.id,
      ]
    );

    console.log(
      "✓ Self-only scope does not expose descendant groups"
    );

    await expectHierarchyError(
      () =>
        createTeamGroup(
          {
            name:
              `Forbidden ${suffix}`,

            parentGroupId:
              groupA.id,
          },
          managerAccess
        ),

      "OWNER_REQUIRED"
    );

    console.log(
      "✓ non-Owner cannot mutate the organization hierarchy"
    );

    const chatterRole =
      await prisma.role.findUnique({
        where: {
          systemKey:
            "CHATTER",
        },
      });

    assert.ok(
      chatterRole
    );

    const member =
      await prisma.user.create({
        data: {
          name:
            "Hierarchy Test Member",

          email:
            `hierarchy-member-${suffix}@example.test`,

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
        },
      });

    memberId =
      member.id;

    const moved =
      await assignPersonToTeamGroup(
        {
          userId:
            member.id,

          groupId:
            groupA1.id,
        },
        ownerAccess
      );

    assert.equal(
      moved.teamGroup
        ?.id,
      groupA1.id
    );

    console.log(
      "✓ Owner can move a team member into a subgroup"
    );

    await expectHierarchyError(
      () =>
        deleteTeamGroup(
          groupA.id,
          ownerAccess
        ),

      "GROUP_HAS_CHILDREN"
    );

    await expectHierarchyError(
      () =>
        deleteTeamGroup(
          groupA1.id,
          ownerAccess
        ),

      "GROUP_HAS_MEMBERS"
    );

    console.log(
      "✓ groups with children or members cannot be deleted accidentally"
    );

    await expectHierarchyError(
      () =>
        renameTeamGroup(
          ROOT_TEAM_GROUP_ID,
          "Renamed Root",
          ownerAccess
        ),

      "ROOT_GROUP_IMMUTABLE"
    );

    await expectHierarchyError(
      () =>
        deleteTeamGroup(
          ROOT_TEAM_GROUP_ID,
          ownerAccess
        ),

      "ROOT_GROUP_IMMUTABLE"
    );

    console.log(
      "✓ agency root cannot be renamed or deleted"
    );

    await assignPersonToTeamGroup(
      {
        userId:
          member.id,

        groupId:
          ROOT_TEAM_GROUP_ID,
      },
      ownerAccess
    );

    await deleteTeamGroup(
      groupA1.id,
      ownerAccess
    );

    groupA1Id =
      null;

    const renamed =
      await renameTeamGroup(
        groupA.id,
        `Operations Renamed ${suffix}`,
        ownerAccess
      );

    assert.equal(
      renamed.name,
      `Operations Renamed ${suffix}`
    );

    console.log(
      "✓ empty subgroup can be removed and remaining group can be renamed"
    );

    console.log("");
    console.log(
      "All team-hierarchy tests passed."
    );
  } finally {
    if (
      memberId
    ) {
      await prisma.user.deleteMany({
        where: {
          id:
            memberId,
        },
      });
    }

    const ids = [
      groupA1Id,
      groupAId,
      groupBId,
    ].filter(
      (
        id
      ): id is string =>
        Boolean(
          id
        )
    );

    for (
      const id
      of ids
    ) {
      await prisma.teamGroup.deleteMany({
        where: {
          id,
        },
      });
    }
  }
}

runTests()
  .catch(
    (
      error
    ) => {
      console.error(
        "Team-hierarchy test failed:",
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
