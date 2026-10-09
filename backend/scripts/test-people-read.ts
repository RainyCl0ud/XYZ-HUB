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
  ROOT_TEAM_GROUP_ID,
} from "../src/services/team-hierarchy.js";

import {
  getPersonDetail,
  listPeople,
  PeopleReadError,
} from "../src/services/people-read.js";

async function expectReadError(
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
        PeopleReadError
    );

    assert.equal(
      error.code,
      expectedCode
    );
  }
}

async function runTests() {
  console.log(
    "Starting people-read tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    opsRole,
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
  assert.ok(opsRole);
  assert.ok(managerRole);
  assert.ok(qcRole);
  assert.ok(chatterRole);

  const modelA =
    await prisma.agencyModel.create({
      data: {
        name:
          `People Read A ${suffix}`,
      },
    });

  const modelB =
    await prisma.agencyModel.create({
      data: {
        name:
          `People Read B ${suffix}`,
      },
    });

  const owner =
    await prisma.user.create({
      data: {
        name:
          "People Read Owner",

        email:
          `read-owner-${suffix}@example.test`,

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

  const ops =
    await prisma.user.create({
      data: {
        name:
          "People Read Ops",

        email:
          `read-ops-${suffix}@example.test`,

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

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
          "People Read Manager",

        email:
          `read-manager-${suffix}@example.test`,

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
          "People Read QC",

        email:
          `read-qc-${suffix}@example.test`,

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

  const visibleChatter =
    await prisma.user.create({
      data: {
        name:
          "Visible Chatter",

        email:
          `read-visible-${suffix}@example.test`,

        passwordHash:
          "DO_NOT_EXPOSE_PASSWORD_HASH",

        status:
          UserStatus.ACTIVE,
          teamGroupId:
            ROOT_TEAM_GROUP_ID,

        lastSignInAt:
          new Date(),

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
                "DO_NOT_EXPOSE_AUTHENTICATOR_SECRET",
            },
          ],
        },
      },
    });

  const hiddenChatter =
    await prisma.user.create({
      data: {
        name:
          "Hidden Chatter",

        email:
          `read-hidden-${suffix}@example.test`,

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

  const pendingChatter =
    await prisma.user.create({
      data: {
        name:
          "Pending Chatter",

        email:
          `read-pending-${suffix}@example.test`,

        status:
          UserStatus.PENDING_SETUP,
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

        invites: {
          create: {
            tokenHash:
              `read-invite-${suffix}`,

            createdByUserId:
              manager.id,

            expiresAt:
              new Date(
                Date.now() +
                  7 *
                    24 *
                    60 *
                    60 *
                    1000
              ),
          },
        },
      },
    });

  const createdUserIds = [
    owner.id,
    ops.id,
    manager.id,
    qc.id,
    visibleChatter.id,
    hiddenChatter.id,
    pendingChatter.id,
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

    const qcAccess =
      await getAccessContext(
        qc.id
      );

  const ownerPeople =
  await listPeople(
    ownerAccess
  );

const ownerVisibleIds =
  new Set(
    ownerPeople.map(
      (
        person
      ) =>
        person.id
    )
  );

for (
  const userId of
  createdUserIds.filter(
    (
      id
    ) =>
      id !==
      owner.id
  )
) {
  assert.equal(
    ownerVisibleIds.has(
      userId
    ),
    true
  );
}

assert.equal(
  ownerVisibleIds.has(
    owner.id
  ),
  false
);

    console.log(
      "✓ Owner can see agency-wide non-Owner People list"
    );

    const ownerView =
      await getPersonDetail(
        visibleChatter.id,
        ownerAccess
      );

    assert.ok(
      ownerView.security
    );

    assert.ok(
      ownerView
        .security
        .lastSignInAt
    );

    assert.equal(
      ownerView
        .security
        .twoFactor
        .email
        .enabled,
      true
    );

    console.log(
      "✓ Owner can see last sign-in and 2FA status"
    );

    const ownerSerialized =
      JSON.stringify(
        ownerView
      );

    assert.equal(
      ownerSerialized.includes(
        "DO_NOT_EXPOSE_PASSWORD_HASH"
      ),
      false
    );

    assert.equal(
      ownerSerialized.includes(
        "DO_NOT_EXPOSE_AUTHENTICATOR_SECRET"
      ),
      false
    );

    console.log(
      "✓ password hashes and authenticator secrets are never exposed"
    );

    const opsPeople =
  await listPeople(
    opsAccess
  );

const opsVisibleIds =
  new Set(
    opsPeople.map(
      (
        person
      ) =>
        person.id
    )
  );

for (
  const userId of
  createdUserIds.filter(
    (
      id
    ) =>
      id !==
      owner.id
  )
) {
  assert.equal(
    opsVisibleIds.has(
      userId
    ),
    true
  );
}

assert.equal(
  opsVisibleIds.has(
    owner.id
  ),
  false
);

    assert.equal(
      opsPeople
        .find(
          (
            person
          ) =>
            person.id ===
            visibleChatter.id
        )
        ?.security,
      undefined
    );

    console.log(
      "✓ Ops Manager sees agency-wide non-Owner People without Owner-only security data"
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
        pendingChatter.id
      ),
      true
    );

    assert.equal(
      managerVisibleIds.has(
        hiddenChatter.id
      ),
      false
    );

    assert.equal(
      managerVisibleIds.has(
        owner.id
      ),
      false
    );

    assert.equal(
      managerVisibleIds.has(
        ops.id
      ),
      false
    );

    assert.equal(
      managerVisibleIds.has(
        manager.id
      ),
      false
    );

    console.log(
      "✓ Manager sees only manageable lower-ranked staff on assigned models"
    );

    const managerDetail =
      await getPersonDetail(
        visibleChatter.id,
        managerAccess
      );

    assert.equal(
      managerDetail.security,
      undefined
    );

    console.log(
      "✓ Manager detail does not expose Owner-only security information"
    );

    await expectReadError(
      () =>
        getPersonDetail(
          hiddenChatter.id,
          managerAccess
        ),

      "PERSON_NOT_VISIBLE"
    );

    console.log(
      "✓ Manager cannot retrieve staff from an inaccessible model by ID"
    );

    await expectReadError(
      () =>
        listPeople(
          qcAccess
        ),

      "PEOPLE_ACCESS_REQUIRED"
    );

    console.log(
      "✓ QC cannot access People Management"
    );

    const pendingDetail =
      await getPersonDetail(
        pendingChatter.id,
        managerAccess
      );

    assert.equal(
      pendingDetail
        .setup
        .status,
      "INVITE_SENT"
    );

    assert.ok(
      pendingDetail
        .setup
        .expiresAt
    );

    const pendingSerialized =
      JSON.stringify(
        pendingDetail
      );

    assert.equal(
      pendingSerialized.includes(
        `read-invite-${suffix}`
      ),
      false
    );

    console.log(
      "✓ pending setup/invite status is visible without exposing invite token hashes"
    );

    console.log("");

    console.log(
      "All people-read tests passed."
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
  .catch(
    (
      error
    ) => {
      console.error(
        "People-read test failed:",
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