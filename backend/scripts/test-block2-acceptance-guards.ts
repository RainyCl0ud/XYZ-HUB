import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { Response } from "express";
import { RoleDataScope } from "@prisma/client";
import { prisma } from "../src/lib/prisma.js";
import strikeRoutes from "../src/routes/strikes.js";
import { listOwnStrikes } from "../src/services/strike-management.js";
import type { AccessContext } from "../src/services/access-control.js";
import type { AuthenticatedRequest } from "../src/middleware/access.js";
import {
  chatChannelArchiveEnabled, chatChannelExportEnabled, chatChannelCleanupEnabled,
} from "../src/services/chat-archive-policy.js";
import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "../src/services/chat-staging-target.js";

// In-memory service and route checks: no network requests or database writes.
type Row = {
  id: string; userId: string; reasonNameSnapshot: string; standingLabelSnapshot: string;
  details: string; issuedAt: Date; createdAt: Date; expiresAt: Date; voidedAt: Date | null;
};
const changes: Array<() => void> = [];
function replace(target: object, key: string, value: unknown) {
  const previous = Reflect.get(target, key);
  Reflect.set(target, key, value);
  changes.push(() => Reflect.set(target, key, previous));
}
function access(userId: string, permissions: string[]): AccessContext {
  return {
    userId, roles: [], highestRank: null, teamGroupId: null,
    effectiveDataScope: RoleDataScope.SELF_AND_TEAM,
    permissions: new Set(permissions), assignedModelIds: [], canSeeAllModels: false,
  };
}

async function main() {
  const records: Row[] = Array.from({ length: 12 }, (_, index) => ({
    id: "mine-" + index, userId: "employee-a",
    reasonNameSnapshot: "Recorded reason " + index,
    standingLabelSnapshot: "Standing " + index,
    details: "Original record " + index,
    issuedAt: new Date(Date.UTC(2026, 10, index + 1)),
    createdAt: new Date(Date.UTC(2026, 10, index + 1)),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"),
    voidedAt: index === 0 ? new Date("2026-11-13T00:00:00.000Z") : null,
  }));
  records.push({
    id: "another-person", userId: "employee-b",
    reasonNameSnapshot: "Confidential other-person reason",
    standingLabelSnapshot: "Different standing", details: "Do not leak",
    issuedAt: new Date("2026-11-14T00:00:00.000Z"),
    createdAt: new Date("2026-11-14T00:00:00.000Z"),
    expiresAt: new Date("2099-01-01T00:00:00.000Z"), voidedAt: null,
  });
  const queries: Array<{ userId: string; kind: string }> = [];
  replace(prisma, "$transaction", async (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma));
  replace(prisma.strike, "count", async ({ where }: { where: { userId: string } }) => {
    assert.deepEqual(Object.keys(where), ["userId"], "Counts must filter by the authenticated user ID.");
    queries.push({ userId: where.userId, kind: "count" });
    return records.filter((row) => row.userId === where.userId).length;
  });
  replace(prisma.strike, "findMany", async ({ where, select, skip, take }: {
    where: { userId: string }; select: Record<string, boolean>; skip: number; take: number;
  }) => {
    assert.deepEqual(Object.keys(where), ["userId"], "Reads must filter by the authenticated user ID.");
    assert.equal(take, 10, "Personal strike history must remain bounded.");
    assert.equal(select.userId, undefined, "The personal DTO must not expose an identity field.");
    queries.push({ userId: where.userId, kind: "findMany" });
    return records.filter((row) => row.userId === where.userId)
      .sort((a, b) => b.issuedAt.getTime() - a.issuedAt.getTime())
      .slice(skip, skip + take)
      .map((row) => Object.fromEntries(Object.entries(row).filter(([key]) => select[key] === true)));
  });

  const ownRoute = strikeRoutes.stack.map((layer) => layer.route)
    .find((route) => route?.path === "/mine" && route.stack.some((layer) => layer.method === "get"));
  assert.ok(ownRoute && ownRoute.stack.length >= 2, "Personal strikes needs a permission guard and handler.");
  async function invoke(viewer: AccessContext | undefined, query: Record<string, unknown>) {
    let status = 200;
    let payload: unknown;
    let passed = false;
    let failure: unknown;
    const req = { access: viewer, query } as unknown as AuthenticatedRequest;
    const response = {
      status(code: number) { status = code; return this; },
      json(value: unknown) { payload = value; return this; },
      setHeader(name: string, value: string) {
        assert.equal(name.toLowerCase(), "cache-control");
        assert.equal(value, "no-store", "Private history must not be cacheable.");
      },
    } as unknown as Response;
    ownRoute!.stack[0].handle(req, response, (error?: unknown) => {
      if (error) failure = error;
      else passed = true;
    });
    if (passed) await ownRoute!.stack[1].handle(req, response, (error?: unknown) => { failure = error; });
    assert.equal(failure, undefined);
    return { status, payload };
  }

  assert.equal((await invoke(undefined, {})).status, 401);
  assert.equal((await invoke(access("employee-a", []), {})).status, 403);
  assert.equal((await invoke(access("employee-a", ["strikes.view", "strikes.access"]), {})).status, 403);
  assert.equal(queries.length, 0, "Unauthorized requests must not read strike records.");
  console.log("PASS 1: My Strikes denies unauthenticated and non-permitted access before reading.");

  for (const query of [{ page: "0" }, { page: "-1" }, { page: "oops" }, { page: "1", userId: "employee-b" }]) {
    assert.equal((await invoke(access("employee-a", ["strikes.self.view"]), query)).status, 400);
  }
  assert.equal(queries.length, 0, "Invalid queries must not access strike records.");
  console.log("PASS 2: Invalid pagination and foreign-person parameters are rejected.");

  const first = await invoke(access("employee-a", ["strikes.self.view"]), { page: "1" });
  assert.equal(first.status, 200);
  const firstPage = first.payload as { records: Array<{ id: string; reason: string; userId?: string }>; page: number; pageCount: number };
  assert.equal(firstPage.page, 1);
  assert.equal(firstPage.pageCount, 2);
  assert.equal(firstPage.records.length, 10);
  assert.ok(firstPage.records.every((row) => row.id.startsWith("mine-") && !("userId" in row)));
  assert.ok(firstPage.records.every((row) => !row.reason.includes("Confidential")));
  const last = await invoke(access("employee-a", ["strikes.self.view"]), { page: "999" });
  const lastPage = last.payload as { records: Array<{ id: string; status: string }>; page: number };
  assert.equal(lastPage.page, 2);
  assert.equal(lastPage.records.length, 2);
  assert.ok(lastPage.records.some((row) => row.id === "mine-0" && row.status === "VOIDED"));
  const other = await invoke(access("employee-b", ["strikes.self.view"]), { page: "1" });
  assert.deepEqual((other.payload as { records: Array<{ id: string }> }).records.map((row) => row.id), ["another-person"]);
  const empty = await invoke(access("no-records", ["strikes.self.view"]), {});
  assert.deepEqual((empty.payload as { records: Array<{ id: string }> }).records, []);
  assert.ok(queries.every((item) => ["employee-a", "employee-b", "no-records"].includes(item.userId)));
  console.log("PASS 3: My Strikes returns only own records and bounded, read-only pages.");

  const base = {
    RAILWAY_PROJECT_ID: CHAT_STAGING_PROJECT_ID,
    RAILWAY_ENVIRONMENT_ID: CHAT_STAGING_ENVIRONMENT_ID,
    RAILWAY_ENVIRONMENT_NAME: "Staging",
    BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED: "true",
    BLOCK2_CHAT_CHANNEL_EXPORT_ENABLED: "true",
    BLOCK2_CHAT_CHANNEL_CLEANUP_ENABLED: "true",
  };
  assert.equal(chatChannelArchiveEnabled(base), true);
  assert.equal(chatChannelExportEnabled(base), true);
  assert.equal(chatChannelCleanupEnabled(base), true);
  for (const key of ["BLOCK2_CHAT_CHANNEL_EXPORT_ENABLED", "BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED", "BLOCK2_CHAT_CHANNEL_CLEANUP_ENABLED"]) {
    assert.equal(chatChannelCleanupEnabled({ ...base, [key]: "false" }), false);
  }
  assert.equal(chatChannelCleanupEnabled({ ...base, RAILWAY_ENVIRONMENT_NAME: "Production" }), false);
  assert.equal(chatChannelCleanupEnabled({ ...base, RAILWAY_ENVIRONMENT_ID: "other" }), false);
  assert.equal(chatChannelCleanupEnabled({ ...base, RAILWAY_PROJECT_ID: "other" }), false);
  console.log("PASS 4: Archive/export/cleanup flags are chained and Staging-restricted.");

  const source = await readFile(new URL("../src/services/creator-chat.ts", import.meta.url), "utf8");
  const routes = await readFile(new URL("../src/routes/chat.ts", import.meta.url), "utf8");
  const exportSource = await readFile(new URL("../src/services/chat-channel-export.ts", import.meta.url), "utf8");
  const dialog = await readFile(new URL("../../frontend/src/pages/ChatChannelCleanupDialog.tsx", import.meta.url), "utf8");
  assert.match(source, /if \(!viewer\.isOwner\) throw new ChatError\(403, "Only Owners can clean up archived channels/);
  assert.match(source, /if \(!channel\.archivedAt\) throw new ChatError\(409,/);
  assert.match(source, /if \(channel\.key === "updates"\) throw new ChatError\(403,/);
  assert.match(source, /completedChannelDownload\(tx, userId, channelId, channel\.archivedAt, downloadId\)/);
  assert.match(source, /if \(!download\) throw new ChatError\(409,/);
  assert.match(routes, /confirmedSaved: z\.literal\(true\)/);
  assert.match(dialog, /disabled=\{!confirmedSaved \|\| busy\}/);
  assert.match(exportSource, /if \(!viewer\.isOwner\) throw new ChatError\(403,/);
  assert.match(exportSource, /if \(!access\.archived\) throw new ChatError\(409,/);
  assert.match(exportSource, /await audit\("chat\.channel\.export\.start"\)/);
  assert.match(exportSource, /await audit\("chat\.channel\.export\.download"\)/);
  console.log("PASS 5: Source safeguards require Owner, archived state, downloaded ZIP and confirmation.");

  const ui = await readFile(new URL("../../frontend/src/pages/MyStrikesPage.tsx", import.meta.url), "utf8");
  const app = await readFile(new URL("../../frontend/src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /path="\/my-strikes"[\s\S]*?<RequirePermission permission="strikes\.self\.view">/);
  assert.match(ui, /key=\{user\.id\}/);
  assert.ok(ui.includes("/api/strikes/mine?page="));
  assert.ok(!/Dispute|issueStrike|voidStrike|Delete Strike/i.test(ui));
  console.log("PASS 6: My Strikes UI is permission-gated, account-scoped and read-only.");

  console.log("6 Block 2 acceptance-guard regression groups passed; no Staging data was changed.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(async () => {
  changes.reverse().forEach((restore) => restore());
  await prisma.$disconnect();
});
