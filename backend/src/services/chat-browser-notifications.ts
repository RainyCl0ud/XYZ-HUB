import { prisma } from '../lib/prisma.js';
import { ChatError } from './creator-chat.js';
import { notificationUnreadScope } from './chat-notification-scope.js';
import { CHAT_STAGING_PROJECT_ID, CHAT_STAGING_ENVIRONMENT_ID } from './chat-staging-target.js';

export function browserNotificationsEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.BLOCK2_CHAT_ENABLED !== 'true' || env.BLOCK2_BROWSER_NOTIFICATIONS_ENABLED !== 'true' || /^prod(uction)?$/i.test(env.RAILWAY_ENVIRONMENT_NAME ?? '') || env.RAILWAY_ENVIRONMENT_ID === '2b6bb1b6-a75a-45b1-98cf-f98e79a965a4') return false;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) return env.RAILWAY_PROJECT_ID === CHAT_STAGING_PROJECT_ID && env.RAILWAY_ENVIRONMENT_ID === CHAT_STAGING_ENVIRONMENT_ID;
  try { return env.NODE_ENV === 'test' && ['localhost', '127.0.0.1', '[::1]'].includes(new URL(env.DATABASE_URL ?? '').hostname); } catch { return false; }
}

/** Read-only discovery/final recheck. No transcript, directory, email, read write,
 * subscription or provider endpoint is exposed by the browser-alert API. */
export async function browserNotificationFeed(userId: string, after?: string, ids?: string[]) {
  if (!browserNotificationsEnabled()) throw new ChatError(404, 'Browser notifications are not available.');
  return prisma.$transaction(async tx => {
    const current = await notificationUnreadScope(tx, userId);
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const since = after ? new Date(after) : now;
    if (!Number.isFinite(since.getTime()) || since > now) throw new ChatError(400, 'Refresh notification settings and try again.');
    // Open-tab alerts are for recent activity, not a replay of an old backlog.
    const cutoff = new Date(Math.max(since.getTime(), now.getTime() - 5 * 60_000));
    const messages = after ? await tx.chatMessage.findMany({ where: { AND: [current.where, { createdAt: { gte: cutoff, lte: now } }, ...(ids ? [{ id: { in: ids } }] : [])] }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 50, select: { id: true, channelId: true, conversationId: true } }) : [];
    return { enabled: true, userId, serverTime: now.toISOString(), limitedScope: current.limited,
      messages: messages.map(m => ({ id: m.id, conversationId: m.channelId ?? m.conversationId! })) };
  });
}
