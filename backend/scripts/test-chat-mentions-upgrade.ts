import "dotenv/config";
import { CHAT_EMOJI_SUPPORTED } from "../src/services/chat-emoji-library.js";
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { prisma } from "../src/lib/prisma.js";

async function snapshot() {
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations' ORDER BY tablename`;
  const result: Record<string, string> = {};
  for (const { tablename } of tables) {
    const name = '"' + tablename.replaceAll('"', '""') + '"';
    const rows = await prisma.$queryRawUnsafe<{ digest: string }[]>(`SELECT md5(coalesce(jsonb_agg(to_jsonb(t) ORDER BY to_jsonb(t)::text)::text, '[]')) AS digest FROM ${name} t`);
    result[tablename] = rows[0].digest;
  }
  return result;
}
async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55484"); assert.equal(url.pathname, "/block2_unread_mentions_upgrade_v3_20261120");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);
  const migrations = await prisma.$queryRaw<{ migration_name: string }[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(migrations.length, 36, "Prepare an isolated copy at migration 36 before running this upgrade rehearsal.");
  const user = await prisma.user.create({ data: { name: "Upgrade Example", email: `mention-upgrade-${Date.now()}@example.test`, status: "ACTIVE" } });
  const model = await prisma.agencyModel.create({ data: { name: "Mention upgrade example", chatArea: { create: {} } } });
  const channel = await prisma.chatChannel.create({ data: { modelId: model.id, key: "example", name: "Example", sortOrder: 0 } });
  const message = await prisma.chatMessage.create({ data: { channelId: channel.id, authorUserId: user.id, authorName: user.name, clientNonce: "upgrade-example", text: "Preserve this message" } });
  await prisma.chatReaction.create({ data: { userId: user.id, messageId: message.id, emoji: "👍" } });
  await prisma.chatMessageRead.create({ data: { userId: user.id, messageId: message.id } });
  try {
    const before = await snapshot();
    const require = createRequire(import.meta.url);
    const args = [require.resolve("prisma/build/index.js"), "migrate", "deploy", "--schema", fileURLToPath(new URL("../prisma/schema.prisma", import.meta.url))];
    execFileSync(process.execPath, args, { env: process.env, stdio: "pipe" });
    const after = await snapshot();
    for (const table of Object.keys(before)) assert.equal(after[table], before[table], table + " changed during migration");
    assert.equal(await prisma.chatEmoji.count(), CHAT_EMOJI_SUPPORTED.size);
    assert.equal(await prisma.chatMessageMention.count(), 0);
    console.log(`PASS: migrations 36 → 38 preserve every row in all ${Object.keys(before).length} existing tables, including the seeded message, reaction and read receipt.`);
    await prisma.chatReaction.create({ data: { userId: user.id, messageId: message.id, emoji: "👩🏿‍❤️‍💋‍👩🏽" } });
    await assert.rejects(() => prisma.chatReaction.create({ data: { userId: user.id, messageId: message.id, emoji: "invalid-string" } }));
    assert.equal(await prisma.chatReaction.count({ where: { messageId: message.id } }), 2);
    console.log("PASS: the upgraded database accepts a long joined emoji, retains the original reaction and still rejects arbitrary text.");
    const stable = await snapshot();
    execFileSync(process.execPath, args, { env: process.env, stdio: "pipe" });
    assert.deepEqual(await snapshot(), stable);
    console.log("PASS: deploying the migrations again leaves all data unchanged.");
  } finally {
    await prisma.chatMessage.delete({ where: { id: message.id } });
    await prisma.chatChannel.delete({ where: { id: channel.id } }); await prisma.chatArea.delete({ where: { modelId: model.id } });
    await prisma.agencyModel.delete({ where: { id: model.id } }); await prisma.user.delete({ where: { id: user.id } });
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
