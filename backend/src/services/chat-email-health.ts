import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { ChatError, loadViewer } from './creator-chat.js';
import { unreadRemindersEnabled, unreadReminderEmailMode } from './chat-unread-reminder-policy.js';
import { announcementEmailMode, announcementsEnabled } from './chat-announcement-policy.js';
import { chatMailerCapacityConfig } from './mailer-capacity.js';

/*
 * Owner view of Chat email health (unread reminders and announcement emails).
 * Problems first: a paused delivery (Gmail did not confirm the send) and the
 * shared daily sending budget that keeps sign-in codes flowing (brief 7.3).
 * Every reminder email is also recorded in the Audit Log, without content.
 */

type Tx = Prisma.TransactionClient;
export type EmailDeliveryStatus = 'OFF' | 'PREVIEW' | 'NOT_CONFIGURED' | 'SENDING' | 'NEAR_LIMIT' | 'PAUSED_HOUR' | 'PAUSED_TODAY';
export const NEAR_LIMIT_SHARE = 0.9;

export function chatEmailModes() {
  return {
    reminders: unreadRemindersEnabled() ? unreadReminderEmailMode() : 'off',
    announcements: announcementsEnabled() ? announcementEmailMode() : 'off',
  };
}

/** Current sending state against the shared budget, including sign-in codes. */
export async function emailCapacityState(client: Tx | typeof prisma = prisma) {
  const modes = chatEmailModes();
  const live = modes.reminders === 'gmail' || modes.announcements === 'gmail';
  const preview = modes.reminders === 'capture' || modes.announcements === 'capture';
  if (!live) return { status: (preview ? 'PREVIEW' : 'OFF') as EmailDeliveryStatus, modes, usage: null, crossedAt: null, nearDaily: false };
  const config = chatMailerCapacityConfig();
  if (!config) return { status: 'NOT_CONFIGURED' as EmailDeliveryStatus, modes, usage: null, crossedAt: null, nearDaily: false };
  const [{ now }] = await client.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const dayStart = new Date(now.getTime() - 86_400_000), hourStart = new Date(now.getTime() - 3_600_000);
  const [usedToday, usedHour] = await Promise.all([
    client.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: dayStart } } }),
    client.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: hourStart } } }),
  ]);
  // Chat email stops at these points; the remainder is kept for sign-in codes.
  const allowanceToday = config.day - config.dayReserve, allowanceHour = config.hour - config.hourReserve;
  // The daily warning stands on its own: an hourly pause can overlap it.
  const nearDaily = usedToday >= Math.ceil(allowanceToday * NEAR_LIMIT_SHARE);
  const status: EmailDeliveryStatus = usedToday >= allowanceToday ? 'PAUSED_TODAY' : usedHour >= allowanceHour ? 'PAUSED_HOUR'
    : nearDaily ? 'NEAR_LIMIT' : 'SENDING';
  let crossedAt: Date | null = null;
  if (nearDaily) {
    // The send that crossed the warning line dates the bell notice, so it
    // stays in one place in the history instead of moving on every check.
    const crossing = await client.mailerCapacityReservation.findFirst({ where: { senderKey: config.senderKey, createdAt: { gte: dayStart } },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], skip: Math.ceil(allowanceToday * NEAR_LIMIT_SHARE) - 1, select: { createdAt: true } });
    crossedAt = crossing?.createdAt ?? now;
  }
  return { status, modes, crossedAt, nearDaily,
    usage: status === 'SENDING' ? null : { usedToday, allowanceToday, dailyLimit: config.day, usedHour, allowanceHour } };
}

export type AttentionItem = { type: 'reminder' | 'announcement'; id: string; personName: string; at: Date; detail: string; title: string | null };

/** Paused deliveries no Owner has resolved yet, newest first. */
export async function emailAttention(client: Tx | typeof prisma = prisma, take = 50): Promise<AttentionItem[]> {
  const [reminders, announcements] = await Promise.all([
    client.chatUnreadReminder.findMany({ where: { status: 'REVIEW', reviewResolvedAt: null }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take,
      select: { id: true, createdAt: true, lastError: true, recipient: { select: { name: true } } } }),
    client.chatAnnouncementDelivery.findMany({ where: { status: 'REVIEW', reviewResolvedAt: null }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }], take,
      select: { id: true, personName: true, attemptedAt: true, updatedAt: true, lastError: true, announcement: { select: { title: true } } } }),
  ]);
  return [
    ...reminders.map((r) => ({ type: 'reminder' as const, id: r.id, personName: r.recipient?.name ?? 'Deleted account', at: r.createdAt, title: null,
      detail: r.lastError ?? 'Gmail did not confirm this reminder. Further reminders for this person are paused.' })),
    ...announcements.map((a) => ({ type: 'announcement' as const, id: a.id, personName: a.personName, at: a.attemptedAt ?? a.updatedAt, title: a.announcement.title,
      detail: a.lastError ?? 'Gmail did not confirm this announcement email.' })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
}

async function requireOwner(tx: Tx, userId: string) {
  const viewer = await loadViewer(tx, userId);
  if (!viewer.isOwner) throw new ChatError(403, 'Only Owners can view email delivery.');
  return viewer;
}

export async function emailDeliveryOverview(userId: string) {
  return prisma.$transaction(async (tx) => {
    await requireOwner(tx, userId);
    const capacity = await emailCapacityState(tx);
    const attention = await emailAttention(tx);
    return { status: capacity.status, modes: capacity.modes, usage: capacity.usage, attention };
  }, { timeout: 15_000 });
}

/** "Resume reminders" / "Mark handled": the Owner checked the inbox. Nothing
 * is re-sent; a resolved reminder pause simply lets later reminders through. */
export async function resolveEmailReview(userId: string, type: 'reminder' | 'announcement', id: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await requireOwner(tx, userId);
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const data = { reviewResolvedAt: now, reviewResolvedByName: viewer.user.name };
    let personName: string, title: string | null = null;
    if (type === 'reminder') {
      const row = await tx.chatUnreadReminder.findUnique({ where: { id }, select: { status: true, reviewResolvedAt: true, recipient: { select: { name: true } } } });
      if (!row || row.status !== 'REVIEW') throw new ChatError(404, 'This delivery no longer needs attention.');
      if (row.reviewResolvedAt) return { resolved: true };
      await tx.chatUnreadReminder.update({ where: { id }, data });
      personName = row.recipient?.name ?? 'Deleted account';
    } else {
      const row = await tx.chatAnnouncementDelivery.findUnique({ where: { id }, select: { status: true, reviewResolvedAt: true, personName: true, announcement: { select: { title: true } } } });
      if (!row || row.status !== 'REVIEW') throw new ChatError(404, 'This delivery no longer needs attention.');
      if (row.reviewResolvedAt) return { resolved: true };
      await tx.chatAnnouncementDelivery.update({ where: { id }, data });
      personName = row.personName; title = row.announcement.title;
    }
    await tx.auditEvent.create({ data: { occurredAt: now, action: 'chat.email.review_resolve', success: true, statusCode: 200,
      actorUserId: userId, actorLabel: viewer.user.name, targetType: 'chat', targetId: id,
      metadata: { kind: type === 'reminder' ? 'Unread reminder' : 'Announcement email', personName, ...(title ? { title } : {}) } } });
    return { resolved: true };
  }, { timeout: 15_000 });
}

export type ReminderOutcome = 'Email sent' | 'Preview saved' | 'Needs review';
/** Audit record for one reminder email: who, how many unread, the outcome. */
export function reminderEmailAudit(deliveryId: string, personName: string, unreadCount: number, outcome: ReminderOutcome, at: Date): Prisma.AuditEventCreateInput {
  return { occurredAt: at, action: 'chat.unread_reminder.email', success: outcome !== 'Needs review', statusCode: 200, actorLabel: 'Email reminders',
    targetType: 'chat', targetId: deliveryId, metadata: { personName, unreadCount, outcome } };
}
