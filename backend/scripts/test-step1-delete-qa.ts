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

async function main() {
  console.log(
    "Starting permanent-delete QA semantics test..."
  );

  const suffix =
    Date.now();

  const [
    ownerRole,
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
            "CHATTER",
        },
      }),
    ]);

  assert.ok(ownerRole);
  assert.ok(chatterRole);

  const owner =
    await prisma.user.create({
      data: {
        name:
          "Delete QA Owner",
        email:
          `delete-qa-owner-${suffix}@example.test`,
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

  const target =
    await prisma.user.create({
      data: {
        name:
          "Delete QA Target",
        email:
          `delete-qa-target-${suffix}@example.test`,
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

  const chatter =
    await prisma.chatter.create({
      data: {
        name:
          `Delete QA Chatter ${suffix}`,
        userId:
          target.id,
      },
    });

  const rule =
    await prisma.rule.create({
      data: {
        versions: {
          create: {
            versionNumber:
              1,
            title:
              `Delete QA Rule ${suffix}`,
            definition:
              "Temporary deletion-semantics fixture.",
          },
        },
      },
      include: {
        versions:
          true,
      },
    });

  const ruleVersion =
    rule.versions[0];

  assert.ok(
    ruleVersion
  );

  const incident =
    await prisma.incident.create({
      data: {
        chatterId:
          chatter.id,
        ruleVersionId:
          ruleVersion.id,
        ruleTitleSnapshot:
          ruleVersion.title,
        ruleDefinitionSnapshot:
          ruleVersion.definition,
        severityNameSnapshot:
          null,
        weightNameSnapshot:
          null,
        weightValueSnapshot:
          null,
        expiresAt:
          new Date(
            Date.now() +
              24 * 60 * 60 * 1000
          ),
        details:
          "Temporary incident that must be deleted with the employee.",
      },
    });

  try {
    const ownerAccess =
      await getAccessContext(
        owner.id
      );

    const result =
      await deletePerson(
        {
          userId:
            target.id,
          confirmEmail:
            target.email,
        },
        ownerAccess
      );

    assert.equal(
      result.deletedChatterId,
      chatter.id
    );

    assert.equal(
      result.deletedIncidentCount,
      1
    );

    const [
      deletedUser,
      deletedChatter,
      deletedIncident,
    ] =
      await Promise.all([
        prisma.user.findUnique({
          where: {
            id:
              target.id,
          },
        }),
        prisma.chatter.findUnique({
          where: {
            id:
              chatter.id,
          },
        }),
        prisma.incident.findUnique({
          where: {
            id:
              incident.id,
          },
        }),
      ]);

    assert.equal(
      deletedUser,
      null
    );

    assert.equal(
      deletedChatter,
      null
    );

    assert.equal(
      deletedIncident,
      null
    );

    console.log(
      "✓ permanent deletion removes Login Gate identity, chatter profile and tied incident history"
    );

    console.log("");
    console.log(
      "Permanent-delete QA semantics test passed."
    );
  } finally {
    await prisma.incident.deleteMany({
      where: {
        id:
          incident.id,
      },
    });

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
            target.id,
          ],
        },
      },
    });

    await prisma.ruleVersion.deleteMany({
      where: {
        ruleId:
          rule.id,
      },
    });

    await prisma.rule.deleteMany({
      where: {
        id:
          rule.id,
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
        "Permanent-delete QA semantics test failed:",
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
