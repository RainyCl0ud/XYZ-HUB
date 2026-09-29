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
  presentAuditEvents,
} from "../src/services/audit-presentation.js";

import type {
  AuditEvent,
} from "../src/services/audit-store.js";

async function main() {
  console.log(
    "Starting audit presentation tests..."
  );

  const suffix =
    Date.now();

  const [
    managerRole,
    trialRole,
  ] =
    await Promise.all([
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey:
            "MANAGER",
        },
      }),
      prisma.role.findUniqueOrThrow({
        where: {
          systemKey:
            "TRIAL_CHATTER",
        },
      }),
    ]);

  const actor =
    await prisma.user.create({
      data: {
        name:
          "Audit Presenter Actor",
        email:
          "audit-presenter-actor-" +
          suffix +
          "@example.test",
        status:
          UserStatus.ACTIVE,
      },
    });

  const target =
    await prisma.user.create({
      data: {
        name:
          "Audit Presenter Target",
        email:
          "audit-presenter-target-" +
          suffix +
          "@example.test",
        status:
          UserStatus.ACTIVE,
      },
    });

  const firstCreator =
    await prisma.agencyModel.create({
      data: {
        name:
          "Audit Creator A " +
          suffix,
      },
    });

  const secondCreator =
    await prisma.agencyModel.create({
      data: {
        name:
          "Audit Creator B " +
          suffix,
      },
    });

  try {
    const event:
      AuditEvent = {
      id:
        "presentation-test",
      occurredAt:
        new Date().toISOString(),
      action:
        "people.access_changed",
      success:
        true,
      statusCode:
        200,
      actorUserId:
        actor.id,
      actorLabel:
        null,
      targetType:
        "user",
      targetId:
        target.id,
      ipAddress:
        "127.0.0.1",
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36",
      metadata: {
        before: {
          id:
            target.id,
          name:
            target.name,
          email:
            target.email,
          status:
            "ACTIVE",
          roleIds: [
            trialRole.id,
          ],
          modelIds: [
            firstCreator.id,
          ],
        },
        after: {
          id:
            target.id,
          name:
            target.name,
          email:
            target.email,
          status:
            "ACTIVE",
          roleIds: [
            managerRole.id,
          ],
          modelIds: [
            firstCreator.id,
            secondCreator.id,
          ],
        },
      },
    };

    const [
      presented,
    ] =
      await presentAuditEvents([
        event,
      ]);

    assert.ok(
      presented
    );

    assert.equal(
      presented.actor.label,
      actor.name
    );

    assert.equal(
      presented.actor.secondary,
      actor.email
    );

    assert.equal(
      presented.target.label,
      target.name
    );

    assert.equal(
      presented.target.secondary,
      target.email
    );

    assert.equal(
      presented.actionLabel,
      "Access updated"
    );

    assert.ok(
      presented.changes.some(
        (
          change
        ) =>
          change.label ===
            "Roles" &&
          change.removed.includes(
            trialRole.name
          ) &&
          change.added.includes(
            managerRole.name
          )
      )
    );

    assert.ok(
      presented.changes.some(
        (
          change
        ) =>
          change.label ===
            "Creators" &&
          change.removed.length ===
            0 &&
          change.added.includes(
            secondCreator.name
          )
      )
    );

    assert.equal(
      JSON.stringify(
        presented
      ).includes(
        target.id
      ),
      false
    );

    assert.equal(
      presented.source.deviceLabel,
      "Chrome 154 · Windows"
    );

    assert.equal(
      JSON.stringify(
        presented
      ).includes(
        "Mozilla/5.0"
      ),
      false
    );

    console.log(
      "✓ actor and target IDs resolve to names and emails"
    );

    console.log(
      "✓ access changes resolve role and creator IDs to readable names"
    );

    console.log(
      "✓ presented audit event does not expose internal target IDs"
    );

    console.log(
      "✓ browser and device are summarized without exposing the raw user agent"
    );

    const [
      deleted,
    ] =
      await presentAuditEvents([
        {
          ...event,
          id:
            "deleted-presentation-test",
          action:
            "people.deleted",
          targetId:
            "deleted-user-id",
          metadata: {
            before: {
              id:
                "deleted-user-id",
              name:
                "Former Team Member",
              email:
                "former@example.test",
              status:
                "DEACTIVATED",
              roleIds:
                [],
              modelIds:
                [],
            },
            after:
              null,
          },
        },
      ]);

    assert.equal(
      deleted.target.label,
      "Former Team Member"
    );

    assert.equal(
      deleted.target.secondary,
      "former@example.test"
    );

    assert.ok(
      deleted.changes.some(
        (
          change
        ) =>
          change.label ===
            "Account" &&
          change.after ===
            "Deleted"
      )
    );

    console.log(
      "✓ deleted targets remain human-readable from immutable snapshots"
    );

    console.log("");
    console.log(
      "All audit presentation tests passed."
    );
  } finally {
    await prisma.user.deleteMany({
      where: {
        id: {
          in: [
            actor.id,
            target.id,
          ],
        },
      },
    });

    await prisma.agencyModel.deleteMany({
      where: {
        id: {
          in: [
            firstCreator.id,
            secondCreator.id,
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
        "Audit presentation test failed:",
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
