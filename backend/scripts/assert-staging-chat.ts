import { assertChatStagingTarget } from "../src/services/chat-staging-target.js";
try {
  assertChatStagingTarget(process.env);
  console.log("Confirmed XYZ Hub Staging. Database migration and idempotent chat setup may proceed.");
} catch (error) {
  console.error(error instanceof Error ? error.message : "Staging chat guard failed.");
  process.exitCode = 1;
}
