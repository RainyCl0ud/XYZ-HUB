/// <reference types="node" />

import "dotenv/config";

import assert from "node:assert/strict";

import {
  mkdir,
  readFile,
  rm,
} from "node:fs/promises";

import {
  dirname,
  resolve,
} from "node:path";

import {
  appendAuditEvent,
  readAuditEvents,
} from "../src/services/audit-store.js";

async function main() {
  console.log(
    "Starting Step 1 audit-store tests..."
  );

  const previous = {
    mode:
      process.env
        .AUDIT_STORE_MODE,
    path:
      process.env
        .AUDIT_FILE_PATH,
    nodeEnv:
      process.env
        .NODE_ENV,
    allow:
      process.env
        .ALLOW_FILE_AUDIT_IN_PRODUCTION,
  };

  const filePath =
    resolve(
      process.cwd(),
      ".local-data",
      `audit-test-${Date.now()}.jsonl`
    );

  process.env
    .AUDIT_STORE_MODE =
    "file";

  process.env
    .AUDIT_FILE_PATH =
    filePath;

  process.env
    .NODE_ENV =
    "test";

  process.env
    .ALLOW_FILE_AUDIT_IN_PRODUCTION =
    "false";

  await mkdir(
    dirname(
      filePath
    ),
    {
      recursive:
        true,
    }
  );

  try {
    const first =
      await appendAuditEvent({
        action:
          "people.access_changed",
        success:
          true,
        statusCode:
          200,
        actorUserId:
          "owner-test",
        actorLabel:
          "owner@example.test",
        targetType:
          "user",
        targetId:
          "target-a",
        ipAddress:
          "127.0.0.1",
        userAgent:
          "test",
        metadata: {
          before: {
            roles: [
              "CHATTER",
            ],
          },
          after: {
            roles: [
              "QC",
            ],
          },
        },
      });

    const second =
      await appendAuditEvent({
        action:
          "auth.sign_in_failed",
        success:
          false,
        statusCode:
          401,
        actorUserId:
          null,
        actorLabel:
          "wrong@example.test",
        targetType:
          "user",
        targetId:
          null,
        ipAddress:
          "127.0.0.1",
        userAgent:
          "test",
        metadata:
          null,
      });

    const third =
      await appendAuditEvent({
        action:
          "role.updated",
        success:
          true,
        statusCode:
          200,
        actorUserId:
          "owner-test",
        actorLabel:
          null,
        targetType:
          "role",
        targetId:
          "role-test",
        ipAddress:
          "127.0.0.1",
        userAgent:
          "test",
        metadata: {
          before: {
            rank:
              7,
          },
          after: {
            rank:
              8,
          },
        },
      });

    assert.notEqual(
      first.id,
      second.id
    );

    assert.notEqual(
      second.id,
      third.id
    );

    console.log(
      "✓ append-only adapter creates unique audit events"
    );

    const raw =
      await readFile(
        filePath,
        "utf8"
      );

    const lines =
      raw
        .trim()
        .split(
          "\n"
        );

    assert.equal(
      lines.length,
      3
    );

    console.log(
      "✓ audit events are appended as separate immutable-style JSONL records"
    );

    const all =
      await readAuditEvents({
        limit:
          10,
      });

    assert.equal(
      all.length,
      3
    );

    assert.equal(
      all[0].id,
      third.id
    );

    console.log(
      "✓ audit reads return newest events first"
    );

    const failed =
      await readAuditEvents({
        success:
          false,
      });

    assert.equal(
      failed.length,
      1
    );

    assert.equal(
      failed[0].id,
      second.id
    );

    console.log(
      "✓ audit success/failure filtering works"
    );

    const roleSearch =
      await readAuditEvents({
        search:
          "role-test",
      });

    assert.equal(
      roleSearch.length,
      1
    );

    assert.equal(
      roleSearch[0].id,
      third.id
    );

    console.log(
      "✓ audit search covers event metadata and targets"
    );

    process.env
      .NODE_ENV =
      "production";

    await assert.rejects(
      () =>
        appendAuditEvent({
          action:
            "production.file.block",
          success:
            true,
          statusCode:
            200,
          actorUserId:
            null,
          actorLabel:
            null,
          targetType:
            null,
          targetId:
            null,
          ipAddress:
            null,
          userAgent:
            null,
          metadata:
            null,
        }),
      /File audit storage is disabled in production/
    );

    console.log(
      "✓ local file audit adapter refuses production use"
    );

    console.log("");
    console.log(
      "All Step 1 audit-store tests passed."
    );
  } finally {
    if (
      previous.mode ===
      undefined
    ) {
      delete process.env
        .AUDIT_STORE_MODE;
    } else {
      process.env
        .AUDIT_STORE_MODE =
        previous.mode;
    }

    if (
      previous.path ===
      undefined
    ) {
      delete process.env
        .AUDIT_FILE_PATH;
    } else {
      process.env
        .AUDIT_FILE_PATH =
        previous.path;
    }

    if (
      previous.nodeEnv ===
      undefined
    ) {
      delete process.env
        .NODE_ENV;
    } else {
      process.env
        .NODE_ENV =
        previous.nodeEnv;
    }

    if (
      previous.allow ===
      undefined
    ) {
      delete process.env
        .ALLOW_FILE_AUDIT_IN_PRODUCTION;
    } else {
      process.env
        .ALLOW_FILE_AUDIT_IN_PRODUCTION =
        previous.allow;
    }

    await rm(
      filePath,
      {
        force:
          true,
      }
    );
  }
}

main()
  .catch(
    (
      error
    ) => {
      console.error(
        "Step 1 audit-store test failed:",
        error
      );

      process.exit(1);
    }
  );
