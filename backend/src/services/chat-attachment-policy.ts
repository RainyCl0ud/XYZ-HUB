import { isAbsolute, normalize } from "node:path";
import { CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "./chat-staging-target.js";

export const MAX_CHAT_ATTACHMENT_BYTES = 500_000_000;
const stagingMount = "/data/chat-attachments";

export function chatAttachmentDirectory(env: Readonly<Record<string, string | undefined>> = process.env) {
  if (env.BLOCK2_CHAT_ENABLED !== "true" || env.BLOCK2_CHAT_ATTACHMENTS_ENABLED !== "true") return null;
  if (/^prod(uction)?$/i.test(env.RAILWAY_ENVIRONMENT_NAME ?? "")) return null;
  const directory = env.CHAT_ATTACHMENT_DIRECTORY;
  if (!directory || !isAbsolute(directory)) return null;
  if (env.RAILWAY_PROJECT_ID || env.RAILWAY_ENVIRONMENT_ID) {
    return env.RAILWAY_PROJECT_ID === CHAT_STAGING_PROJECT_ID
      && env.RAILWAY_ENVIRONMENT_ID === CHAT_STAGING_ENVIRONMENT_ID
      && directory === stagingMount && env.RAILWAY_VOLUME_MOUNT_PATH === stagingMount
      ? directory : null;
  }
  if (env.NODE_ENV !== "test" && env.NODE_ENV !== "development") return null;
  try {
    const database = new URL(env.DATABASE_URL ?? "");
    const postgres = database.protocol === "postgresql:" || database.protocol === "postgres:";
    return postgres && ["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ? normalize(directory) : null;
  } catch {
    return null;
  }
}
