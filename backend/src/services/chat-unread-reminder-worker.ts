import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ChatError } from './creator-chat.js';
import { unreadRemindersEnabled, unreadReminderEmailMode } from './chat-unread-reminder-policy.js';
import { buildUnreadReminderEmail, lockReminderPerson, reminderClock, reminderSnapshot, REMINDER_HOUR_MS } from './chat-unread-reminders.js';
import { MailerCapacityUnavailable, reserveMailerCapacity } from './mailer-capacity.js';
import { sendTransactionalEmail, type TransactionalEmail } from './email-delivery.js';
import { singleEmailAddress } from './chat-announcements.js';
import { reminderEmailAudit } from './chat-email-health.js';

type LocalTest = { transport: (email: TransactionalEmail) => Promise<void>; afterClaim?: (userId: string) => Promise<void> };
class RecipientChanged extends Error {}
const eligibleForTest = (email: string) => new Set((process.env.CHAT_UNREAD_TEST_RECIPIENTS ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean)).has(email.toLowerCase());

export async function runUnreadReminderSweep(test?: LocalTest) {
  const mode = unreadReminderEmailMode();
  if (!unreadRemindersEnabled() || mode === 'off') return { processed: 0 };
  if (test && (process.env.NODE_ENV !== 'test' || process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID || !['localhost', '127.0.0.1', '[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname))) throw new Error('Test transports are restricted to local fictional tests.');
  // Provider outcomes after a crash are unknown. Hold this person's reminders
  // for review instead of retrying and potentially sending the same mail twice.
  const stuck = await prisma.$queryRaw<{ id: string; userId: string | null; unreadCount: number }[]>`UPDATE "ChatUnreadReminder" SET "status"='REVIEW', "lastError"='Delivery outcome is uncertain; further reminders are paused for review.'
    WHERE "status"='SENDING' AND "createdAt" < clock_timestamp() - INTERVAL '10 minutes' RETURNING "id", "userId", "unreadCount"`;
  for (const row of stuck) {
    const person = row.userId ? await prisma.user.findUnique({ where: { id: row.userId }, select: { name: true } }) : null;
    await prisma.auditEvent.create({ data: reminderEmailAudit(row.id, person?.name ?? 'Deleted account', row.unreadCount, 'Needs review', new Date()) });
  }
  let processed = 0, cursor: string | undefined;
  for (;;) {
    const people = await prisma.user.findMany({ where: { status: 'ACTIVE' }, orderBy: { id: 'asc' }, take: 50, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}), select: { id: true } });
    if (!people.length) break;
    for (const person of people) {
      let item: { id: string; email: TransactionalEmail } | null;
      try {
        item = await prisma.$transaction(async tx => {
          await lockReminderPerson(tx, person.id);
          if (unreadReminderEmailMode() !== mode) return null;
          const state = await tx.chatUnreadReminderState.findUnique({ where: { userKey: person.id } });
          const now = await reminderClock(tx);
          if (state?.retryAfter && state.retryAfter > now || state?.lastAttemptAt && now.getTime() - state.lastAttemptAt.getTime() < REMINDER_HOUR_MS) return null;
          // A paused (REVIEW) delivery blocks further reminders until an Owner
          // checks the inbox and resumes them from Email delivery.
          if (await tx.chatUnreadReminder.findFirst({ where: { userKey: person.id, OR: [{ status: 'SENDING' }, { status: 'REVIEW', reviewResolvedAt: null }] }, select: { id: true } })) return null;
          const current = await reminderSnapshot(tx, person.id);
          if (!current.due || !singleEmailAddress(current.person.email)) return null;
          const email = buildUnreadReminderEmail(current.person.email, current.count);
          // Unlisted staging users are ignored, not queued for later sending.
          if (mode === 'gmail' && !eligibleForTest(email.to)) return null;
          await tx.chatUnreadReminderState.upsert({ where: { userKey: person.id }, create: { userKey: person.id, userId: person.id }, update: {} });
          const row = await tx.chatUnreadReminder.create({ data: { userKey: person.id, userId: person.id, unreadCount: current.count,
            status: mode === 'capture' ? 'CAPTURED' : 'SENDING',
            ...(mode === 'capture' ? { previewEmail: email as Prisma.InputJsonObject, completedAt: now } : {}) } });
          if (mode === 'capture') {
            await tx.chatUnreadReminderState.update({ where: { userKey: person.id }, data: { lastAttemptAt: now, retryAfter: null } });
            await tx.auditEvent.create({ data: reminderEmailAudit(row.id, current.person.name, current.count, 'Preview saved', now) });
            processed++;
            return null;
          }
          return { id: row.id, email };
        }, { timeout: 15_000 });
      } catch (error) {
        if (error instanceof ChatError && [401, 403].includes(error.status)) continue;
        throw error;
      }
      if (!item) continue;
      const delivery = item;
      try {
        await test?.afterClaim?.(person.id);
        const beforeSend = async () => {
          try {
            await prisma.$transaction(async tx => {
              await lockReminderPerson(tx, person.id);
              const row = await tx.chatUnreadReminder.findUnique({ where: { id: delivery.id } });
              const current = await reminderSnapshot(tx, person.id);
              const state = await tx.chatUnreadReminderState.findUniqueOrThrow({ where: { userKey: person.id } });
              if (unreadReminderEmailMode() !== 'gmail' || !singleEmailAddress(current.person.email) || !eligibleForTest(current.person.email) || !current.due || !row || row.status !== 'SENDING' || row.attemptedAt ||
                state.lastAttemptAt && current.now.getTime() - state.lastAttemptAt.getTime() < REMINDER_HOUR_MS) throw new RecipientChanged();
              // Refresh the count, address and URL immediately before MIME is
              // built, after token acquisition. Never reuse a stale payload.
              Object.assign(delivery.email, buildUnreadReminderEmail(current.person.email, current.count));
              await tx.chatUnreadReminder.update({ where: { id: delivery.id }, data: { attemptedAt: current.now, unreadCount: current.count } });
              await tx.chatUnreadReminderState.update({ where: { userKey: person.id }, data: { lastAttemptAt: current.now, retryAfter: null } });
            }, { timeout: 15_000 });
          } catch (error) {
            if (error instanceof ChatError && [401, 403].includes(error.status)) throw new RecipientChanged();
            throw error;
          }
        };
        if (test) { await reserveMailerCapacity('CHAT_UNREAD'); await beforeSend(); await test.transport(delivery.email); }
        else await sendTransactionalEmail(delivery.email, 'CHAT_UNREAD', beforeSend);
        const sent = await prisma.chatUnreadReminder.updateMany({ where: { id: delivery.id, status: 'SENDING' }, data: { status: 'SENT', completedAt: new Date() } });
        if (sent.count) {
          const row = await prisma.chatUnreadReminder.findUnique({ where: { id: delivery.id }, select: { unreadCount: true, recipient: { select: { name: true } } } });
          await prisma.auditEvent.create({ data: reminderEmailAudit(delivery.id, row?.recipient?.name ?? 'Deleted account', row?.unreadCount ?? 0, 'Email sent', new Date()) });
        }
        processed++;
      } catch (error) {
        const capacity = error instanceof MailerCapacityUnavailable, changed = error instanceof RecipientChanged;
        await prisma.$transaction(async tx => {
          // A zero-send skip never consumes the person's one-hour allowance.
          const paused = await tx.chatUnreadReminder.updateMany({ where: { id: delivery.id, status: 'SENDING' }, data: { status: capacity || changed ? 'SKIPPED' : 'REVIEW', completedAt: new Date(),
            lastError: capacity ? 'Sender capacity is reserved for sign-in and account recovery. Reminder deferred.' : changed ? 'Recipient eligibility or unread state changed before sending.' : 'Delivery outcome could not be confirmed; further reminders are paused for review.' } });
          if (paused.count && !capacity && !changed) {
            const row = await tx.chatUnreadReminder.findUnique({ where: { id: delivery.id }, select: { unreadCount: true, recipient: { select: { name: true } } } });
            await tx.auditEvent.create({ data: reminderEmailAudit(delivery.id, row?.recipient?.name ?? 'Deleted account', row?.unreadCount ?? 0, 'Needs review', new Date()) });
          }
          if (capacity) {
            const now = await reminderClock(tx);
            await tx.chatUnreadReminderState.update({ where: { userKey: person.id }, data: { retryAfter: new Date(now.getTime() + 60_000) } });
          }
        });
      }
    }
    cursor = people.at(-1)!.id;
  }
  return { processed };
}

export function startUnreadReminderWorker() {
  if (!unreadRemindersEnabled() || unreadReminderEmailMode() === 'off') return () => {};
  let running = false, stopped = false;
  const tick = async () => {
    if (running || stopped) return;
    running = true;
    try { await runUnreadReminderSweep(); }
    catch { console.error('Unread email reminder check unavailable; saved read state is retained.'); }
    finally { running = false; }
  };
  const first = setTimeout(() => void tick(), 2500); first.unref();
  const interval = setInterval(() => void tick(), 15_000); interval.unref();
  console.log(`Staging unread email reminder checks enabled (${unreadReminderEmailMode()}).`);
  return () => { stopped = true; clearTimeout(first); clearInterval(interval); };
}
