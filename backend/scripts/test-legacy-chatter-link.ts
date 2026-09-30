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
  linkLegacyChatterToUser,
  LegacyChatterLinkError,
} from "../src/services/legacy-chatter-link.js";

async function main() {
  console.log(
    "Starting legacy chatter-link tests..."
  );

  const suffix =
    Date.now();

  const [
    chatterRole,
    managerRole,
  ] =
    await Promise.all([
      prisma.role.findUnique({
        where: {
          systemKey:
            "CHATTER",
        },
      }),
      prisma.role.findUnique({
        where: {
          systemKey:
            "MANAGER",
        },
      }),
    ]);

  assert.ok(chatterRole);
  assert.ok(managerRole);

  const chatterUser =
    await prisma.user.create({
      data: {
        name:
          `Current Employee ${suffix}`,
        email:
          `legacy-link-chatter-${suffix}@example.test`,
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

  const managerUser =
    await prisma.user.create({
      data: {
        name:
          `Legacy Link Manager ${suffix}`,
        email:
          `legacy-link-manager-${suffix}@example.test`,
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

  const legacyChatter =
    await prisma.chatter.create({
      data: {
        name:
          `Legacy QA Name ${suffix}`,
      },
    });

  const managerLegacyChatter =
    await prisma.chatter.create({
      data: {
        name:
          `Manager Legacy QA ${suffix}`,
      },
    });

  try {
    const result =
      await linkLegacyChatterToUser({
        chatterName:
          legacyChatter.name,
        userEmail:
          chatterUser.email,
      });

    assert.equal(
      result.chatter.id,
      legacyChatter.id
    );
    assert.equal(
      result.chatter.userId,
      chatterUser.id
    );
    assert.equal(
      result.chatter.name,
      chatterUser.name
    );

    console.log(
      "✓ explicit legacy link attaches the QA chatter and synchronizes the current People name"
    );

    await assert.rejects(
      () =>
        linkLegacyChatterToUser({
          chatterName:
            managerLegacyChatter.name,
          userEmail:
            managerUser.email,
        }),
      (
        error
      ) =>
        error instanceof
          LegacyChatterLinkError &&
        error.code ===
          "USER_NOT_CHATTER"
    );

    console.log(
      "✓ non-Chatter People accounts cannot be linked to QA chatter identities"
    );

    await assert.rejects(
      () =>
        linkLegacyChatterToUser({
          chatterName:
            managerLegacyChatter.name,
          userEmail:
            chatterUser.email,
        }),
      (
        error
      ) =>
        error instanceof
          LegacyChatterLinkError &&
        error.code ===
          "USER_ALREADY_LINKED"
    );

    console.log(
      "✓ a People account already linked to a chatter cannot be linked again"
    );

    console.log("");
    console.log(
      "All legacy chatter-link tests passed."
    );
  } finally {
    await prisma.chatter.deleteMany({
      where: {
        id: {
          in: [
            legacyChatter.id,
            managerLegacyChatter.id,
          ],
        },
      },
    });

    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            chatterUser.id,
            managerUser.id,
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
        "Legacy chatter-link tests failed:",
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
