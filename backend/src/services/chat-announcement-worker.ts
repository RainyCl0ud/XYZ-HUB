import { randomUUID } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { announcementEmailMode, announcementsEnabled } from './chat-announcement-policy.js';
import { buildAnnouncementEmail, currentAnnouncementDestination } from './chat-announcements.js';
import { MailerCapacityUnavailable } from './mailer-capacity.js';
import { sendTransactionalEmail, type TransactionalEmail } from './email-delivery.js';

type TestTransport = (email: TransactionalEmail) => Promise<void>;
class RecipientChanged extends Error {}
export async function runAnnouncementSweep(testTransport?: TestTransport) {
  if (!announcementsEnabled() || announcementEmailMode() === 'off') return { processed: 0 };
  if (testTransport && (process.env.NODE_ENV !== 'test' || process.env.RAILWAY_PROJECT_ID || !['localhost','127.0.0.1','[::1]'].includes(new URL(process.env.DATABASE_URL ?? '').hostname))) throw new Error('Test transports are restricted to local fictional tests.');
  // A crashed worker may have submitted an email. Never retry an uncertain
  // provider attempt automatically: Gmail send has no idempotency parameter.
  await prisma.chatAnnouncementDelivery.updateMany({ where: { status: 'SENDING', attemptedAt: { lt: new Date(Date.now()-600000) } },
    data: { status: 'REVIEW', lastError: 'Delivery outcome is uncertain. Review before taking any further action.' } });
  const candidates = await prisma.chatAnnouncementDelivery.findMany({ where: { status: 'PENDING', updatedAt: { lte: new Date() } }, take: 25, orderBy: { updatedAt: 'asc' }, select: { id: true } });
  let processed = 0;
  for (const candidate of candidates) {
    const attempt = randomUUID();
    const item = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ChatAnnouncementDelivery" WHERE "id"=${candidate.id} AND "status"='PENDING' FOR UPDATE SKIP LOCKED`;
      if (!rows.length) return null;
      const delivery = await tx.chatAnnouncementDelivery.findUniqueOrThrow({ where: { id: candidate.id }, include: { announcement: true } });
      const current = delivery.userId && await currentAnnouncementDestination(tx, delivery.userId, delivery.destinations);
      if (!current) { await tx.chatAnnouncementDelivery.update({ where: { id: delivery.id }, data: { status: 'SKIPPED', lastError: 'Recipient or current Hub destination is no longer eligible.', completedAt: new Date() } }); return null; }
      const email = buildAnnouncementEmail(current.person, delivery.announcement, current.channelId);
      if (announcementEmailMode() === 'capture') {
        await tx.chatAnnouncementDelivery.update({ where: { id: delivery.id }, data: { status: 'CAPTURED', previewEmail: email as Prisma.InputJsonObject, completedAt: new Date() } });
        return null;
      }
      // Staging Gmail validation is opt-in and limited to explicitly named test
      // addresses; never deliver a staging broadcast to real staff by default.
      const allowlist = new Set((process.env.CHAT_ANNOUNCEMENT_TEST_RECIPIENTS ?? '').split(',').map(v => v.trim().toLowerCase()).filter(Boolean));
      if (!allowlist.has(email.to.toLowerCase())) {
        await tx.chatAnnouncementDelivery.update({ where: { id: delivery.id }, data: { status: 'SKIPPED', lastError: 'Recipient is not on the staging email test list.', completedAt: new Date() } }); return null;
      }
      await tx.chatAnnouncementDelivery.update({ where: { id: delivery.id }, data: { status: 'SENDING', attemptId: attempt, attemptedAt: new Date(), lastError: null } });
      return { id: delivery.id, userId: current.person.id, channelId: current.channelId, email };
    }, { timeout: 15_000 });
    if (!item) continue;
    try {
      const recheck = async () => {
        const current = await prisma.$transaction(tx => currentAnnouncementDestination(tx, item.userId, [{ id: item.channelId }]));
        if (!current || current.person.email !== item.email.to) throw new RecipientChanged();
      };
      if (testTransport) { await recheck(); await testTransport(item.email); }
      else await sendTransactionalEmail(item.email, 'CHAT_ANNOUNCEMENT', recheck);
      await prisma.chatAnnouncementDelivery.updateMany({ where: { id: item.id, status: 'SENDING', attemptId: attempt }, data: { status: 'SENT', completedAt: new Date() } });
      processed++;
    } catch (e) {
      const capacity = e instanceof MailerCapacityUnavailable;
      await prisma.chatAnnouncementDelivery.updateMany({ where: { id: item.id, status: 'SENDING', attemptId: attempt }, data: {
        status: capacity ? 'PENDING' : e instanceof RecipientChanged ? 'SKIPPED' : 'REVIEW', updatedAt: capacity ? new Date(Date.now()+60000) : new Date(),
        lastError: capacity ? e.message : e instanceof RecipientChanged ? 'Recipient access or email changed before sending.' : 'Email delivery could not be confirmed. Automatic resend is paused to prevent duplicates.',
      } });
    }
  }
  return { processed };
}
export function startAnnouncementWorker() {
  if (!announcementsEnabled() || announcementEmailMode() === 'off') return () => {};
  let running = false, stopped = false;
  const tick = async () => { if (running || stopped) return; running = true; try { await runAnnouncementSweep(); } catch { console.error('Announcement delivery check unavailable; queued work is retained.'); } finally { running = false; } };
  const first = setTimeout(() => void tick(), 1500); first.unref();
  const interval = setInterval(() => void tick(), 15000); interval.unref();
  console.log(`Staging announcement delivery checks enabled (${announcementEmailMode()}).`);
  return () => { stopped = true; clearTimeout(first); clearInterval(interval); };
}
