import assert from "node:assert/strict";
import { assertChatStagingTarget, CHAT_STAGING_ENVIRONMENT_ID, CHAT_STAGING_PROJECT_ID } from "../src/services/chat-staging-target.js";
const safe = { RAILWAY_PROJECT_ID: CHAT_STAGING_PROJECT_ID, RAILWAY_ENVIRONMENT_ID: CHAT_STAGING_ENVIRONMENT_ID, RAILWAY_ENVIRONMENT_NAME: "Staging", BLOCK2_CHAT_ENABLED: "true", DATABASE_URL: "postgresql://unused:unused@postgres.railway.internal:5432/railway" };
assert.doesNotThrow(() => assertChatStagingTarget(safe));
for (const override of [
  { RAILWAY_PROJECT_ID: "another-project" }, { RAILWAY_ENVIRONMENT_ID: "production-id" },
  { RAILWAY_ENVIRONMENT_NAME: "Production" }, { RAILWAY_ENVIRONMENT_NAME: "prod" },
  { BLOCK2_CHAT_ENABLED: "false" }, { BLOCK2_CHAT_ENABLED: undefined },
  { DATABASE_URL: undefined }, { DATABASE_URL: "not a database URL" },
  { DATABASE_URL: "https://example.test/data" }, { DATABASE_URL: "postgresql://localhost/" },
]) assert.throws(() => assertChatStagingTarget({ ...safe, ...override }));
console.log("Passed: staging target accepted; wrong project, wrong environment, Production, disabled flag and invalid database references refused before migrations.");
