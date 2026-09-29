/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  prisma,
} from "../src/lib/prisma.js";

import {
  appendAuditEvent,
  readAuditEvents,
} from "../src/services/audit-store.js";

async function main() {
  console.log(
    "Starting Step 1 database audit-store tests..."
  );

  const previousMode =
    process.env
      .AUDIT_STORE_MODE;

  process.env
    .AUDIT_STORE_MODE =
    "database";

  const marker =
    `audit-db-test-${Date.now()}`;

  const actionOne =
    `${marker}.created`;

  const actionTwo =
    `${marker}.failed`;

  const createdIds:
    string[] = [];

  try {
    const first =
      await appendAuditEvent({
        action:
          actionOne,
        success:
          true,
        statusCode:
          200,
        actorUserId:
          marker,
        actorLabel:
          `${marker}@example.test`,
        targetType:
          "user",
        targetId:
          "target-a",
        ipAddress:
          "127.0.0.1",
        userAgent:
          "database-audit-test",
        metadata: {
          marker,
          nested: {
            source:
              "database",
          },
        },
      });

    createdIds.push(
      first.id
    );

    const second =
      await appendAuditEvent({
        action:
          actionTwo,
        success:
          false,
        statusCode:
          403,
        actorUserId:
          marker,
        actorLabel:
          null,
        targetType:
          "role",
        targetId:
          "target-b",
        ipAddress:
          null,
        userAgent:
          "database-audit-test",
        metadata: {
          marker,
          reason:
            "expected-test-failure",
        },
      });

    createdIds.push(
      second.id
    );

    assert.notEqual(
      first.id,
      second.id
    );

    const persisted =
      await prisma.auditEvent.findMany({
        where: {
          id: {
            in:
              createdIds,
          },
        },
      });

    assert.equal(
      persisted.length,
      2
    );

    console.log(
      "✓ database audit events persist in PostgreSQL"
    );

    const actionFiltered =
      await readAuditEvents({
        action:
          actionOne,
        limit:
          10,
      });

    assert.equal(
      actionFiltered.length,
      1
    );

    assert.equal(
      actionFiltered[0].id,
      first.id
    );

    console.log(
      "✓ database audit action filtering works"
    );

    const failed =
      await readAuditEvents({
        success:
          false,
        search:
          marker,
        limit:
          10,
      });

    assert.equal(
      failed.some(
        (
          event
        ) =>
          event.id ===
          second.id
      ),
      true
    );

    console.log(
      "✓ database audit success and search filtering works"
    );

    const metadataSearch =
      await readAuditEvents({
        search:
          "expected-test-failure",
        limit:
          10,
      });

    assert.equal(
      metadataSearch.some(
        (
          event
        ) =>
          event.id ===
          second.id
      ),
      true
    );

    console.log(
      "✓ database audit search covers arbitrary metadata"
    );

    console.log("");
    console.log(
      "All Step 1 database audit-store tests passed."
    );
  } finally {
    if (
      createdIds.length >
        0
    ) {
      await prisma.auditEvent.deleteMany({
        where: {
          id: {
            in:
              createdIds,
          },
        },
      });
    }

    if (
      previousMode ===
      undefined
    ) {
      delete process.env
        .AUDIT_STORE_MODE;
    } else {
      process.env
        .AUDIT_STORE_MODE =
        previousMode;
    }

    await prisma.$disconnect();
  }
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "Step 1 database audit-store test failed:",
        error
      );

      process.exit(1);
    }
  );
