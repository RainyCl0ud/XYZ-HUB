import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(db.hostname, '127.0.0.1'); assert.equal(db.port, '55484'); assert.equal(db.pathname, '/block2_unread_reminder_upgrade_20261105');
  assert.equal(process.env.NODE_ENV, 'test'); assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);
  const [{ count }] = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM "_prisma_migrations" WHERE finished_at IS NOT NULL`;
  assert.equal(Number(count), 27, 'Use a disposable clone of the 27-migration local test database.');
  const columns = await prisma.$queryRaw<{ table_name: string; column_name: string }[]>`SELECT c.table_name, c.column_name FROM information_schema.columns c JOIN information_schema.tables t ON t.table_schema=c.table_schema AND t.table_name=c.table_name WHERE c.table_schema='public' AND t.table_type='BASE TABLE' AND c.table_name<>'_prisma_migrations' ORDER BY c.table_name,c.ordinal_position`;
  const tables = new Map<string, string[]>();
  for (const c of columns) tables.set(c.table_name, [...(tables.get(c.table_name) ?? []), c.column_name]);
  const quote = (value: string) => '"' + value.replaceAll('"', '""') + '"';
  const snapshot = async () => {
    const digest: Record<string, string> = {};
    for (const [table, names] of tables) {
      const rows = await prisma.$queryRawUnsafe(`SELECT row_to_json(t) AS row FROM (SELECT ${names.map(quote).join(',')} FROM ${quote(table)}) t ORDER BY row_to_json(t)::text`);
      digest[table] = createHash('sha256').update(JSON.stringify(rows)).digest('hex');
    }
    return digest;
  };
  const before = await snapshot();
  const migrate = () => execFileSync(process.execPath, [fileURLToPath(new URL('../../node_modules/prisma/build/index.js', import.meta.url)), 'migrate', 'deploy', '--schema', fileURLToPath(new URL('../prisma/schema.prisma', import.meta.url))], { env: process.env, stdio: 'pipe' });
  migrate(); assert.deepEqual(await snapshot(), before);
  console.log(`PASS upgrade: all existing columns and rows in ${tables.size} application tables retained; no messages, reads, announcements, roles, assignments, Clock or Strike records changed.`);
  const key = randomUUID();
  await prisma.chatUnreadReminderState.create({ data: { userKey: key, lastAttemptAt: new Date() } });
  const reminder = await prisma.chatUnreadReminder.create({ data: { userKey: key, status: 'CAPTURED', unreadCount: 10 } });
  migrate(); assert.deepEqual(await snapshot(), before);
  assert.ok(await prisma.chatUnreadReminderState.findUnique({ where: { userKey: key } }));
  assert.ok(await prisma.chatUnreadReminder.findUnique({ where: { id: reminder.id } }));
  await prisma.chatUnreadReminder.delete({ where: { id: reminder.id } }); await prisma.chatUnreadReminderState.delete({ where: { userKey: key } });
  console.log('PASS repeat: reminder history and durable person throttle survive repeated migration. No email sent.');
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
