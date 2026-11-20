import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import cookieParser from 'cookie-parser';
import { prisma } from '../src/lib/prisma.js';
import { installCreatorChatDefaults, installChatQuarantineDefaults, provisionCreatorChat, setChatQuarantine, listChatUnread, markChatMessagesRead, setChatGrant, setChatReaction, editChatMessage } from '../src/services/creator-chat.js';
import { installStandingChatDefaults, syncUserStandingChats } from '../src/services/standing-chat.js';
import { reminderSnapshot, unreadReminderHistory, buildUnreadReminderEmail } from '../src/services/chat-unread-reminders.js';
import { unreadRemindersEnabled, unreadReminderEmailMode } from '../src/services/chat-unread-reminder-policy.js';
import { runUnreadReminderSweep } from '../src/services/chat-unread-reminder-worker.js';
import { reserveMailerCapacity, MailerCapacityUnavailable } from '../src/services/mailer-capacity.js';
import { loadSession } from '../src/middleware/session-auth.js';
import { createSession } from '../src/services/session.js';
import type { TransactionalEmail } from '../src/services/email-delivery.js';
import { JWT } from 'google-auth-library';
import chat from '../src/routes/chat.js';

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? '');
  assert.equal(db.hostname, '127.0.0.1'); assert.equal(db.port, '55484'); assert.equal(db.pathname, '/block2_unread_reminders_20261105');
  assert.equal(process.env.NODE_ENV, 'test'); assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID);
  process.env.BLOCK2_CHAT_ENABLED = 'true'; process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'true'; process.env.CHAT_UNREAD_EMAIL_MODE = 'capture'; process.env.FRONTEND_URL = 'http://localhost:4134';
  process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = 'capture'; process.env.BLOCK2_ANNOUNCEMENTS_ENABLED = 'true';
  const originalFetch = globalThis.fetch; let externalCalls = 0;
  globalThis.fetch = ((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
    const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    if (!['localhost', '127.0.0.1'].includes(url.hostname)) { externalCalls++; throw Error('External providers are forbidden in local fictional tests.'); }
    return originalFetch(input, init);
  }) as typeof fetch;
  let checks = 0; const pass = (label: string) => console.log(`PASS ${++checks}: ${label}`);
  const prefix = `reminder-${Date.now()}`, users: string[] = [], models: string[] = [];
  const roles = new Map((await prisma.role.findMany()).map(r => [r.systemKey, r.id]));
  await prisma.$transaction(async tx => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatQuarantineDefaults(tx); });
  const person = async (name: string, role: string) => { const u = await prisma.user.create({ data: { name: `${prefix}-${name}`, email: `${prefix}-${name}@example.test`, status: 'ACTIVE', roleMemberships: { create: { roleId: roles.get(role)! } } } }); users.push(u.id); return u; };
  const rows = (id: string) => prisma.chatUnreadReminder.findMany({ where: { userKey: id }, orderBy: { createdAt: 'asc' } });
  const snapshot = (id: string) => prisma.$transaction(tx => reminderSnapshot(tx, id));
  const clearReminder = async (id: string) => { await prisma.chatUnreadReminder.deleteMany({ where: { userKey: id } }); await prisma.chatUnreadReminderState.deleteMany({ where: { userKey: id } }); };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use('/api/chat', chat);
  const server = app.listen(0, '127.0.0.1'); await once(server, 'listening');
  try {
    const owner = await person('owner', 'OWNER'), ops = await person('ops', 'OPS_MANAGER'), dev = await person('dev', 'DEV');
    const staff = await person('staff', 'CHATTER'), other = await person('other', 'CHATTER'), accountant = await person('accountant', 'ACCOUNTANT'), general = await person('general', 'GENERAL_STAFF');
    for (const name of ['One', 'Two']) { const m = await prisma.agencyModel.create({ data: { name: `${prefix}-${name}` } }); models.push(m.id); await prisma.$transaction(tx => provisionCreatorChat(tx, m.id)); }
    for (const id of [owner.id, ops.id, dev.id, staff.id, other.id]) for (const modelId of models) await prisma.userModelAssignment.create({ data: { userId: id, modelId } });
    for (const id of users) await prisma.$transaction(tx => syncUserStandingChats(tx, id));
    const channels = await prisma.chatChannel.findMany({ where: { modelId: { in: models }, key: 'general' } });
    const c1 = channels.find(c => c.modelId === models[0])!, c2 = channels.find(c => c.modelId === models[1])!;
    const privateChat = await prisma.chatStandingConversation.findFirstOrThrow({ where: { subjectUserId: staff.id, modelId: models[0], archivedAt: null } });
    // Brief 7.3: email only for messages still unread after 30 minutes. Fixtures
    // default to already-eligible messages; fresh ones pass an explicit age.
    const ELIGIBLE_AGE = 31 * 60;
    const write = async (targetId: string, n: number, authorId = owner.id, ageSeconds = ELIGIBLE_AGE) => {
      const data = Array.from({ length: n }, () => ({ id: randomUUID(), ...(channels.some(c => c.id === targetId) ? { channelId: targetId } : { conversationId: targetId }), authorUserId: authorId, authorName: 'Fictional author', clientNonce: randomUUID(), text: 'SECRET message body / fan name must never appear in email', createdAt: new Date(Date.now() - ageSeconds * 1000) }));
      await prisma.chatMessage.createMany({ data }); return data.map(m => m.id);
    };
    const reset = async () => { await prisma.chatMessageRead.deleteMany({ where: { userId: { in: users } } }); await prisma.chatMessage.deleteMany({ where: { OR: [{ authorUserId: { in: users } }, { channel: { modelId: { in: models } } }, { conversation: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } }] } }); for (const id of users) await clearReminder(id); await prisma.mailerCapacityReservation.deleteMany(); };
    assert.equal(unreadRemindersEnabled(), true); assert.equal(unreadReminderEmailMode(), 'capture');
    assert.equal(unreadRemindersEnabled({ ...process.env, RAILWAY_ENVIRONMENT_NAME: 'Production' }), false);
    assert.equal(unreadRemindersEnabled({ ...process.env, RAILWAY_ENVIRONMENT_ID: '2b6bb1b6-a75a-45b1-98cf-f98e79a965a4' }), false);
    assert.equal(unreadRemindersEnabled({ ...process.env, RAILWAY_PROJECT_ID: 'unapproved' }), false);
    process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'false'; assert.equal((await runUnreadReminderSweep()).processed, 0); process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'true';
    pass('Feature is opt-in, isolated to approved staging/local tests, and refuses production');

    const fresh = await write(c1.id, 9, owner.id, 0); await runUnreadReminderSweep(); assert.equal((await rows(staff.id)).length, 0);
    await write(c2.id, 1, owner.id, 0); await runUnreadReminderSweep(); assert.equal((await rows(staff.id)).length, 0);
    assert.equal((await snapshot(staff.id)).count, 10); assert.equal((await snapshot(staff.id)).due, false);
    await prisma.chatMessage.update({ where: { id: fresh[0] }, data: { createdAt: new Date(Date.now() - 1_800_000) } });
    await Promise.all([runUnreadReminderSweep(), runUnreadReminderSweep()]);
    assert.equal((await rows(staff.id)).length, 1); const captured = (await rows(staff.id))[0]; assert.equal(captured.status, 'CAPTURED'); assert.equal(captured.unreadCount, 10);
    const email = captured.previewEmail as unknown as TransactionalEmail;
    assert.equal(email.to, staff.email); assert.ok(email.text.includes('10 unread messages')); assert.ok(email.text.includes('/chat')); assert.ok(!JSON.stringify(email).includes('SECRET')); assert.ok(!JSON.stringify(email).includes(owner.name)); assert.equal('cc' in email, false); assert.equal('bcc' in email, false); assert.equal(externalCalls, 0);
    pass('Fresh unread never trigger, even ten across creators; once the oldest is 30 minutes old, one count/link-only email covers all ten, even with concurrent workers');

    await runUnreadReminderSweep(); assert.equal((await rows(staff.id)).length, 1);
    await prisma.$executeRaw`UPDATE "ChatUnreadReminderState" SET "lastAttemptAt"=clock_timestamp() - INTERVAL '59 minutes 59 seconds' WHERE "userKey"=${staff.id}`;
    await runUnreadReminderSweep(); assert.equal((await rows(staff.id)).length, 1);
    await prisma.$executeRaw`UPDATE "ChatUnreadReminderState" SET "lastAttemptAt"=clock_timestamp() - INTERVAL '1 hour' WHERE "userKey"=${staff.id}`;
    await Promise.all([runUnreadReminderSweep(), runUnreadReminderSweep()]); assert.equal((await rows(staff.id)).length, 2);
    pass('One rolling hour is shared by every channel, creator and worker; it persists beyond one sweep');

    await reset(); const ageIds = await write(c1.id, 1, owner.id, 29 * 60 + 59);
    assert.equal((await snapshot(staff.id)).due, false);
    await prisma.chatMessage.update({ where: { id: ageIds[0] }, data: { createdAt: new Date(Date.now() - 1_800_000) } });
    assert.equal((await snapshot(staff.id)).due, true); await runUnreadReminderSweep(); assert.equal((await rows(staff.id))[0].unreadCount, 1);
    pass('A single eligible unread triggers at 30 minutes using database time, with singular email wording');

    await reset(); const own = await write(c1.id, 10, staff.id); assert.equal((await snapshot(staff.id)).count, 0);
    const deleted = await write(c1.id, 10); await prisma.chatMessage.updateMany({ where: { id: { in: deleted } }, data: { deletedAt: new Date(), deletedById: owner.id, deletedByName: owner.name, deletionReason: 'Fictional deleted-message fixture' } }); assert.equal((await snapshot(staff.id)).count, 0);
    await setChatReaction(staff.id, c1.id, own[0], '👍', true); await editChatMessage(staff.id, c1.id, own[0], 'Edited self message', 1); assert.equal((await snapshot(staff.id)).count, 0);
    // A staff announcement has its own email; its post must not also trigger a reminder.
    const announcement = await prisma.chatAnnouncement.create({ data: { requestId: randomUUID(), inputHash: 'fixture', authorUserId: owner.id, authorName: owner.name, title: 'Fictional notice', text: 'Fictional announcement body' } });
    const postId = randomUUID();
    await prisma.chatMessage.create({ data: { id: postId, channelId: c1.id, authorUserId: owner.id, authorName: owner.name, clientNonce: announcement.id, announcementKey: `announcement:${announcement.id}:${c1.id}`, text: 'Fictional notice', createdAt: new Date(Date.now() - ELIGIBLE_AGE * 1000) } });
    await prisma.chatAnnouncementPost.create({ data: { announcementId: announcement.id, targetId: c1.id, isPrivate: false, messageId: postId } });
    await prisma.chatAnnouncementDelivery.create({ data: { announcementId: announcement.id, userId: staff.id, userKey: staff.id, personName: staff.name, destinations: [{ id: c1.id, isPrivate: false }], status: 'CAPTURED' } });
    assert.ok((await listChatUnread(staff.id)).totalUnread >= 1, 'The announcement still shows as unread in Chat');
    assert.equal((await snapshot(staff.id)).count, 0); assert.equal((await snapshot(staff.id)).due, false);
    await prisma.chatAnnouncement.delete({ where: { id: announcement.id } });
    pass('Own messages, deletions, reactions, edits and staff announcements never inflate eligible unread reminders');

    await reset(); await write(c1.id, 10, other.id);
    for (const id of [owner.id, ops.id, dev.id]) { assert.equal((await snapshot(id)).count, 0); assert.ok((await listChatUnread(id)).totalUnread >= 10); }
    await setChatGrant(owner.id, c1.id, { personId: ops.id, canView: true, canPost: false }); assert.equal((await snapshot(ops.id)).count, 10);
    await setChatGrant(owner.id, c1.id, { personId: ops.id, canView: false, canPost: false }); assert.equal((await snapshot(ops.id)).count, 0);
    const wrongAssignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: ops.id, modelId: models[1] } } });
    await prisma.chatPersonGrant.create({ data: { channelId: c1.id, assignmentId: wrongAssignment.id, canView: true } }); assert.equal((await snapshot(ops.id)).count, 0);
    await prisma.chatPersonGrant.delete({ where: { channelId_assignmentId: { channelId: c1.id, assignmentId: wrongAssignment.id } } });
    await write(privateChat.id, 1, staff.id); for (const id of [owner.id, ops.id, dev.id]) assert.equal((await snapshot(id)).count, 1);
    pass('Owner/Ops/Developer oversight produces badges, but emails count only standing chats and current named grants');

    await reset(); await write(c1.id, 10); await write(c2.id, 1);
    const assignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: staff.id, modelId: models[0] } } });
    await setChatQuarantine(owner.id, models[0], staff.id, { active: true, version: 0, assignmentId: assignment.id, reason: 'Fictional reminder test', requestId: randomUUID() });
    const notice = await prisma.chatMessage.findFirstOrThrow({ where: { conversationId: privateChat.id, systemEventKey: { not: null } } });
    await markChatMessagesRead(staff.id, privateChat.id, { messageIds: [notice.id] });
    assert.equal((await snapshot(staff.id)).count, 1); await write(privateChat.id, 1); assert.equal((await snapshot(staff.id)).count, 2);
    await prisma.agencyModel.update({ where: { id: models[1] }, data: { isActive: false } }); assert.equal((await snapshot(staff.id)).count, 1); await prisma.agencyModel.update({ where: { id: models[1] }, data: { isActive: true } });
    await prisma.chatQuarantine.updateMany({ where: { userId: staff.id, modelId: models[0] }, data: { active: false } });
    await prisma.userModelAssignment.delete({ where: { id: assignment.id } }); await prisma.$transaction(tx => syncUserStandingChats(tx, staff.id)); assert.equal((await snapshot(staff.id)).count, 1);
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: models[0] } }); await prisma.$transaction(tx => syncUserStandingChats(tx, staff.id));
    assert.equal((await snapshot(staff.id)).count, 11, 'Archived private assignment episode is not counted on rejoining.');
    pass('Quarantine is creator-local, own management chat remains eligible, and inactive creators/old private episodes are excluded');

    await reset(); process.env.CHAT_UNREAD_EMAIL_MODE = 'gmail';
    process.env.GOOGLE_WORKSPACE_USER = 'fictional-sender@example.test'; process.env.CHAT_EMAIL_HOURLY_CAP = '100'; process.env.CHAT_EMAIL_DAILY_CAP = '1000'; process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE = '5'; process.env.CHAT_EMAIL_AUTH_DAILY_RESERVE = '10';
    process.env.CHAT_UNREAD_TEST_RECIPIENTS = staff.email;
    let sends = 0; const transport = async (_email: TransactionalEmail) => { sends++; };
    const unreadIds = await write(c1.id, 10);
    await runUnreadReminderSweep({ transport, afterClaim: async id => { if (id === staff.id) await markChatMessagesRead(staff.id, c1.id, { messageIds: unreadIds }); } });
    assert.equal(sends, 0); assert.equal((await rows(staff.id))[0].status, 'SKIPPED'); assert.equal((await prisma.chatUnreadReminderState.findUniqueOrThrow({ where: { userKey: staff.id } })).lastAttemptAt, null);
    assert.equal((await rows(other.id)).length, 0, 'Non-allowlisted staff never queue staging sends.');
    pass('Reading messages after claim cancels stale delivery without using the person hourly allowance; unlisted staff never receive staging email');

    await reset(); await write(c1.id, 11);
    let freshEmail: TransactionalEmail | undefined;
    await runUnreadReminderSweep({ transport: async e => { sends++; freshEmail = { ...e }; }, afterClaim: async id => {
      if (id !== staff.id) return;
      const [message] = await prisma.chatMessage.findMany({ where: { channelId: c1.id, authorUserId: owner.id }, take: 1 });
      await markChatMessagesRead(staff.id, c1.id, { messageIds: [message.id] });
      await prisma.user.update({ where: { id }, data: { email: `${prefix}-updated@example.test` } }); process.env.CHAT_UNREAD_TEST_RECIPIENTS += `,${prefix}-updated@example.test`;
    } });
    assert.equal(freshEmail!.to, `${prefix}-updated@example.test`); assert.ok(freshEmail!.text.includes('10 unread')); assert.equal((await rows(staff.id))[0].unreadCount, 10);
    await prisma.user.update({ where: { id: staff.id }, data: { email: staff.email } });
    pass('Final send recheck refreshes both unread count and individual email address instead of sending a stale snapshot');

    await reset(); await write(c1.id, 10); const beforeInactive = sends;
    await runUnreadReminderSweep({ transport, afterClaim: async id => { if (id === staff.id) await prisma.user.update({ where: { id }, data: { status: 'DEACTIVATED' } }); } });
    assert.equal(sends, beforeInactive); assert.equal((await rows(staff.id))[0].status, 'SKIPPED'); await prisma.user.update({ where: { id: staff.id }, data: { status: 'ACTIVE' } });
    pass('Deactivation after claiming cancels delivery at the final current-access check');

    await reset(); await write(c1.id, 10);
    await Promise.all([runUnreadReminderSweep({ transport }), runUnreadReminderSweep({ transport })]); assert.equal((await rows(staff.id)).length, 1); assert.equal((await rows(staff.id))[0].status, 'SENT');
    const sentBefore = sends; await runUnreadReminderSweep({ transport }); assert.equal(sends, sentBefore);
    pass('Concurrent send workers produce one delivery; successful delivery persists the shared rolling-hour throttle');

    await reset(); await write(c1.id, 10); process.env.CHAT_EMAIL_HOURLY_CAP = '3'; process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE = '1';
    await reserveMailerCapacity('CHAT_UNREAD'); await reserveMailerCapacity('CHAT_UNREAD');
    const beforeCapacity = sends; await runUnreadReminderSweep({ transport }); assert.equal(sends, beforeCapacity); assert.equal((await rows(staff.id))[0].status, 'SKIPPED');
    const deferred = await prisma.chatUnreadReminderState.findUniqueOrThrow({ where: { userKey: staff.id } }); assert.equal(deferred.lastAttemptAt, null); assert.ok(deferred.retryAfter);
    await reserveMailerCapacity('AUTH'); await assert.rejects(() => reserveMailerCapacity('AUTH'), MailerCapacityUnavailable);
    pass('Unread mail shares sender capacity while preserving the authentication reserve; capacity deferrals do not consume the personal hour');

    await reset(); process.env.CHAT_EMAIL_HOURLY_CAP = '100'; process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE = '5'; await write(c1.id, 10);
    let uncertainCalls = 0; await runUnreadReminderSweep({ transport: async () => { uncertainCalls++; throw new Error('Fictional uncertain provider outcome'); } });
    assert.equal((await rows(staff.id))[0].status, 'REVIEW'); await runUnreadReminderSweep({ transport }); assert.equal(uncertainCalls, 1); assert.equal((await rows(staff.id)).length, 1);
    await clearReminder(staff.id); await prisma.chatUnreadReminder.create({ data: { userKey: staff.id, userId: staff.id, unreadCount: 10, status: 'SENDING', createdAt: new Date(Date.now() - 660_000) } });
    await runUnreadReminderSweep({ transport }); assert.equal((await rows(staff.id))[0].status, 'REVIEW'); assert.equal((await rows(staff.id)).length, 1);
    pass('Uncertain sends and abandoned worker claims are held for review across restarts without automatic duplicate delivery');

    await reset(); process.env.CHAT_UNREAD_EMAIL_MODE = 'capture';
    const acctChat = await prisma.chatStandingConversation.findFirstOrThrow({ where: { subjectUserId: accountant.id, kind: 'ACCOUNTANT', archivedAt: null } });
    const gsChat = await prisma.chatStandingConversation.findFirstOrThrow({ where: { subjectUserId: general.id, kind: 'GENERAL_STAFF', archivedAt: null } });
    await write(acctChat.id, 10); await write(gsChat.id, 10); await runUnreadReminderSweep(); assert.equal((await rows(accountant.id))[0].unreadCount, 10); assert.equal((await rows(general.id))[0].unreadCount, 10);
    const history = await unreadReminderHistory(staff.id); assert.ok(!JSON.stringify(history).includes(accountant.email)); assert.equal(history.deliveries.length, 0);
    const session = await createSession({ userId: staff.id, expiresAt: new Date(Date.now() + 600000) }); const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/unread-reminders`;
    assert.equal((await fetch(base)).status, 401); const headers = { Cookie: `xyz_session=${session.token}` }; const response = await fetch(base, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get('cache-control'), 'no-store');
    const countBeforeGet = await prisma.chatUnreadReminder.count(); await fetch(base, { headers }); assert.equal(await prisma.chatUnreadReminder.count(), countBeforeGet);
    process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'false'; assert.equal((await fetch(base, { headers })).status, 404); process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'true';
    pass('Accountant/General Staff protected-chat counts and authenticated own-history previews; viewing status never sends mail or reveals another person');

    // Re-use the production sender ledger without enabling provider requests.
    process.env.CHAT_UNREAD_EMAIL_MODE = 'gmail'; process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = 'gmail';
    await prisma.mailerCapacityReservation.deleteMany(); process.env.CHAT_EMAIL_HOURLY_CAP = '3'; process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE = '1';
    await reserveMailerCapacity('CHAT_ANNOUNCEMENT'); await reserveMailerCapacity('CHAT_UNREAD'); await assert.rejects(() => reserveMailerCapacity('CHAT_ANNOUNCEMENT'), MailerCapacityUnavailable); await reserveMailerCapacity('AUTH');
    assert.throws(() => buildUnreadReminderEmail('one@example.test,two@example.test', 10));
    assert.throws(() => buildUnreadReminderEmail(staff.email, 0));
    assert.equal(externalCalls, 0);
    pass('Announcements and unread alerts share one sender budget with sign-in capacity retained; individual email headers reject multiple recipients');

    await reset(); process.env.CHAT_EMAIL_HOURLY_CAP = '100'; process.env.CHAT_EMAIL_AUTH_HOURLY_RESERVE = '5';
    process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = 'capture'; process.env.EMAIL_FROM = 'XYZ Test <fictional-sender@example.test>';
    process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL = 'fictional-service@example.test'; process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY = 'fictional-unused-test-key';
    await write(c1.id, 11); const tokenMethod = Object.getOwnPropertyDescriptor(JWT.prototype, 'getAccessToken');
    const blockedFetch = globalThis.fetch; let rawMime = '', providerRequests = 0;
    Object.defineProperty(JWT.prototype, 'getAccessToken', { configurable: true, value: async () => {
      const [message] = await prisma.chatMessage.findMany({ where: { channelId: c1.id, authorUserId: owner.id }, take: 1 });
      await markChatMessagesRead(staff.id, c1.id, { messageIds: [message.id] });
      await prisma.user.update({ where: { id: staff.id }, data: { email: `${prefix}-final@example.test` } });
      process.env.CHAT_UNREAD_TEST_RECIPIENTS += `,${prefix}-final@example.test`;
      return { token: 'fictional-token-never-leaves-process' };
    } });
    globalThis.fetch = (async (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
      if (String(input) === 'https://gmail.googleapis.com/gmail/v1/users/me/messages/send') {
        providerRequests++; rawMime = Buffer.from(JSON.parse(String(init?.body)).raw, 'base64url').toString('utf8');
        return new Response('{}', { status: 200 });
      }
      return blockedFetch(input, init);
    }) as typeof fetch;
    try { await runUnreadReminderSweep(); } finally {
      globalThis.fetch = blockedFetch;
      if (tokenMethod) Object.defineProperty(JWT.prototype, 'getAccessToken', tokenMethod); else Reflect.deleteProperty(JWT.prototype, 'getAccessToken');
      await prisma.user.update({ where: { id: staff.id }, data: { email: staff.email } });
    }
    assert.equal(providerRequests, 1); assert.ok(rawMime.includes(`To: ${prefix}-final@example.test`)); assert.ok(rawMime.includes('10 unread messages')); assert.ok(!rawMime.includes('11 unread messages')); assert.ok(!rawMime.includes('SECRET')); assert.ok(!/^Cc:|^Bcc:/mi.test(rawMime)); assert.equal(externalCalls, 0);
    pass('Actual MIME is built after the final token-time recheck: current recipient/count and one To header, using an in-process fake Gmail endpoint');

    await reset(); await write(c1.id, 10); const beforeLoss = sends;
    await runUnreadReminderSweep({ transport, afterClaim: async id => {
      if (id !== staff.id) return;
      await prisma.userModelAssignment.deleteMany({ where: { userId: id, modelId: models[0] } }); await prisma.$transaction(tx => syncUserStandingChats(tx, id));
    } });
    assert.equal(sends, beforeLoss); assert.equal((await rows(staff.id))[0].status, 'SKIPPED');
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: models[0] } }); await prisma.$transaction(tx => syncUserStandingChats(tx, staff.id));
    await clearReminder(staff.id); await runUnreadReminderSweep({ transport, afterClaim: async id => { if (id === staff.id) process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'false'; } });
    assert.equal(sends, beforeLoss); assert.equal((await rows(staff.id))[0].status, 'SKIPPED'); process.env.BLOCK2_UNREAD_EMAIL_ENABLED = 'true';
    pass('Losing creator access or disabling the feature during delivery suppresses the claimed email before any send');
    console.log(`${checks} unread reminder integration groups passed. No real email sent.`);
  } finally {
    globalThis.fetch = originalFetch; await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.chatUnreadReminder.deleteMany({ where: { userKey: { in: users } } }); await prisma.chatUnreadReminderState.deleteMany({ where: { userKey: { in: users } } });
    await prisma.chatMessageRead.deleteMany({ where: { userId: { in: users } } }); await prisma.chatMessage.deleteMany({ where: { OR: [{ authorUserId: { in: users } }, { channel: { modelId: { in: models } } }, { conversation: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } }] } });
    await prisma.chatStandingConversation.deleteMany({ where: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } });
    await prisma.chatQuarantine.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } }); await prisma.mailerCapacityReservation.deleteMany();
  }
}
main().catch(e => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
