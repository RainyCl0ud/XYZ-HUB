import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "./chat-staging-target.js";

export function chatChannelArchiveEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.BLOCK2_CHAT_CHANNEL_ARCHIVE_ENABLED !== "true" || /^prod(uction)?$/i.test(env.RAILWAY_ENVIRONMENT_NAME ?? "")) return false;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) {
    return env.RAILWAY_PROJECT_ID === CHAT_STAGING_PROJECT_ID && env.RAILWAY_ENVIRONMENT_ID === CHAT_STAGING_ENVIRONMENT_ID;
  }
  try {
    const db = new URL(env.DATABASE_URL ?? "");
    return env.NODE_ENV === "test" && ["postgres:", "postgresql:"].includes(db.protocol)
      && ["127.0.0.1", "localhost", "[::1]"].includes(db.hostname);
  } catch {
    return false;
  }
}

export function chatChannelExportEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.BLOCK2_CHAT_CHANNEL_EXPORT_ENABLED === "true" && chatChannelArchiveEnabled(env);
}

export function chatChannelCleanupEnabled(env: Readonly<Record<string, string | undefined>> = process.env) {
  return env.BLOCK2_CHAT_CHANNEL_CLEANUP_ENABLED === "true" && chatChannelExportEnabled(env);
}
