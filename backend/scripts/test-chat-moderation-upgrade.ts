import "dotenv/config";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { installCreatorChatDefaults, installChatInteractionDefaults, provisionCreatorChat } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { installClockDefaults, getOwnClock } from "../src/services/clock.js";
import { installClockAlertDefaults } from "../src/services/clock-alerts.js";
import { installClockCorrectionDefaults, requestClockCorrection } from "../src/services/clock-corrections.js";
import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "../src/services/chat-staging-target.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /^\/block2_.*_upgrade_rehearsal$/.test(url.pathname), "Use a fresh named local upgrade rehearsal database.");
  assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID, "Never run upgrade tests inside Railway.");
  const tables = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`;
  assert.equal(Number(tables[0].count), 0, "The rehearsal requires an empty database and never resets existing data.");
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), ".."), root = resolve(backend, "..");
  const npmCli = process.env.npm_execpath; assert.ok(npmCli, "Run this rehearsal through npm.");
  const localData = join(backend, ".local-data"); mkdirSync(localData, { recursive: true });
  const baseline = mkdtempSync(join(localData, "chat-moderation-upgrade-"));
  mkdirSync(join(baseline, "migrations"));
  copyFileSync(join(backend, "prisma", "schema.prisma"), join(baseline, "schema.prisma"));
  copyFileSync(join(backend, "prisma", "migrations", "migration_lock.toml"), join(baseline, "migrations", "migration_lock.toml"));
  const migrations = readdirSync(join(backend, "prisma", "migrations"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name < "20261028010000");
  assert.equal(migrations.length, 23);
  for (const migration of migrations) {
    mkdirSync(join(baseline, "migrations", migration.name));
    copyFileSync(join(backend, "prisma", "migrations", migration.name, "migration.sql"), join(baseline, "migrations", migration.name, "migration.sql"));
  }
  execFileSync(process.execPath, [join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", join(baseline, "schema.prisma")], { cwd: root, stdio: "inherit" });
  execFileSync(process.execPath, [npmCli, "run", "seed", "--workspace=backend"], { cwd: root, stdio: "inherit" });
  const staffRole = await prisma.role.findUniqueOrThrow({ where: { systemKey: "CHATTER" } });
  const user = await prisma.user.create({ data: { name: "Interaction upgrade staff", email: "interaction-upgrade@example.test", status: "ACTIVE", roleMemberships: { create: { roleId: staffRole.id } } } });
  const model = await prisma.agencyModel.create({ data: { name: "Interaction upgrade creator" } });
  await prisma.userModelAssignment.create({ data: { userId: user.id, modelId: model.id } });
  await prisma.$transaction(async (tx) => {
    await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx);
    await installClockDefaults(tx); await installClockAlertDefaults(tx); await installClockCorrectionDefaults(tx);
    await provisionCreatorChat(tx, model.id); await syncUserStandingChats(tx, user.id);
  });
  // Reproduce the previous catalog; moderation did not exist before migration 24.
  await prisma.rolePermission.deleteMany({ where: { permission: { key: "chat.messages.moderate" } } });
  await prisma.permission.deleteMany({ where: { key: "chat.messages.moderate" } });
  const editPermission = await prisma.permission.findUniqueOrThrow({ where: { key: "chat.messages.edit_own" } });
  await prisma.rolePermission.deleteMany({ where: { roleId: staffRole.id, permissionId: editPermission.id } });
  const channel = await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: model.id, key: "general" } } });
  await prisma.chatChannel.update({ where: { id: channel.id }, data: { name: "Preserve custom channel" } });
  const messageId = randomUUID();
  await prisma.$executeRaw`INSERT INTO "ChatMessage" ("id", "channelId", "authorUserId", "authorName", "text", "version", "clientNonce", "createdAt", "updatedAt") VALUES (${messageId}, ${channel.id}, ${user.id}, ${user.name}, 'Preserve original text', 2, ${randomUUID()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`;
  const replyId = randomUUID();
  await prisma.$executeRaw`INSERT INTO "ChatMessage" ("id", "channelId", "authorUserId", "authorName", "text", "version", "clientNonce", "createdAt", "updatedAt", "replyToId") VALUES (${replyId}, ${channel.id}, ${user.id}, ${user.name}, 'Preserve reply', 1, ${randomUUID()}, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, ${messageId})`;
  await prisma.$executeRaw`UPDATE "ChatMessage" SET "pinnedAt" = CURRENT_TIMESTAMP, "pinnedById" = ${user.id}, "pinnedByName" = ${user.name}, "pinVersion" = 1 WHERE "id" = ${messageId}`;
  await prisma.chatReaction.create({ data: { messageId, userId: user.id, emoji: "👍" } });
  const shift = await prisma.clockShift.create({ data: { userId: user.id, personName: user.name, startedAt: new Date("2026-10-26T12:00:00Z"), endedAt: new Date("2026-10-26T16:00:00Z"), startDay: "2026-10-26", startWeek: "2026-10-26", startRequestId: randomUUID() } });
  await prisma.clockBreak.create({ data: { shiftId: shift.id, kind: "SHORT_ONE", startedAt: new Date("2026-10-26T13:00:00Z"), endedAt: new Date("2026-10-26T13:15:00Z"), endReason: "MANUAL", startRequestId: randomUUID() } });
  const recorded = (await getOwnClock(user.id)).history.find((s) => s.id === shift.id)!;
  await requestClockCorrection(user.id, { requestId: randomUUID(), shiftId: shift.id, expectedVersion: recorded.recordVersion, reason: "Preserve pending request", proposed: {
    startedAt: "2026-10-26T11:55:00Z", endedAt: "2026-10-26T16:00:00Z",
    breaks: recorded.breaks.map((b) => ({ kind: b.kind, startedAt: b.startedAt.toISOString(), endedAt: b.endedAt!.toISOString() })),
  } });
  await prisma.session.create({ data: { userId: user.id, tokenHash: randomUUID(), expiresAt: new Date(Date.now() + 86400000) } });
  const originalAudit = await prisma.auditEvent.create({ data: { action: "upgrade.existing", success: true, statusCode: 200, actorLabel: user.name, metadata: { original: "Preserve history" } } });
  const snapshot = () => Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" } }), prisma.userRole.findMany({ orderBy: { id: "asc" } }),
    prisma.userModelAssignment.findMany({ orderBy: { id: "asc" } }), prisma.agencyModel.findMany({ orderBy: { id: "asc" } }),
    prisma.chatArea.findMany({ orderBy: { modelId: "asc" } }), prisma.chatChannel.findMany({ orderBy: { id: "asc" } }),
    prisma.chatRoleGrant.findMany({ orderBy: [{ channelId: "asc" }, { roleId: "asc" }] }), prisma.chatPersonGrant.findMany({ orderBy: [{ channelId: "asc" }, { assignmentId: "asc" }] }),
    prisma.chatStandingConversation.findMany({ orderBy: { id: "asc" } }),
    prisma.$queryRaw`SELECT "id", "channelId", "conversationId", "authorUserId", "authorName", "text", "version", "clientNonce", "createdAt", "updatedAt", "replyToId", "pinnedAt", "pinnedById", "pinnedByName", "pinVersion" FROM "ChatMessage" ORDER BY "id"`,
    prisma.chatReaction.findMany({ orderBy: [{ messageId: "asc" }, { userId: "asc" }, { emoji: "asc" }] }),
    prisma.clockShift.findMany({ orderBy: { id: "asc" } }), prisma.clockBreak.findMany({ orderBy: { id: "asc" } }),
    prisma.clockCorrection.findMany({ orderBy: { id: "asc" } }), prisma.clockAlert.findMany({ orderBy: { id: "asc" } }),
    prisma.incident.findMany({ orderBy: { id: "asc" } }), prisma.strike.findMany({ orderBy: { id: "asc" } }),
    prisma.session.findMany({ orderBy: { id: "asc" } }), prisma.auditEvent.findUniqueOrThrow({ where: { id: originalAudit.id } }),
  ]);
  const before = await snapshot(), grants = await prisma.rolePermission.findMany({ orderBy: { id: "asc" } });
  const prepare = () => execFileSync(process.execPath, [npmCli, "run", "chat:prepare-staging", "--workspace=backend"], {
    cwd: root, stdio: "inherit", env: { ...process.env, RAILWAY_PROJECT_ID: CHAT_STAGING_PROJECT_ID, RAILWAY_ENVIRONMENT_ID: CHAT_STAGING_ENVIRONMENT_ID, RAILWAY_ENVIRONMENT_NAME: "Staging", BLOCK2_CHAT_ENABLED: "true", BLOCK2_CLOCK_ENABLED: "true" },
  });
  prepare();
  assert.deepEqual(await snapshot(), before);
  assert.deepEqual(await prisma.rolePermission.findMany({ where: { id: { in: grants.map((g) => g.id) } }, orderBy: { id: "asc" } }), grants);
  assert.equal(await prisma.rolePermission.count({ where: { roleId: staffRole.id, permissionId: editPermission.id } }), 0);
  assert.equal(await prisma.chatReaction.count(), 1);
  const message = await prisma.chatMessage.findUniqueOrThrow({ where: { id: messageId } });
  assert.equal(message.deletedAt, null); assert.equal(message.deletionReason, null); assert.ok(message.pinnedAt); assert.equal(message.pinVersion, 1);
  assert.equal((await prisma.chatMessage.findUniqueOrThrow({ where: { id: replyId } })).replyToId, messageId);
  const pin = await prisma.permission.findUniqueOrThrow({ where: { key: "chat.messages.moderate" } });
  const pinGrants = await prisma.rolePermission.findMany({ where: { permissionId: pin.id }, include: { role: true } });
  assert.deepEqual(pinGrants.map((g) => g.role.systemKey).sort(), ["MANAGER", "OPS_MANAGER", "OWNER"]);
  const removed = pinGrants.find((g) => g.role.systemKey === "MANAGER")!;
  await prisma.rolePermission.delete({ where: { id: removed.id } });
  prepare();
  assert.deepEqual(await snapshot(), before);
  assert.equal(await prisma.rolePermission.count({ where: { roleId: removed.roleId, permissionId: pin.id } }), 0);
  assert.equal(await prisma.auditEvent.count({ where: { action: "chat.moderation_defaults.install" } }), 1);
  console.log("Passed: actual guarded pre-deploy upgraded 23 → 24 migrations; original messages, replies, reactions, pins, custom grants/channel names, accounts, sessions, creator assignments, QA, strikes, shifts, paid breaks and a pending Clock correction remained unchanged. Moderation defaults installed once; repeat deploy preserved removed grants.");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
