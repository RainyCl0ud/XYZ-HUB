export const CHAT_STAGING_PROJECT_ID = "ab7b0db3-e123-4d63-9048-49c4c35c112a";
export const CHAT_STAGING_ENVIRONMENT_ID = "fcaded17-5642-4be7-ab42-16a352f6b918";

/** Runs before migrations in the staging pre-deploy command. No database or
 * credential is read through the network until this guard has passed. */
export function assertChatStagingTarget(environment: Readonly<Record<string, string | undefined>>) {
  if (environment.RAILWAY_PROJECT_ID !== CHAT_STAGING_PROJECT_ID || environment.RAILWAY_ENVIRONMENT_ID !== CHAT_STAGING_ENVIRONMENT_ID || /^prod(uction)?$/i.test(environment.RAILWAY_ENVIRONMENT_NAME ?? "")) {
    throw new Error("Refusing chat rollout: this command is restricted to the approved XYZ Hub Staging environment. No migration or chat setup has run.");
  }
  if (environment.BLOCK2_CHAT_ENABLED !== "true") throw new Error("Set BLOCK2_CHAT_ENABLED=true on the Staging Backend before preparing chat.");
  let database: URL;
  try { database = new URL(environment.DATABASE_URL ?? ""); } catch { throw new Error("The Staging Backend needs a valid Postgres DATABASE_URL reference."); }
  if (!["postgres:", "postgresql:"].includes(database.protocol) || !database.hostname || !database.pathname || database.pathname === "/") throw new Error("The Staging Backend needs a valid Postgres DATABASE_URL reference.");
}
