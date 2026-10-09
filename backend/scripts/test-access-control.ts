/// <reference types="node" />

import assert from "node:assert/strict";

import {
  RoleDataScope,
} from "@prisma/client";

import {
  type AccessContext,
  canAccessModel,
  canAssignRole,
  canAssignInviteModel,
  canInvitePeople,
  canInviteRole,
  getEffectiveDataScope,
  getHighestRank,
  hasPermission,
  isOwner,
} from "../src/services/access-control.js";

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

function runTests() {
  console.log(
    "Starting access-control tests..."
  );

  /*
   * ==========================================
   * HIGHEST RANK
   * ==========================================
   */

  assert.equal(
    getHighestRank([
      { rank: 5 },
      { rank: 3 },
      { rank: null },
    ]),
    3
  );

  assert.equal(
    getHighestRank([
      { rank: null },
      { rank: null },
    ]),
    null
  );

  console.log(
    "✓ highest rank calculation"
  );

  /*
   * ==========================================
   * DATA SCOPE STACKING
   * ==========================================
   */

  assert.equal(
    getEffectiveDataScope([
      {
        dataScope:
          RoleDataScope.SELF,
      },
      {
        dataScope:
          RoleDataScope.SELF_AND_TEAM,
      },
    ]),
    RoleDataScope.SELF_AND_TEAM
  );

  assert.equal(
    getEffectiveDataScope([
      {
        dataScope:
          RoleDataScope.SELF,
      },
      {
        dataScope:
          RoleDataScope.ALL,
      },
    ]),
    RoleDataScope.ALL
  );

  console.log(
    "✓ data scope stacking"
  );

  /*
   * ==========================================
   * PERMISSIONS
   * ==========================================
   */

  const managerAccess =
    createAccessContext({
      highestRank: 3,

      permissions:
        new Set([
          "people.access",
          "people.create",
          "people.assign_roles",
        ]),
    });

  assert.equal(
    hasPermission(
      managerAccess,
      "people.create"
    ),
    true
  );

  assert.equal(
    hasPermission(
      managerAccess,
      "roles.manage"
    ),
    false
  );

  console.log(
    "✓ permission checks"
  );

  /*
   * ==========================================
   * MANAGER ROLE ASSIGNMENT
   * ==========================================
   */

  assert.equal(
    canAssignRole(
      managerAccess,
      {
        systemKey: "CHATTER",
        rank: 5,
      }
    ),
    true
  );

  assert.equal(
    canAssignRole(
      managerAccess,
      {
        systemKey: "QC",
        rank: 4,
      }
    ),
    true
  );

  assert.equal(
    canAssignRole(
      managerAccess,
      {
        systemKey:
          "OPS_MANAGER",
        rank: 2,
      }
    ),
    false
  );

  console.log(
    "✓ ranked role assignment"
  );

  /*
   * ==========================================
   * QC CANNOT ADD PEOPLE
   * ==========================================
   */

  const qcAccess =
    createAccessContext({
      highestRank: 4,

      permissions:
        new Set(),
    });

  assert.equal(
    canAssignRole(
      qcAccess,
      {
        systemKey: "CHATTER",
        rank: 5,
      }
    ),
    false
  );

  console.log(
    "✓ QC cannot assign people"
  );

  /*
   * ==========================================
   * OWNER-ONLY ROLES
   * ==========================================
   */

  assert.equal(
    canAssignRole(
      managerAccess,
      {
        systemKey: "MODEL",
        rank: null,
      }
    ),
    false
  );

  const ownerAccess =
    createAccessContext({
      highestRank: 1,

      permissions:
        new Set([
          "people.access",
          "people.create",
          "people.assign_roles",
          "roles.access",
          "roles.manage",
          "two_factor.reset",
        ]),

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

      effectiveDataScope:
        RoleDataScope.ALL,

      canSeeAllModels: true,
    });

  assert.equal(
    isOwner(ownerAccess),
    true
  );

  assert.equal(
    canAssignInviteModel(ownerAccess, "model-without-owner-assignment"),
    true
  );

  console.log("✓ Owner may invite onto any creator without personal assignments");



  assert.equal(
    canAssignRole(
      ownerAccess,
      {
        systemKey: "MODEL",
        rank: null,
      }
    ),
    true
  );

  assert.equal(
    canAssignRole(
      ownerAccess,
      {
        systemKey: "DEV",
        rank: null,
      }
    ),
    true
  );

  console.log(
    "✓ Owner-only role restrictions"
  );

  /*
   * ==========================================
   * MODEL ACCESS
   * ==========================================
   */

  /*
   * ==========================================
   * INVITATION HIERARCHY AND MODEL SCOPE
   * ==========================================
   */

  const managerInviteAccess =
    createAccessContext({
      highestRank: 3,

      permissions:
        new Set([
          "people.access",
          "people.create",
        ]),

      assignedModelIds: [
        "model-a",
        "model-b",
      ],
    });

  assert.equal(
    canInvitePeople(
      managerInviteAccess
    ),
    true
  );

  assert.equal(
    canInviteRole(
      managerInviteAccess,
      {
        systemKey: "QC",
        rank: 4,
      }
    ),
    true
  );

  assert.equal(
    canInviteRole(
      managerInviteAccess,
      {
        systemKey: "CHATTER",
        rank: 5,
      }
    ),
    true
  );

  assert.equal(
    canInviteRole(
      managerInviteAccess,
      {
        systemKey: "MANAGER",
        rank: 3,
      }
    ),
    false
  );

  assert.equal(
    canInviteRole(
      managerInviteAccess,
      {
        systemKey: "OPS_MANAGER",
        rank: 2,
      }
    ),
    false
  );

  assert.equal(
    canInviteRole(
      managerInviteAccess,
      {
        systemKey: "OWNER",
        rank: 1,
      }
    ),
    false
  );

  assert.equal(
    canAssignInviteModel(
      managerInviteAccess,
      "model-a"
    ),
    true
  );

  assert.equal(
    canAssignInviteModel(
      managerInviteAccess,
      "model-c"
    ),
    false
  );

  /*
   * QC and Chatter must still be blocked even if
   * people.create is accidentally granted.
   */
  const qcInviteAccess =
    createAccessContext({
      highestRank: 4,

      permissions:
        new Set([
          "people.access",
          "people.create",
        ]),

      assignedModelIds: [
        "model-a",
      ],
    });

  assert.equal(
    canInvitePeople(
      qcInviteAccess
    ),
    false
  );

  assert.equal(
    canInviteRole(
      qcInviteAccess,
      {
        systemKey: "CHATTER",
        rank: 5,
      }
    ),
    false
  );

  assert.equal(
    canAssignInviteModel(
      qcInviteAccess,
      "model-a"
    ),
    false
  );

  const chatterInviteAccess =
    createAccessContext({
      highestRank: 5,

      permissions:
        new Set([
          "people.access",
          "people.create",
        ]),

      assignedModelIds: [
        "model-a",
      ],
    });

  assert.equal(
    canInvitePeople(
      chatterInviteAccess
    ),
    false
  );

  assert.equal(
    canInviteRole(
      chatterInviteAccess,
      {
        systemKey: "CHATTER",
        rank: 5,
      }
    ),
    false
  );

  assert.equal(
    canAssignInviteModel(
      chatterInviteAccess,
      "model-a"
    ),
    false
  );

  console.log(
    "✓ invitation hierarchy and assigned-model scope"
  );

  const chatterAccess =
    createAccessContext({
      highestRank: 5,

      assignedModelIds: [
        "model-a",
      ],
    });

  assert.equal(
    canAccessModel(
      chatterAccess,
      "model-a"
    ),
    true
  );

  assert.equal(
    canAccessModel(
      chatterAccess,
      "model-b"
    ),
    false
  );

  const devAccess =
    createAccessContext({
      canSeeAllModels: true,
    });

  assert.equal(
    canAccessModel(
      devAccess,
      "any-model"
    ),
    true
  );

  console.log(
    "✓ model visibility"
  );

  /*
   * ==========================================
   * DONE
   * ==========================================
   */

  console.log("");
  console.log(
    "All access-control tests passed."
  );
}

runTests();