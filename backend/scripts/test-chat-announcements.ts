import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/lib/prisma.js';
import { ChatError, installCreatorChatDefaults, installChatQuarantineDefaults, installChatInteractionDefaults, installChatModerationDefaults, provisionCreatorChat, setChatQuarantine, listChatMessages, sendChatMessage, editChatMessage, deleteChatMessage, setChatPin, getChatMessage, refreshChatMessages, searchChatMessages, listRetainedChatChannels } from '../src/services/creator-chat.js';
import { installStandingChatDefaults, syncUserStandingChats } from '../src/services/standing-chat.js';
import { announcementCapability, previewAnnouncement, publishAnnouncement, announcementDetails, installChatAnnouncementDefaults, buildAnnouncementEmail } from '../src/services/chat-announcements.js';
import { announcementEmailMode, announcementsEnabled } from '../src/services/chat-announcement-policy.js';
import { runAnnouncementSweep } from '../src/services/chat-announcement-worker.js';
import { reserveMailerCapacity, MailerCapacityUnavailable } from '../src/services/mailer-capacity.js';
import { notificationUnreadScope } from '../src/services/chat-notification-scope.js';
import { markChatMessagesRead } from '../src/services/creator-chat.js';
import { loadSession } from '../src/middleware/session-auth.js';
import { createSession } from '../src/services/session.js';
import chat from '../src/routes/chat.js';

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(db.hostname, '127.0.0.1'); assert.ok((db.port === '55484' && db.pathname === '/block2_announcement_20261101_v2') || (db.port === '55494' && db.pathname === '/block2_ux_20261119'));
  assert.equal(process.env.NODE_ENV, 'test'); assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);
  process.env.BLOCK2_CHAT_ENABLED = 'true'; process.env.BLOCK2_ANNOUNCEMENTS_ENABLED = 'true'; process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = 'capture'; process.env.FRONTEND_URL = 'http://localhost:4133';
  const originalFetch = globalThis.fetch; let externalCalls = 0;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!['localhost','127.0.0.1'].includes(url.hostname)) { externalCalls++; throw Error('External providers are forbidden in fictional tests'); }
    return originalFetch(input, init);
  }) as typeof fetch;
  let checks = 0; const pass = (name: string) => console.log(`PASS ${++checks}: ${name}`);
  const deny = (fn: () => Promise<unknown>, status = 403) => assert.rejects(fn, (e: unknown) => e instanceof ChatError && e.status === status);
  const roles = new Map((await prisma.role.findMany()).map(r => [r.systemKey, r.id]));
  await prisma.$transaction(async tx => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx); await installChatModerationDefaults(tx); await installChatQuarantineDefaults(tx); await installChatAnnouncementDefaults(tx); });
  const prefix = `announce-${Date.now()}`, userIds: string[] = [], modelIds: string[] = [];
  const person = async (name: string, key: string) => { const u = await prisma.user.create({ data: { name: `${prefix} ${name}`, email: `${prefix}-${name}@example.test`, status: 'ACTIVE', roleMemberships: { create: { roleId: roles.get(key)! } } } }); userIds.push(u.id); return u; };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use('/api/chat',chat); const server = app.listen(0,'127.0.0.1'); await once(server,'listening');
  try {
    const owner = await person('owner','OWNER'), ops = await person('ops','OPS_MANAGER'), staff = await person('staff','CHATTER'), accountant = await person('accountant','ACCOUNTANT'), general = await person('general','GENERAL_STAFF');
    const manager = await person('manager','MANAGER'), dev = await person('dev','DEV'), creator = await person('creator','MODEL'), inactive = await person('inactive','CHATTER'), pending = await person('pending','CHATTER');
    await prisma.userRole.create({ data:{userId:creator.id,roleId:roles.get('OWNER')!} });
    await prisma.user.update({ where: { id: inactive.id }, data: { status: 'DEACTIVATED' } }); await prisma.user.update({ where: { id: pending.id }, data: { status: 'PENDING_SETUP' } });
    for (const name of ['One','Two']) { const m = await prisma.agencyModel.create({ data: { name: `${prefix}-${name}` } }); modelIds.push(m.id); await prisma.$transaction(tx => provisionCreatorChat(tx,m.id)); }
    const [one,two] = modelIds;
    for (const id of [staff.id, manager.id]) await prisma.userModelAssignment.create({ data: { userId: id, modelId: one } });
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: two } });
    for (const id of [accountant.id,general.id]) for (const modelId of modelIds) await prisma.userModelAssignment.create({data:{userId:id,modelId}});
    for (const id of userIds) await prisma.$transaction(tx => syncUserStandingChats(tx,id));
    const updates = await prisma.chatChannel.findMany({ where: { key: 'updates', modelId: { in: modelIds } } });
    const updateOne = updates.find(c => c.modelId === one)!, updateTwo = updates.find(c => c.modelId === two)!;
    const assignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: staff.id, modelId: one } } });
    await setChatQuarantine(owner.id,one,staff.id,{ active:true,version:0,assignmentId:assignment.id,reason:'Fictional announcement pause',requestId:randomUUID() });
    const staffPrivate = await prisma.chatStandingConversation.findFirstOrThrow({ where:{ subjectUserId:staff.id,assignmentId:assignment.id,archivedAt:null } });
    const gsPrivate = await prisma.chatStandingConversation.findFirstOrThrow({ where:{ subjectUserId:general.id,kind:'GENERAL_STAFF',archivedAt:null } });
    const accountPrivate = await prisma.chatStandingConversation.findFirstOrThrow({ where:{ subjectUserId:accountant.id,kind:'ACCOUNTANT',archivedAt:null } });
    const base = { users: await prisma.user.count(), assignments: await prisma.userModelAssignment.count(), grants: await prisma.chatRoleGrant.count(), peopleGrants: await prisma.chatPersonGrant.count(), incidents: await prisma.incident.count(), strikes: await prisma.strike.count() };
    const input = { title:'Fictional team update',text:'Full announcement line one.\n\nSecond line <script>not executable</script> & complete ending.' };
    assert.equal(announcementsEnabled(),true); assert.equal(announcementEmailMode(),'capture');
    assert.equal(announcementsEnabled({ ...process.env, RAILWAY_ENVIRONMENT_NAME:'Production' }),false);
    assert.equal(announcementsEnabled({ ...process.env, RAILWAY_PROJECT_ID:'other',RAILWAY_ENVIRONMENT_ID:'other' }),false);
    assert.equal(announcementsEnabled({ ...process.env, BLOCK2_ANNOUNCEMENTS_ENABLED:'false' }),false);
    await deny(()=>previewAnnouncement(staff.id,input)); await deny(()=>previewAnnouncement(manager.id,input)); await deny(()=>previewAnnouncement(dev.id,input)); await deny(()=>previewAnnouncement(creator.id,input));
    assert.equal((await announcementCapability(ops.id)).canAnnounce,true);
    pass('Feature and environment gates; only current authorized Owner/Ops can announce');

    const beforePreview = await prisma.chatMessage.count(); const preview = await previewAnnouncement(owner.id,input);
    assert.equal(preview.staffCount,7); assert.equal(preview.creatorCount,2); assert.equal(preview.privateCopyCount,3); assert.deepEqual(preview.blockers,[]); assert.equal(await prisma.chatMessage.count(),beforePreview);
    assert.ok(!preview.recipients.some(r=>r.name===creator.name||r.name===inactive.name||r.name===pending.name));
    pass('Read-only audience preview excludes creators/deactivated/pending staff and deduplicates multi-creator staff');

    const orphan = await person('orphan','CHATTER'); const changed = await previewAnnouncement(owner.id,input); assert.ok(changed.blockers.some(b=>b.name===orphan.name));
    const countBefore = await prisma.chatAnnouncement.count(); await deny(()=>publishAnnouncement(owner.id,{...input,requestId:randomUUID(),previewToken:changed.previewToken}),409); assert.equal(await prisma.chatAnnouncement.count(),countBefore);
    await deny(()=>publishAnnouncement(owner.id,{...input,requestId:randomUUID(),previewToken:preview.previewToken}),409);
    await prisma.user.update({ where:{id:orphan.id},data:{status:'DEACTIVATED'} });
    pass('Missing protected-chat setup blocks publication; stale audience tokens require a fresh review');

    const fresh = await previewAnnouncement(owner.id,input), requestId=randomUUID();
    const result = await Promise.all([publishAnnouncement(owner.id,{...input,requestId,previewToken:fresh.previewToken}),publishAnnouncement(owner.id,{...input,requestId,previewToken:fresh.previewToken})]);
    assert.equal(result[0].id,result[1].id); const id=result[0].id;
    assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:id}}),7);
    assert.equal(await prisma.chatAnnouncementPost.count({where:{announcementId:id}}),5);
    const posts = await prisma.chatAnnouncementPost.findMany({where:{announcementId:id}});
    for(const target of [updateOne.id,updateTwo.id,staffPrivate.id,gsPrivate.id,accountPrivate.id])assert.ok(posts.some(p=>p.targetId===target));
    const announcementMessage=posts.find(p=>p.targetId===updateOne.id)!.messageId;
    await deny(()=>editChatMessage(owner.id,updateOne.id,announcementMessage,'Changed after posting',1));
    await deny(()=>deleteChatMessage(owner.id,updateOne.id,announcementMessage,1,'Fictional deletion'));
    await deny(()=>setChatPin(owner.id,updateOne.id,announcementMessage,true,0));
    await assert.rejects(()=>prisma.chatMessage.update({where:{id:announcementMessage},data:{text:'Bypass attempt'}}));
    const own = await listChatMessages(staff.id,staffPrivate.id); assert.ok(own.messages.some(m=>m.text.includes(input.text)&&m.systemNotice)); await deny(()=>listChatMessages(staff.id,updateOne.id),404); await deny(()=>listChatMessages(ops.id,gsPrivate.id),404); await deny(()=>listChatMessages(accountant.id,updateOne.id),404);
    assert.deepEqual({users:await prisma.user.count()-1,assignments:await prisma.userModelAssignment.count(),grants:await prisma.chatRoleGrant.count(),peopleGrants:await prisma.chatPersonGrant.count(),incidents:await prisma.incident.count(),strikes:await prisma.strike.count()},base);
    pass('Concurrent/retried publication is atomic; correct protected copies appear without widening access or changing existing records');

    const targetedInput = { ...input, title: 'Selected staff only', recipientIds: [manager.id, accountant.id, general.id] };
    const targetedPreview = await previewAnnouncement(owner.id, targetedInput);
    assert.equal(targetedPreview.staffCount, 3);
    assert.ok(targetedPreview.availableRecipients.some(r => r.id === dev.id));
    assert.ok(!targetedPreview.recipients.some(r => r.id === dev.id));
    const targetedRequestId = randomUUID();
    const targeted = await publishAnnouncement(owner.id, { ...targetedInput, requestId: targetedRequestId, previewToken: targetedPreview.previewToken });
    const targetedPosts = await prisma.chatAnnouncementPost.findMany({ where: { announcementId: targeted.id } });
    assert.equal(await prisma.chatAnnouncementDelivery.count({ where: { announcementId: targeted.id } }), 3);
    assert.ok(targetedPosts.some(p => p.targetId === accountPrivate.id));
    assert.ok(targetedPosts.some(p => p.targetId === gsPrivate.id));
    assert.ok(!targetedPosts.some(p => p.targetId === updateTwo.id));
    const selectedPost = targetedPosts.find(p => p.targetId === updateOne.id)!;
    assert.ok((await listChatMessages(manager.id, updateOne.id)).messages.some(m => m.id === selectedPost.messageId));
    assert.ok(!(await listChatMessages(dev.id, updateOne.id)).messages.some(m => m.id === selectedPost.messageId));
    await deny(() => getChatMessage(dev.id, updateOne.id, selectedPost.messageId), 404);
    await deny(() => markChatMessagesRead(dev.id, updateOne.id, { messageIds: [selectedPost.messageId] }), 404);
    await deny(() => markChatMessagesRead(dev.id, updateOne.id, { throughMessageId: selectedPost.messageId }), 404);
    assert.deepEqual((await refreshChatMessages(dev.id, updateOne.id, [selectedPost.messageId])).messages, []);
    assert.ok(!(await searchChatMessages(dev.id, 'Selected staff only', updateOne.id)).results.some(r => r.message.id === selectedPost.messageId));
    const excludedUnread = await prisma.$transaction(async tx => {
      const scope = await notificationUnreadScope(tx, dev.id);
      return tx.chatMessage.count({ where: { AND: [scope.where, { id: selectedPost.messageId }] } });
    });
    assert.equal(excludedUnread, 0);
    await deny(() => publishAnnouncement(owner.id, { ...targetedInput, recipientIds: [dev.id], requestId: targetedRequestId, previewToken: targetedPreview.previewToken }), 409);
    await deny(() => previewAnnouncement(owner.id, { ...input, recipientIds: [inactive.id] }), 409);
    const added = await previewAnnouncement(owner.id, { ...targetedInput, recipientIds: [...targetedInput.recipientIds, dev.id] });
    assert.equal(added.staffCount, 4);
    assert.notEqual(added.previewToken, targetedPreview.previewToken);
    await deny(() => publishAnnouncement(owner.id, { ...targetedInput, recipientIds: [...targetedInput.recipientIds, dev.id], requestId: randomUUID(), previewToken: targetedPreview.previewToken }), 409);
    const privateOnly = await previewAnnouncement(owner.id, { ...input, recipientIds: [accountant.id, general.id] });
    assert.equal(privateOnly.creatorCount, 0); assert.equal(privateOnly.privateCopyCount, 2); assert.deepEqual(privateOnly.blockers, []);
    pass('Recipient choices constrain shared-channel reads, direct URLs, refresh, search, unread alerts, private copies and individual email deliveries; selection changes invalidate publication tokens');

    const retained = await prisma.chatChannel.create({ data: { modelId: one, key: `retained-${prefix}`, name: 'Retained test channel', sortOrder: 99, archivedAt: new Date(), cleanedUpAt: new Date() } });
    assert.ok((await listRetainedChatChannels(owner.id)).channels.some(c => c.id === retained.id));
    await deny(() => listRetainedChatChannels(dev.id));
    await deny(() => listRetainedChatChannels(manager.id));
    pass('Cleaned-up channel directory is available to Owners independently of the bounded Audit event list and rejects other roles');

    await Promise.all([runAnnouncementSweep(),runAnnouncementSweep()]);
    const captured = await announcementDetails(owner.id,id); assert.ok(captured.deliveries.every(d=>d.status==='CAPTURED'));
    const addresses = new Set<string>(); for(const delivery of captured.deliveries){ const email=delivery.previewEmail as {to:string;subject:string;text:string;html:string}; addresses.add(email.to);assert.ok(email.text.includes(input.text)); assert.ok(email.html.includes('&lt;script&gt;not executable&lt;/script&gt;')); assert.ok(!email.html.includes('<script>'));assert.ok(email.text.includes('/chat?conversation='));assert.equal('cc' in email,false);assert.equal('bcc' in email,false); }
    assert.equal(addresses.size,7); assert.equal(externalCalls,0); await runAnnouncementSweep(); assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:id,status:'CAPTURED'}}),7);
    pass('Full-content individual email previews retain line breaks, escape HTML, include permitted Hub links and never call a provider');

    const next = async (title:string) => {const p=await previewAnnouncement(owner.id,{...input,title});assert.deepEqual(p.blockers,[]);return publishAnnouncement(owner.id,{...input,title,previewToken:p.previewToken,requestId:randomUUID()});};
    const revoked = await next('Before recipient access changes');
    await prisma.user.update({where:{id:accountant.id},data:{status:'DEACTIVATED'}});
    await prisma.userModelAssignment.deleteMany({where:{userId:staff.id}}); await prisma.$transaction(tx=>syncUserStandingChats(tx,staff.id));
    await runAnnouncementSweep(); for(const uid of [staff.id,accountant.id])assert.equal((await prisma.chatAnnouncementDelivery.findUniqueOrThrow({where:{announcementId_userKey:{announcementId:revoked.id,userKey:uid}}})).status,'SKIPPED');
    assert.ok((await prisma.chatStandingConversation.findUniqueOrThrow({where:{id:staffPrivate.id}})).archivedAt);
    await prisma.user.update({where:{id:staff.id},data:{status:'DEACTIVATED'}});
    pass('Deactivation/lost assignments before delivery skip stale emails; old private episodes remain archived');

    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='gmail'; const remaining=await prisma.user.findMany({where:{id:{in:userIds},status:'ACTIVE'}});process.env.CHAT_ANNOUNCEMENT_TEST_RECIPIENTS=remaining.map(u=>u.email).join(',');
    const concurrent=await next('Worker concurrency test'); const calls=new Map<string,number>();
    const transport=async(email:{to:string})=>{calls.set(email.to,(calls.get(email.to)??0)+1);if(email.to===general.email)throw Error('Simulated uncertain provider result');};
    await Promise.all([runAnnouncementSweep(transport),runAnnouncementSweep(transport)]); await runAnnouncementSweep(transport);
    assert.ok([...calls.values()].every(n=>n===1));assert.equal((await prisma.chatAnnouncementDelivery.findUniqueOrThrow({where:{announcementId_userKey:{announcementId:concurrent.id,userKey:general.id}}})).status,'REVIEW');
    pass('Concurrent workers deliver at most one attempt per recipient; uncertain results are held for review, never blindly retried');

    const crashed=await next('Crash recovery test');await prisma.chatAnnouncementDelivery.updateMany({where:{announcementId:crashed.id},data:{status:'SENDING',attemptId:randomUUID(),attemptedAt:new Date(Date.now()-700000)}});const oldCalls=calls.size;await runAnnouncementSweep(transport);assert.equal(calls.size,oldCalls);assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:crashed.id,status:'REVIEW'}}),5);
    pass('Restart recovery holds abandoned in-flight sends for review instead of duplicating emails');

    const held=await next('Delivery disabled test');process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='off';await runAnnouncementSweep(transport);assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:held.id,status:'PENDING'}}),5);
    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='gmail';process.env.CHAT_ANNOUNCEMENT_TEST_RECIPIENTS='nobody@example.test';await runAnnouncementSweep(transport);assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:held.id,status:'SKIPPED'}}),5);
    pass('Delivery stays off by default; staging Gmail is restricted to the explicit test-recipient list');

    process.env.GOOGLE_WORKSPACE_USER='fictional-sender@example.test'; process.env.CHAT_EMAIL_HOURLY_CAP='5';process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE='2';process.env.CHAT_EMAIL_DAILY_CAP='10';process.env.CHAT_EMAIL_AUTH_DAILY_RESERVE='4';
    const reservations=await Promise.allSettled(Array.from({length:8},()=>reserveMailerCapacity('CHAT_ANNOUNCEMENT')));assert.equal(reservations.filter(r=>r.status==='fulfilled').length,3);
    await reserveMailerCapacity('AUTH');await reserveMailerCapacity('AUTH');await assert.rejects(()=>reserveMailerCapacity('AUTH'),MailerCapacityUnavailable);
    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='capture';const ledger=await prisma.mailerCapacityReservation.count();await reserveMailerCapacity('AUTH');assert.equal(await prisma.mailerCapacityReservation.count(),ledger);
    pass('Concurrent shared sender reservations leave authentication capacity; off/capture leave auth delivery unchanged');

    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='gmail';process.env.CHAT_ANNOUNCEMENT_TEST_RECIPIENTS=remaining.map(u=>u.email).join(',');
    const budgetHeld=await next('Capacity blocked before provider');await runAnnouncementSweep();assert.equal(await prisma.chatAnnouncementDelivery.count({where:{announcementId:budgetHeld.id,status:'PENDING'}}),5);assert.equal(externalCalls,0);
    const now=new Date();await prisma.mailerCapacityReservation.updateMany({data:{createdAt:new Date(now.getTime()-7200000)}});
    const daily=await Promise.allSettled([reserveMailerCapacity('CHAT_ANNOUNCEMENT'),reserveMailerCapacity('CHAT_ANNOUNCEMENT')]);assert.equal(daily.filter(r=>r.status==='fulfilled').length,1);
    pass('Capacity deferral happens before provider calls; daily and hourly windows both preserve the configured auth reserve');

    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE='capture';
    const sendPermission=await prisma.permission.findUniqueOrThrow({where:{key:'chat.messages.send'}});
    const previousGrant=await prisma.rolePermission.findUniqueOrThrow({where:{roleId_permissionId:{roleId:roles.get('OPS_MANAGER')!,permissionId:sendPermission.id}}});
    await prisma.rolePermission.delete({where:{id:previousGrant.id}});
    try {await deny(()=>sendChatMessage(ops.id,updateOne.id,'Normal posting denied',randomUUID()));const opsPreview=await previewAnnouncement(ops.id,input);assert.deepEqual(opsPreview.blockers,[]);await publishAnnouncement(ops.id,{...input,requestId:randomUUID(),previewToken:opsPreview.previewToken});}
    finally {await prisma.rolePermission.create({data:previousGrant})}
    const annPermission=await prisma.permission.findUniqueOrThrow({where:{key:'chat.announcements.send'}});
    const grant=await prisma.rolePermission.findUniqueOrThrow({where:{roleId_permissionId:{roleId:roles.get('OPS_MANAGER')!,permissionId:annPermission.id}}});await prisma.rolePermission.delete({where:{id:grant.id}});
    try {await prisma.$transaction(tx=>installChatAnnouncementDefaults(tx));await deny(()=>previewAnnouncement(ops.id,input));}finally{await prisma.rolePermission.create({data:grant})}
    pass('Announcement authority bypasses ordinary post settings only; repeat provisioning preserves a revoked announcement permission');

    assert.throws(()=>buildAnnouncementEmail({name:'Bad',email:'one@example.test,two@example.test'},{...input,authorName:'Owner'},updateOne.id),ChatError);
    await deny(()=>previewAnnouncement(owner.id,{title:'Injected\r\nHeader',text:'Test'}),400);
    const session=await createSession({userId:owner.id,expiresAt:new Date(Date.now()+600000)}),url=`http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/announcements`;
    assert.equal((await fetch(url)).status,401);const headers={Cookie:`xyz_session=${session.token}`,'Content-Type':'application/json'};
    const response=await fetch(url,{headers});assert.equal(response.status,200);assert.equal(response.headers.get('cache-control'),'no-store');assert.equal((await fetch(`${url}/preview`,{headers,method:'POST',body:JSON.stringify({...input,to:'extra@example.test'})})).status,400);
    process.env.BLOCK2_ANNOUNCEMENTS_ENABLED='false';assert.equal((await fetch(url,{headers})).status,404);process.env.BLOCK2_ANNOUNCEMENTS_ENABLED='true';
    assert.equal(externalCalls,0);pass('Authenticated no-store endpoints, strict payloads, header privacy and production/off guards');

    const lateOwner=await person('later-owner','OWNER');
    const ordered=await previewAnnouncement(lateOwner.id,{...input,title:'Concurrent quarantine ordering'});
    let publication: ReturnType<typeof publishAnnouncement> | undefined;
    try {
      await prisma.$transaction(async tx=>{
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'chat-access:' + general.id},0))`;
        publication=publishAnnouncement(lateOwner.id,{...input,title:'Concurrent quarantine ordering',requestId:randomUUID(),previewToken:ordered.previewToken});
        void publication.catch(()=>{});
        let waiting=false;
        for(let i=0;i<100&&!waiting;i++) {
          [{waiting}]=await tx.$queryRaw<{waiting:boolean}[]>`SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND wait_event='advisory') AS waiting`;
          if(!waiting)await new Promise(resolve=>setTimeout(resolve,10));
        }
        assert.ok(waiting,'Publication should wait for the recipient access change.');
        const [{available}]=await tx.$queryRaw<{available:boolean}[]>`SELECT pg_try_advisory_xact_lock(hashtextextended(${'chat-access:' + lateOwner.id},0)) AS available`;
        assert.equal(available,true,'A later-created sender must not hold their lock ahead of an earlier recipient.');
      },{timeout:10000});
    } finally { await publication; }
    pass('Publishing and quarantine use the same person-lock order, including a sender created after the recipient');
    console.log(`${checks} announcement integration groups passed. No real email was sent.`);
  } finally {
    globalThis.fetch=originalFetch;await new Promise<void>(resolve=>server.close(()=>resolve()));
    const announcements=await prisma.chatAnnouncement.findMany({where:{authorUserId:{in:userIds}},select:{id:true}});const ids=announcements.map(a=>a.id);
    await prisma.chatAnnouncement.deleteMany({where:{id:{in:ids}}});await prisma.chatMessageRead.deleteMany({where:{userId:{in:userIds}}});
    await prisma.chatMessage.deleteMany({where:{OR:[{authorUserId:{in:userIds}},{channel:{modelId:{in:modelIds}}},{conversation:{subjectUserId:{in:userIds}}}]}});
    await prisma.chatStandingConversation.deleteMany({where:{OR:[{subjectUserId:{in:userIds}},{modelId:{in:modelIds}}]}});await prisma.chatQuarantine.deleteMany({where:{modelId:{in:modelIds}}});await prisma.chatChannel.deleteMany({where:{modelId:{in:modelIds}}});await prisma.chatArea.deleteMany({where:{modelId:{in:modelIds}}});await prisma.user.deleteMany({where:{id:{in:userIds}}});await prisma.agencyModel.deleteMany({where:{id:{in:modelIds}}});
    await prisma.mailerCapacityReservation.deleteMany();
  }
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>prisma.$disconnect());
