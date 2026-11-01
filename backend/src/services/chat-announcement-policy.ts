import { CHAT_STAGING_PROJECT_ID, CHAT_STAGING_ENVIRONMENT_ID } from './chat-staging-target.js';

export function announcementsEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.BLOCK2_CHAT_ENABLED !== 'true' || env.BLOCK2_ANNOUNCEMENTS_ENABLED !== 'true' ||
    /^prod(uction)?$/i.test(env.RAILWAY_ENVIRONMENT_NAME ?? '') || env.RAILWAY_ENVIRONMENT_ID === '2b6bb1b6-a75a-45b1-98cf-f98e79a965a4') return false;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) return env.RAILWAY_PROJECT_ID === CHAT_STAGING_PROJECT_ID && env.RAILWAY_ENVIRONMENT_ID === CHAT_STAGING_ENVIRONMENT_ID;
  try { return env.NODE_ENV === 'test' && ['localhost','127.0.0.1','[::1]'].includes(new URL(env.DATABASE_URL ?? '').hostname); } catch { return false; }
}
export function announcementEmailMode() {
  if (!announcementsEnabled()) return 'off';
  return process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE === 'capture' ? 'capture' : process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE === 'gmail' ? 'gmail' : 'off';
}
