import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { installCreatorChatDefaults, provisionCreatorChat } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { assertChatStagingTarget } from "../src/services/chat-staging-target.js";
import { installClockDefaults, isClockEnabled } from "../src/services/clock.js";

async function main() {
  if (process.argv.includes("--require-staging")) assertChatStagingTarget(process.env);
  const url = new URL(process.env.DATABASE_URL ?? "");
  const local = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname);
  if (/^prod(uction)?$/i.test(process.env.RAILWAY_ENVIRONMENT_NAME ?? "") || process.env.RAILWAY_ENVIRONMENT_ID === "2b6bb1b6-a75a-45b1-98cf-f98e79a965a4") throw new Error("Production chat provisioning is not permitted by this staging rollout.");
  const staging = process.env.RAILWAY_ENVIRONMENT_ID === "fcaded17-5642-4be7-ab42-16a352f6b918";
  if (!local && !staging) throw new Error("Chat provisioning is limited to the isolated local database or the approved Railway staging environment.");
  const models = await prisma.agencyModel.findMany({ select: { id: true } });
  const installed = !!await prisma.chatSetup.findUnique({ where: { id: "ordinary-creator-chat-v1" } });
  console.log(`Creator chat plan: ${models.length} creator areas; defaults ${installed ? "already installed and will be preserved" : "not installed"}.`);
  if (!process.argv.includes("--apply")) { console.log("Preview only. Add --apply to install once and provision missing ordinary channels."); return; }
  await prisma.$transaction((tx) => installCreatorChatDefaults(tx));
  await prisma.$transaction((tx) => installStandingChatDefaults(tx));
  if (isClockEnabled()) {
    await prisma.$transaction((tx) => installClockDefaults(tx));
    console.log("Clock permissions prepared. Existing customisations are preserved on repeat deployments.");
  }
  let created = 0;
  for (const model of models) created += await prisma.$transaction((tx) => provisionCreatorChat(tx, model.id));
  const users = await prisma.user.findMany({ select: { id: true } });
  for (const user of users) await prisma.$transaction((tx) => syncUserStandingChats(tx, user.id));
  console.log(`Provisioning complete: ${created} missing ordinary channels created; standing chats synchronised for ${users.length} accounts. No accounts, assignments, incidents or strikes changed.`);
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Chat provisioning failed."); process.exitCode = 1; }).finally(() => prisma.$disconnect());
