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
  deletePerson,
} from "../src/services/people-delete.js";

import {
  deactivatePerson,
} from "../src/services/people-status.js";

import {
  resetPersonTwoFactor,
} from "../src/services/people-two-factor.js";

import {
  subscribeLiveUpdates,
  type LiveUpdate,
} from "../src/services/live-updates.js";

import {
  ROOT_TEAM_GROUP_ID,
} from "../src/services/team-hierarchy.js";

async function main() {
  console.log(
    "Starting live session-invalidation tests..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
    chatterRole,
  ] =
    await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey: "OWNER",
        },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey: "CHATTER",
        },
      }),
    ]);

  const owner =
    await prisma.user.create({
      data: {
        name: "Live Invalidator Owner",
        email:
          `live-owner-${suffix}@example.test`,
        status: UserStatus.ACTIVE,
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

  async function createTarget(
    label: string
  ) {
    return prisma.user.create({
      data: {
        name:
          `Live ${label}`,
        email:
          `live-${label.toLowerCase()}-${suffix}@example.test`,
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
  }

  const [
    deactivateTarget,
    resetTarget,
    deleteTarget,
  ] =
    await Promise.all([
      createTarget("Deactivate"),
      createTarget("Reset"),
      createTarget("Delete"),
    ]);

  const events:
    LiveUpdate[] = [];

  const unsubscribe =
    subscribeLiveUpdates(
      (update) => {
        events.push(update);
      }
    );

  try {
    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    await deactivatePerson(
      deactivateTarget.id,
      ownerAccess
    );

    assert.ok(
      events.some(
        (event) =>
          event.type ===
            "session.invalidated" &&
          event.userId ===
            deactivateTarget.id &&
          event.reason ===
            "ACCOUNT_DEACTIVATED"
      )
    );

    console.log(
      "✓ deactivation publishes targeted immediate session invalidation"
    );

    await resetPersonTwoFactor(
      resetTarget.id,
      ownerAccess
    );

    assert.ok(
      events.some(
        (event) =>
          event.type ===
            "session.invalidated" &&
          event.userId ===
            resetTarget.id &&
          event.reason ===
            "TWO_FACTOR_RESET"
      )
    );

    console.log(
      "✓ 2FA reset publishes targeted immediate session invalidation"
    );

    await deletePerson(
      {
        userId:
          deleteTarget.id,
        confirmEmail:
          deleteTarget.email,
      },
      ownerAccess
    );

    assert.ok(
      events.some(
        (event) =>
          event.type ===
            "session.invalidated" &&
          event.userId ===
            deleteTarget.id &&
          event.reason ===
            "ACCOUNT_DELETED"
      )
    );

    console.log(
      "✓ permanent deletion publishes targeted immediate session invalidation"
    );

    const deleted =
      await prisma.user.findUnique({
        where: {
          id:
            deleteTarget.id,
        },
      });

    assert.equal(
      deleted,
      null
    );

    console.log("");
    console.log(
      "All live session-invalidation tests passed."
    );
  } finally {
    unsubscribe();

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            owner.id,
            deactivateTarget.id,
            resetTarget.id,
          ],
        },
      },
    });
  }
}

main()
  .catch(
    (error) => {
      console.error(
        "Live session-invalidation test failed:",
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
