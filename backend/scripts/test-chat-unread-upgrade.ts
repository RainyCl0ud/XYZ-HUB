import "dotenv/config";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { prisma } from "../src/lib/prisma.js";
import { installCreatorChatDefaults, installChatInteractionDefaults, installChatModerationDefaults, installChatQuarantineDefaults,
  provisionCreatorChat, listChatMessages, listChatUnread, sendChatMessage, markChatMessagesRead } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && url.port === "55484" && url.pathname === "/block2_unread_upgrade_rehearsal");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);
  const tables = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`;
  assert.equal(Number(tables[0].count), 0, "Use a fresh database; this test never resets one.");
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), ".."), root = resolve(backend, "..");
  mkdirSync(join(backend, ".local-data"), { recursive: true });
  const baseline = mkdtempSync(join(backend, ".local-data", "unread-upgrade-")); mkdirSync(join(baseline, "migrations"));
  copyFileSync(join(backend, "prisma", "schema.prisma"), join(baseline, "schema.prisma"));
  copyFileSync(join(backend, "prisma", "migrations", "migration_lock.toml"), join(baseline, "migrations", "migration_lock.toml"));
  const old = readdirSync(join(backend, "prisma", "migrations"), { withFileTypes: true }).filter((f) => f.isDirectory() && f.name < "20261030010000"); assert.equal(old.length, 25);
  for (const m of old) { mkdirSync(join(baseline, "migrations", m.name)); copyFileSync(join(backend, "prisma", "migrations", m.name, "migration.sql"), join(baseline, "migrations", m.name, "migration.sql")); }
  const cli = join(root, "node_modules", "prisma", "build", "index.js");
  const migrate = (schema: string) => execFileSync(process.execPath, [cli, "migrate", "deploy", "--schema", schema], { cwd: root, stdio: "inherit" });
  migrate(join(baseline, "schema.prisma"));
  execFileSync(process.execPath, ["--import", "tsx", join(backend, "prisma", "seed.ts")], { cwd: backend, stdio: "inherit" });
  const roles = new Map((await prisma.role.findMany()).map((r) => [r.systemKey, r]));
  const person = (key: string) => prisma.user.create({ data: { name: `Upgrade ${key}`, email: `upgrade-${key}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(key)!.id } } } });
  const owner = await person("OWNER"), staff = await person("CHATTER");
  const model = await prisma.agencyModel.create({ data: { name: "Unread upgrade creator" } });
  await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: model.id } });
  await prisma.$transaction(async (tx) => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx); await installChatModerationDefaults(tx); await installChatQuarantineDefaults(tx); await provisionCreatorChat(tx, model.id); await syncUserStandingChats(tx, staff.id); });
  const channel = await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: model.id, key: "general" } } });
  const oldMessage = await prisma.chatMessage.create({ data: { channelId: channel.id, authorUserId: owner.id, authorName: owner.name, clientNonce: randomUUID(), text: "Keep historical text", version: 2, pinnedAt: new Date(), pinnedById: owner.id, pinnedByName: owner.name, pinVersion: 1 } });
  await prisma.chatMessage.create({ data: { channelId: channel.id, authorUserId: staff.id, authorName: staff.name, clientNonce: randomUUID(), text: "Keep reply", replyToId: oldMessage.id } });
  await prisma.chatReaction.create({ data: { messageId: oldMessage.id, userId: staff.id, emoji: "👍" } });
  await prisma.clockShift.create({ data: { userId: staff.id, personName: staff.name, startedAt: new Date("2026-10-26T10:00:00Z"), endedAt: new Date("2026-10-26T12:00:00Z"), startDay: "2026-10-26", startWeek: "2026-10-26", startRequestId: randomUUID() } });
  const snapshot = async () => JSON.stringify(await Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" } }), prisma.userModelAssignment.findMany({ orderBy: { id: "asc" } }),
    prisma.chatMessage.findMany({ orderBy: { id: "asc" } }), prisma.chatReaction.findMany(), prisma.chatRoleGrant.findMany(),
    prisma.chatStandingConversation.findMany(), prisma.clockShift.findMany(), prisma.incident.findMany(), prisma.strike.findMany(),
  ]));
  const before = await snapshot();
  console.log("PASS 25-migration baseline contains existing identities, grants, private chats, edited/pinned messages, reply, reaction and hours");
  migrate(join(backend, "prisma", "schema.prisma"));
  assert.equal(await snapshot(), before);
  assert.equal(await prisma.chatMessageRead.count(), 0);
  assert.ok(Math.abs((await prisma.chatSetup.findUniqueOrThrow({ where: { id: "chat-unread-v1" } })).createdAt.getTime() - Date.now()) < 60000, "UTC cutoff must not inherit the database server timezone");
  assert.equal((await listChatUnread(staff.id)).totalUnread, 0);
  assert.equal((await listChatMessages(staff.id, channel.id)).messages[0].text, "Keep historical text");
  console.log("PASS additive 25-to-26 upgrade preserves every snapshotted record and excludes pre-rollout history from unread counts");
  const fresh = await sendChatMessage(owner.id, channel.id, "New after upgrade", randomUUID());
  assert.equal((await listChatUnread(staff.id)).totalUnread, 1);
  await markChatMessagesRead(staff.id, channel.id, { messageIds: [fresh.id] });
  assert.equal((await listChatUnread(staff.id)).totalUnread, 0);
  migrate(join(backend, "prisma", "schema.prisma"));
  assert.equal(await prisma.chatMessageRead.count(), 1);
  console.log("PASS upgraded conversation tracks new messages; repeated migration preserves saved read state");
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
