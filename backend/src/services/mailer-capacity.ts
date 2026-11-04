import { createHash } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { announcementEmailMode } from './chat-announcement-policy.js';
import { unreadReminderEmailMode } from './chat-unread-reminder-policy.js';

export class MailerCapacityUnavailable extends Error {}
const positive = (key: string) => { const value = Number(process.env[key]); return Number.isSafeInteger(value) && value > 0 ? value : null; };
export function chatMailerCapacityConfig() {
  const hour = positive('CHAT_EMAIL_HOURLY_CAP'), day = positive('CHAT_EMAIL_DAILY_CAP');
  const hourReserve = positive('CHAT_EMAIL_AUTH_HOURLY_RESERVE'), dayReserve = positive('CHAT_EMAIL_AUTH_DAILY_RESERVE');
  if (!hour || !day || !hourReserve || !dayReserve || hourReserve >= hour || dayReserve >= day || hour > day || !process.env.GOOGLE_WORKSPACE_USER?.trim()) return null;
  return { hour, day, hourReserve, dayReserve, senderKey: createHash('sha256').update(process.env.GOOGLE_WORKSPACE_USER.trim().toLowerCase()).digest('hex') };
}
/** Off/capture never changes authentication delivery. Gmail notifications are
 * fail-closed until a shared sender budget and authentication reserve are set. */
export async function reserveMailerCapacity(category: 'AUTH' | 'CHAT_ANNOUNCEMENT' | 'CHAT_UNREAD') {
  const announcements = announcementEmailMode() === 'gmail', unread = unreadReminderEmailMode() === 'gmail';
  if (category === 'AUTH' ? !announcements && !unread : category === 'CHAT_ANNOUNCEMENT' ? !announcements : !unread) {
    if (category === 'AUTH') return;
    throw new MailerCapacityUnavailable('Chat email delivery is not enabled.');
  }
  const config = chatMailerCapacityConfig();
  if (!config) { if (category === 'AUTH') return; throw new MailerCapacityUnavailable('Configure the shared mailer capacity and authentication reserve first.'); }
  await prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'mailer-capacity:' + config.senderKey}, 0))`;
    const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS now`;
    const hour = await tx.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: new Date(now.getTime()-3600000) } } });
    const day = await tx.mailerCapacityReservation.count({ where: { senderKey: config.senderKey, createdAt: { gte: new Date(now.getTime()-86400000) } } });
    const isAuth = category === 'AUTH';
    if (hour >= config.hour - (isAuth ? 0 : config.hourReserve) || day >= config.day - (isAuth ? 0 : config.dayReserve)) throw new MailerCapacityUnavailable('Shared mailer capacity is reserved for sign-in and account recovery.');
    await tx.mailerCapacityReservation.create({ data: { category, senderKey: config.senderKey, createdAt: now } });
  });
}
