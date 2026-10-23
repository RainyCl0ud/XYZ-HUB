import "dotenv/config";
import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { installCreatorChatDefaults, provisionCreatorChat } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { prisma } from "../src/lib/prisma.js";
import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "../src/services/chat-staging-target.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) && url.pathname.endsWith("_upgrade_rehearsal"), "Upgrade rehearsal requires a fresh, named local database ending in _upgrade_rehearsal.");
  const count = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public'`;
  assert.equal(Number(count[0].count), 0, "Use an empty disposable database; this test never clears existing data.");
  const backend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
  const root = resolve(backend, "..");
  const npmCli = process.env.npm_execpath;
  assert.ok(npmCli, "Run this rehearsal through npm run test:clock-upgrade --workspace=backend.");
  const localData = join(backend, ".local-data"); mkdirSync(localData, { recursive: true });
  const baseline = mkdtempSync(join(localData, "upgrade-baseline-"));
  mkdirSync(join(baseline, "migrations"));
  copyFileSync(join(backend, "prisma", "schema.prisma"), join(baseline, "schema.prisma"));
  copyFileSync(join(backend, "prisma", "migrations", "migration_lock.toml"), join(baseline, "migrations", "migration_lock.toml"));
  const migrations = readdirSync(join(backend, "prisma", "migrations"), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name < "20261023080000");
  assert.equal(migrations.length, 19);
  for (const migration of migrations) {
    mkdirSync(join(baseline, "migrations", migration.name));
    copyFileSync(join(backend, "prisma", "migrations", migration.name, "migration.sql"), join(baseline, "migrations", migration.name, "migration.sql"));
  }
  // migrate deploy applies migration files, not a schema diff. First apply only
  // the nineteen migrations already on the staging branch before this release.
  execFileSync(process.execPath, [join(root, "node_modules", "prisma", "build", "index.js"), "migrate", "deploy", "--schema", join(baseline, "schema.prisma")], { cwd: root, stdio: "inherit" });
  const clockAbsent = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) AS count FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'ClockShift'`;
  assert.equal(Number(clockAbsent[0].count), 0);
  execFileSync(process.execPath, [npmCli, "run", "seed", "--workspace=backend"], { cwd: root, stdio: "inherit" });
  const [creatorRole, chatterRole] = await Promise.all(["MODEL", "CHATTER"].map((systemKey) => prisma.role.findUniqueOrThrow({ where: { systemKey } })));
  const creator = await prisma.user.create({ data: { name: "Upgrade creator", email: "upgrade-creator@example.test", status: "ACTIVE", roleMemberships: { create: { roleId: creatorRole.id } } } });
  const staff = await prisma.user.create({ data: { name: "Upgrade staff", email: "upgrade-staff@example.test", status: "ACTIVE", roleMemberships: { create: { roleId: chatterRole.id } } } });
  const model = await prisma.agencyModel.create({ data: { name: "Upgrade legacy creator", creatorUserId: creator.id, isActive: false } });
  await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: model.id } });
  const chatter = await prisma.chatter.create({ data: { name: staff.name, userId: staff.id } });
  const rule = await prisma.rule.create({ data: { versions: { create: { versionNumber: 1, title: "Upgrade QA rule", definition: "Preserve the original rule" } } }, include: { versions: true } });
  const incident = await prisma.incident.create({ data: { chatterId: chatter.id, ruleVersionId: rule.versions[0].id, modelId: model.id, ruleTitleSnapshot: "Historical title", ruleDefinitionSnapshot: "Historical definition", details: "Preserve incident details", status: "RESOLVED", resolutionNotes: "Preserve coaching notes", resolvedAt: new Date() } });
  const reason = await prisma.strikeReason.create({ data: { name: "Upgrade strike reason" } });
  const ladder = await prisma.strikeLadderVersion.create({ data: { versionNumber: 1, isCurrent: true, durationDays: 30, steps: { create: { minActiveStrikes: 0, standingLabel: "Good standing", deductionPercent: 0 } } } });
  await prisma.strike.create({ data: { userId: staff.id, userNameSnapshot: staff.name, userEmailSnapshot: staff.email, issuedByNameSnapshot: "Upgrade owner", reasonId: reason.id, reasonNameSnapshot: reason.name, details: "Preserve strike details", expiresAt: new Date("2026-12-01T00:00:00Z"), ladderVersionId: ladder.id, activeStrikeCountAfterIssue: 1, standingLabelSnapshot: "Warning", deductionPercentSnapshot: 0, sourceIncidentId: incident.id } });
  await prisma.session.create({ data: { userId: staff.id, tokenHash: `isolated-upgrade-${randomUUID()}`, expiresAt: new Date("2026-12-01T00:00:00Z") } });
  await prisma.$transaction(async (tx) => {
    await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx);
    await provisionCreatorChat(tx, model.id); await syncUserStandingChats(tx, staff.id);
  });
  const channel = await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: model.id, key: "general" } } });
  // The legacy creator is inactive. Retain a pre-existing message directly in
  // the rehearsal fixture; no live account/channel is involved.
  await prisma.chatMessage.create({ data: { channelId: channel.id, authorUserId: staff.id, authorName: staff.name, text: "Existing chat must survive Clock rollout", clientNonce: randomUUID() } });
  const audit = await prisma.auditEvent.create({ data: { action: "upgrade.legacy.record", success: true, statusCode: 200, actorUserId: staff.id, actorLabel: staff.name, metadata: { text: "Preserve original audit" } } });
  const snapshot = () => Promise.all([
    prisma.user.findMany({ orderBy: { id: "asc" } }), prisma.userRole.findMany({ orderBy: { id: "asc" } }), prisma.userModelAssignment.findMany({ orderBy: { id: "asc" } }),
    prisma.agencyModel.findMany({ orderBy: { id: "asc" } }), prisma.chatter.findMany({ orderBy: { id: "asc" } }), prisma.rule.findMany({ orderBy: { id: "asc" } }), prisma.ruleVersion.findMany({ orderBy: { id: "asc" } }),
    prisma.incident.findMany({ orderBy: { id: "asc" } }), prisma.strike.findMany({ orderBy: { id: "asc" } }), prisma.strikeReason.findMany({ orderBy: { id: "asc" } }), prisma.strikeLadderVersion.findMany({ orderBy: { id: "asc" } }), prisma.strikeLadderStep.findMany({ orderBy: { id: "asc" } }),
    prisma.chatArea.findMany({ orderBy: { modelId: "asc" } }), prisma.chatChannel.findMany({ orderBy: { id: "asc" } }),
    prisma.chatStandingConversation.findMany({ orderBy: { id: "asc" } }), prisma.chatMessage.findMany({ orderBy: { id: "asc" } }),
    prisma.chatRoleGrant.findMany({ orderBy: [{ channelId: "asc" }, { roleId: "asc" }] }), prisma.chatPersonGrant.findMany({ orderBy: [{ channelId: "asc" }, { assignmentId: "asc" }] }),
    prisma.session.findMany({ orderBy: { id: "asc" } }), prisma.auditEvent.findUniqueOrThrow({ where: { id: audit.id } }),
  ]);
  const before = await snapshot();
  execFileSync(process.execPath, [npmCli, "run", "chat:prepare-staging", "--workspace=backend"], {
    cwd: root, stdio: "inherit", env: { ...process.env, RAILWAY_PROJECT_ID: CHAT_STAGING_PROJECT_ID, RAILWAY_ENVIRONMENT_ID: CHAT_STAGING_ENVIRONMENT_ID, RAILWAY_ENVIRONMENT_NAME: "Staging", BLOCK2_CHAT_ENABLED: "true", BLOCK2_CLOCK_ENABLED: "true" },
  });
  assert.deepEqual(await snapshot(), before);
  assert.equal(await prisma.chatChannel.count({ where: { modelId: model.id } }), 13);
  assert.equal(await prisma.chatStandingConversation.count({ where: { modelId: model.id, archivedAt: null } }), 2);
  assert.ok(await prisma.clockSetup.findUnique({ where: { id: "clock-core-v1" } }));
  assert.equal(await prisma.clockShift.count(), 0);
  console.log("Passed: the actual guarded staging pre-deploy command upgraded the previous 19-migration schema; original accounts, sessions, creator links, assignments, QA/coaching, strikes, ladder, Chat records/messages/grants and audit record values are unchanged.");
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
