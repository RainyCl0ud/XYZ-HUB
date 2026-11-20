import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { loadViewer, ChatError } from './creator-chat.js';
import { notificationUnreadScope } from './chat-notification-scope.js';
import { singleEmailAddress } from './chat-announcements.js';
import { unreadRemindersEnabled, unreadReminderEmailMode } from './chat-unread-reminder-policy.js';
import { renderBrandedTransactionalEmail } from './transactional-email-template.js';
import type { TransactionalEmail } from './email-delivery.js';

export const REMINDER_HOUR_MS = 3_600_000;
export const REMINDER_AGE_MS = 1_800_000;
export async function reminderClock(tx: Prisma.TransactionClient) {
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
  return now;
}
export async function lockReminderPerson(tx: Prisma.TransactionClient, userId: string) {
  // Take the existing Chat access lock first, matching read/quarantine ordering.
  const viewer = await loadViewer(tx, userId);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'chat-unread-reminder:' + userId}, 0))`;
  return viewer;
}

/** Badges count all accessible messages; email follows the narrower, confirmed
 * role exception. A role grant or all-channel oversight is not a named add. */
export async function reminderSnapshot(tx: Prisma.TransactionClient, userId: string) {
  const { viewer, limited, where } = await notificationUnreadScope(tx, userId);
  // A staff announcement already sends its own email (brief 6.1) and appears
  // in the header bell, so its posts never count toward an unread reminder.
  const aggregate = await tx.chatMessage.aggregate({ where: { AND: [where, { announcementKey: null }] }, _count: { id: true }, _min: { createdAt: true } });
  const now = await reminderClock(tx);
  const count = aggregate._count.id, oldestAt = aggregate._min.createdAt;
  return { person: viewer.user, count, oldestAt, now, limited, due: !!oldestAt && oldestAt.getTime() <= now.getTime() - REMINDER_AGE_MS };
}

export function buildUnreadReminderEmail(address: string, count: number): TransactionalEmail {
  if (!singleEmailAddress(address) || !Number.isSafeInteger(count) || count < 1) throw new Error('A valid individual recipient and unread count are required.');
  const base = new URL(process.env.FRONTEND_URL ?? '');
  if (!['https:', ...(process.env.NODE_ENV === 'test' ? ['http:'] : [])].includes(base.protocol) || base.username || base.password) throw new Error('A valid Hub URL is required.');
  const url = new URL('/chat', base).href;
  const summary = `You have ${count} unread ${count === 1 ? 'message' : 'messages'} in the Hub.`;
  return { to: address, subject: 'Unread messages in the XYZ Hub', text: `${summary}\n\nOpen the Hub:\n${url}`,
    html: renderBrandedTransactionalEmail({ eyebrow: 'Unread messages', preheader: summary, title: 'Unread messages', intro: summary, action: { label: 'Open the Hub', url } }) };
}

export async function unreadReminderHistory(userId: string) {
  if (!unreadRemindersEnabled()) throw new ChatError(404, 'Email reminders are not available.');
  return prisma.$transaction(async tx => {
    const current = await reminderSnapshot(tx, userId);
    const [state, deliveries] = await Promise.all([
      tx.chatUnreadReminderState.findUnique({ where: { userKey: userId } }),
      tx.chatUnreadReminder.findMany({ where: { userId, userKey: userId }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 10, select: { id: true, status: true, unreadCount: true, createdAt: true, completedAt: true, previewEmail: true, lastError: true } }),
    ]);
    return { emailMode: unreadReminderEmailMode(), eligibleUnread: current.count, limitedScope: current.limited,
      oldestUnreadAt: current.oldestAt, nextReminderAfter: state?.lastAttemptAt ? new Date(state.lastAttemptAt.getTime() + REMINDER_HOUR_MS) : null,
      deliveries };
  });
}

/** Owners only: whether the Chat menu offers the email reminder log. Chat
 * calls /areas on every refresh, so this is one plain query, not a viewer
 * transaction; the log endpoint itself rechecks access in full. */
export async function canViewUnreadReminderLog(userId: string) {
  if (!unreadRemindersEnabled()) return false;
  return (await prisma.user.count({ where: { id: userId, status: 'ACTIVE', roleMemberships: { some: { role: { systemKey: 'OWNER', archivedAt: null } } } } })) > 0;
}

type StoredPreview = { to?: unknown; subject?: unknown; text?: unknown } | null;
/** Only what the log shows: never the HTML body, and no address once the
 * account has been deleted. */
function previewForLog(value: Prisma.JsonValue | null, recipientExists: boolean) {
  const stored = (value && typeof value === 'object' && !Array.isArray(value) ? value : null) as StoredPreview;
  if (!stored) return null;
  return { to: recipientExists && typeof stored.to === 'string' ? stored.to : 'Address removed with the account',
    subject: typeof stored.subject === 'string' ? stored.subject : '', text: typeof stored.text === 'string' ? stored.text : '' };
}

/** Owner-only delivery log across all staff: status, count, time and the
 * stored count/link-only preview. Staff no longer see a reminder screen;
 * their reminder simply arrives by email after 30 minutes unread. */
export async function unreadReminderLog(userId: string, before?: string) {
  if (!unreadRemindersEnabled()) throw new ChatError(404, 'Email reminders are not available.');
  return prisma.$transaction(async tx => {
    if (!(await loadViewer(tx, userId)).isOwner) throw new ChatError(403, 'Only Owners can view the email reminder log.');
    const anchor = before ? await tx.chatUnreadReminder.findUnique({ where: { id: before }, select: { id: true, createdAt: true } }) : null;
    if (before && !anchor) throw new ChatError(400, 'The reminder log changed. Reopen it to refresh.');
    const rows = await tx.chatUnreadReminder.findMany({
      where: anchor ? { OR: [{ createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } }] } : {},
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 21,
      select: { id: true, status: true, unreadCount: true, createdAt: true, completedAt: true, previewEmail: true, lastError: true, recipient: { select: { name: true } } },
    });
    return {
      emailMode: unreadReminderEmailMode(),
      deliveries: rows.slice(0, 20).map(({ recipient, previewEmail, ...row }) => ({ ...row, personName: recipient?.name ?? 'Deleted account', previewEmail: previewForLog(previewEmail, !!recipient) })),
      nextBefore: rows.length > 20 ? rows[19].id : null,
    };
  });
}
