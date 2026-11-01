import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { prisma } from '../src/lib/prisma.js';
async function main() {
  const db=new URL(process.env.DATABASE_URL??'');assert.equal(db.hostname,'127.0.0.1');assert.equal(db.port,'55484');assert.equal(db.pathname,'/block2_announcement_upgrade_20261101');assert.equal(process.env.NODE_ENV,'test');assert.ok(!process.env.RAILWAY_PROJECT_ID&&!process.env.RAILWAY_ENVIRONMENT_ID);
  const migrations=await prisma.$queryRaw<{migration_name:string}[]>`SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL ORDER BY started_at`;
  assert.equal(migrations.length,26,'Start from a disposable clone of the previous 26-migration fictional database.');
  const tables=await prisma.$queryRaw<{table_name:string}[]>`SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE' AND table_name<>'_prisma_migrations' ORDER BY table_name`;
  const columns=new Map<string,string[]>();
  for(const {table_name} of tables){const names=await prisma.$queryRaw<{column_name:string}[]>`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name=${table_name} ORDER BY ordinal_position`;columns.set(table_name,names.map(c=>c.column_name));}
  const quote=(value:string)=>'"'+value.replaceAll('"','""')+'"';
  const snapshot=async()=>{
    const digest:Record<string,string>={};
    for(const [table,names] of columns){const rows=await prisma.$queryRawUnsafe<unknown[]>(`SELECT row_to_json(t) AS row FROM (SELECT ${names.map(quote).join(',')} FROM ${quote(table)}) t ORDER BY row_to_json(t)::text`);digest[table]=createHash('sha256').update(JSON.stringify(rows)).digest('hex');}
    return digest;
  };
  const before=await snapshot(),cli=fileURLToPath(new URL('../../node_modules/prisma/build/index.js',import.meta.url)),schema=fileURLToPath(new URL('../prisma/schema.prisma',import.meta.url));
  const migrate=()=>execFileSync(process.execPath,[cli,'migrate','deploy','--schema',schema],{env:process.env,stdio:'pipe'});
  migrate();assert.deepEqual(await snapshot(),before);
  console.log(`PASS upgrade: all existing columns/rows in ${tables.length} application tables unchanged, including users, assignments, permissions, messages, unread receipts, private chats, Clock, incidents and strikes.`);
  assert.equal(await prisma.chatAnnouncement.count(),0);assert.equal(await prisma.chatAnnouncementDelivery.count(),0);assert.equal(await prisma.mailerCapacityReservation.count(),0);
  const created=await prisma.chatAnnouncement.create({data:{requestId:randomUUID(),inputHash:'upgrade-fixture',authorName:'Fictional upgrade owner',title:'Upgrade retained',text:'No email is sent by this upgrade test.'}});
  migrate();assert.ok(await prisma.chatAnnouncement.findUnique({where:{id:created.id}}));assert.deepEqual(await snapshot(),before);
  await prisma.chatAnnouncement.delete({where:{id:created.id}});
  console.log('PASS repeat: new announcement records survive repeated migration; existing records and read state remain unchanged.');
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
