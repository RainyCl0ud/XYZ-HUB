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
  invitePerson,
} from "../src/services/people-invite.js";

import {
  resendPersonInvite,
} from "../src/services/people-resend-invite.js";

import {
  validateInviteToken,
} from "../src/services/invite.js";

async function runTests() {
  console.log(
    "Starting resend-invite tests..."
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

  const chatterRole =
    await prisma.role.findUnique({
      where: {
        systemKey:
          "CHATTER",
      },
    });

  assert.ok(ownerRole);
  assert.ok(chatterRole);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Resend Test Owner",

        email:
          `resend-owner-${suffix}@example.test`,

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

  const model =
    await prisma.agencyModel.create({
      data: {
        name:
          `Resend Model ${suffix}`,
      },
    });

  await prisma.userModelAssignment.create({
    data: {
      userId:
        owner.id,
      modelId:
        model.id,
    },
  });

  let invitedUserId:
    string | null =
      null;

  try {
    const access =
      await getAccessContext(
        owner.id
      );

    const original =
      await invitePerson(
        {
          name:
            "Pending Resend User",

          email:
            `resend-user-${suffix}@example.test`,

          roleIds: [
            chatterRole.id,
          ],

          modelIds: [
            model.id,
          ],
        },

        access
      );

    invitedUserId =
      original.user.id;

    assert.ok(
      await validateInviteToken(
        original.token
      )
    );

    console.log(
      "✓ original invite is valid"
    );

    const resent =
      await resendPersonInvite(
        original.user.id,
        access
      );

    assert.notEqual(
      resent.token,
      original.token
    );

    console.log(
      "✓ resend generates a new token"
    );

    assert.equal(
      await validateInviteToken(
        original.token
      ),
      null
    );

    console.log(
      "✓ old token becomes invalid"
    );

    assert.ok(
      await validateInviteToken(
        resent.token
      )
    );

    console.log(
      "✓ new token is valid"
    );

    const invites =
      await prisma.invite.findMany({
        where: {
          userId:
            original.user.id,
        },

        orderBy: {
          createdAt:
            "asc",
        },
      });

    assert.equal(
      invites.length,
      2
    );

    assert.ok(
      invites[0]
        ?.revokedAt
    );

    assert.equal(
      invites[1]
        ?.revokedAt,
      null
    );

    console.log(
      "✓ previous invite is stored as revoked"
    );

    console.log("");

    console.log(
      "All resend-invite tests passed."
    );
  } finally {
    if (invitedUserId) {
      await prisma.user.delete({
        where: {
          id:
            invitedUserId,
        },
      });
    }

    await prisma.user.delete({
      where: {
        id:
          owner.id,
      },
    });

    await prisma.agencyModel.delete({
      where: {
        id:
          model.id,
      },
    });
  }
}

runTests()
  .catch((error) => {
    console.error(
      "Resend-invite test failed:",
      error
    );

    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });