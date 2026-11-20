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
type Usage = { usedToday: number; allowanceToday: number; dailyLimit: number; usedHour: number; allowanceHour: number };

export function chatEmailModes() {
  return {
    reminders: unreadRemindersEnabled() ? unreadReminderEmailMode() : 'off',
    announcements: announcementsEnabled() ? announcementEmailMode() : 'off',
  };
}

/** Current sending state against the shared budget, including sign-in codes.
 * Also keeps the near-limit warning periods (EmailLimitWarning) in step, so a
 * warning has one fixed start time and one bell notice for its whole span. */
export async function emailCapacityState(tx: Tx) {
  const modes = chatEmailModes();
  const live = modes.reminders === 'gmail' || modes.announcements === 'gmail';
  const preview = modes.reminders === 'capture' || modes.announcements === 'capture';
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  const config = live ? chatMailerCapacityConfig() : null;
  let status: EmailDeliveryStatus = !live ? (preview ? 'PREVIEW' : 'OFF') : !config ? 'NOT_CONFIGURED' : 'SENDING';
  let usage: Usage | null = null, nearDaily = false;
  if (config) {
    const [usedToday, usedHour] = await Promise.all([
      tx.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: new Date(now.getTime() - 86_400_000) } } }),
      tx.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: new Date(now.getTime() - 3_600_000) } } }),
    ]);
    // Chat email stops at these points; the remainder is kept for sign-in codes.
    const allowanceToday = config.day - config.dayReserve, allowanceHour = config.hour - config.hourReserve;
    // The daily warning stands on its own: an hourly pause can overlap it.
    nearDaily = usedToday >= Math.ceil(allowanceToday * NEAR_LIMIT_SHARE);
    status = usedToday >= allowanceToday ? 'PAUSED_TODAY' : usedHour >= allowanceHour ? 'PAUSED_HOUR' : nearDaily ? 'NEAR_LIMIT' : 'SENDING';
    if (status !== 'SENDING') usage = { usedToday, allowanceToday, dailyLimit: config.day, usedHour, allowanceHour };
  }
  let open = await tx.emailLimitWarning.findFirst({ where: { endedAt: null } });
  if (nearDaily !== !!open) {
    // One writer at a time; the partial unique index backs this up.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended('email-limit-warning', 0))`;
    open = await tx.emailLimitWarning.findFirst({ where: { endedAt: null } });
    if (nearDaily && !open) open = await tx.emailLimitWarning.create({ data: { startedAt: now } });
    else if (!nearDaily && open) { await tx.emailLimitWarning.update({ where: { id: open.id }, data: { endedAt: now } }); open = null; }
  }
  return { status, modes, usage, nearDaily, warning: open };
}

export type AttentionItem = { type: 'reminder' | 'announcement'; id: string; personName: string; at: Date; detail: string; title: string | null };
const ATTENTION_SHOWN = 50;

/** Paused deliveries no Owner has resolved yet, newest first, with the total. */
export async function emailAttention(tx: Tx, take = ATTENTION_SHOWN): Promise<{ items: AttentionItem[]; total: number }> {
  const open = { status: 'REVIEW' as const, reviewResolvedAt: null };
  const [reminders, announcements, reminderTotal, announcementTotal] = await Promise.all([
    tx.chatUnreadReminder.findMany({ where: open, orderBy: [{ reviewAt: 'desc' }, { id: 'desc' }], take,
      select: { id: true, reviewAt: true, createdAt: true, lastError: true, recipient: { select: { name: true } } } }),
    tx.chatAnnouncementDelivery.findMany({ where: open, orderBy: [{ reviewAt: 'desc' }, { id: 'desc' }], take,
      select: { id: true, personName: true, reviewAt: true, attemptedAt: true, updatedAt: true, lastError: true, announcement: { select: { title: true } } } }),
    tx.chatUnreadReminder.count({ where: open }),
    tx.chatAnnouncementDelivery.count({ where: open }),
  ]);
  const items = [
    ...reminders.map((r) => ({ type: 'reminder' as const, id: r.id, personName: r.recipient?.name ?? 'Deleted account', at: r.reviewAt ?? r.createdAt, title: null,
      detail: r.lastError ?? 'Gmail did not confirm this reminder. Further reminders for this person are paused.' })),
    ...announcements.map((a) => ({ type: 'announcement' as const, id: a.id, personName: a.personName, at: a.reviewAt ?? a.attemptedAt ?? a.updatedAt, title: a.announcement.title,
      detail: a.lastError ?? 'Gmail did not confirm this announcement email.' })),
  ].sort((a, b) => b.at.getTime() - a.at.getTime()).slice(0, take);
  return { items, total: reminderTotal + announcementTotal };
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
    return { status: capacity.status, modes: capacity.modes, usage: capacity.usage, attention: attention.items, attentionTotal: attention.total };
  }, { timeout: 15_000 });
}

/** "Resume reminders" / "Mark handled": the Owner checked the inbox. Nothing
 * is re-sent; a resolved reminder pause simply lets later reminders through.
 * The conditional update means two Owners clicking together record it once. */
export async function resolveEmailReview(userId: string, type: 'reminder' | 'announcement', id: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await requireOwner(tx, userId);
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const data = { reviewResolvedAt: now, reviewResolvedByName: viewer.user.name };
    let personName: string, title: string | null = null, changed: number;
    if (type === 'reminder') {
      const row = await tx.chatUnreadReminder.findUnique({ where: { id }, select: { status: true, recipient: { select: { name: true } } } });
      if (!row || row.status !== 'REVIEW') throw new ChatError(404, 'This delivery no longer needs attention.');
      changed = (await tx.chatUnreadReminder.updateMany({ where: { id, status: 'REVIEW', reviewResolvedAt: null }, data })).count;
      personName = row.recipient?.name ?? 'Deleted account';
    } else {
      const row = await tx.chatAnnouncementDelivery.findUnique({ where: { id }, select: { status: true, personName: true, announcement: { select: { title: true } } } });
      if (!row || row.status !== 'REVIEW') throw new ChatError(404, 'This delivery no longer needs attention.');
      changed = (await tx.chatAnnouncementDelivery.updateMany({ where: { id, status: 'REVIEW', reviewResolvedAt: null }, data })).count;
      personName = row.personName; title = row.announcement.title;
    }
    if (changed) await tx.auditEvent.create({ data: { occurredAt: now, action: 'chat.email.review_resolve', success: true, statusCode: 200,
      actorUserId: userId, actorLabel: viewer.user.name, targetType: 'chat', targetId: id,
      metadata: { kind: type === 'reminder' ? 'Unread reminder' : 'Announcement email', personName, ...(title ? { title } : {}) } } });
    return { resolved: true };
  }, { timeout: 15_000 });
}

export type ReminderOutcome = 'Email sent' | 'Preview saved' | 'Needs review';
/** Audit record for one reminder email: who, how many unread, the outcome.
 * Always a completed record: "Needs review" means the outcome is uncertain,
 * not that the email failed, and the outcome field says which. */
export function reminderEmailAudit(deliveryId: string, personName: string, unreadCount: number, outcome: ReminderOutcome, at: Date): Prisma.AuditEventCreateInput {
  return { occurredAt: at, action: 'chat.unread_reminder.email', success: true, statusCode: 200, actorLabel: 'Email reminders',
    targetType: 'chat', targetId: deliveryId, metadata: { personName, unreadCount, outcome } };
}
