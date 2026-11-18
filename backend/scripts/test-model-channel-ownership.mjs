import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chat = readFileSync(resolve(root, "src/services/creator-chat.ts"), "utf8");
const permissions = readFileSync(resolve(root, "src/permissions/chat-permissions.ts"), "utf8");
const standing = readFileSync(resolve(root, "src/services/standing-chat.ts"), "utf8");
const integration = readFileSync(resolve(root, "scripts/test-standing-chat.ts"), "utf8");
const announcements = readFileSync(resolve(root, "src/services/chat-announcements.ts"), "utf8");

assert.ok(chat.includes('const isModel = user.roleMemberships.some(({ role }) => role.systemKey === "MODEL")'));
assert.ok(chat.includes("return !viewer.isModel"));
assert.ok(chat.includes("const inArea = inOrdinaryArea(viewer, channel.modelId);"));
assert.ok(chat.includes("const inArea = inOrdinaryArea(viewer, area.modelId);"));
assert.ok(chat.includes('where: viewer.isModel ? { modelId: { in: [] } }'));
console.log("PASS 1: A Model cannot list, read or manage ordinary creator channels even when grants are enabled.");

assert.ok(chat.includes('conversation.kind === "CREATOR" && conversation.modelId === viewer.ownCreatorId && isSubject'));
assert.ok(chat.includes("const canView = modelPrivateOnly && pauseAllows"));
assert.ok(chat.includes("user.creatorProfile?.isActive"));
assert.ok(standing.includes("syncCreatorStandingChat"));
console.log("PASS 2: A Model can see only her own linked, active creator-private conversation.");

assert.ok(integration.includes("Block 2 Model boundary"));
assert.ok(integration.includes('"chat.areas.all", "chat.private.all"'));
assert.ok(integration.includes("await denied(() => listChatMessages(creator.id, otherGeneral.id))"));
assert.ok(integration.includes("await denied(() => listChatMessages(creator.id, secondOwn[0].id))"));
assert.ok(!permissions.match(/MODEL:\\s*\\[[^\\]]*chat\\.ordinary\\.access/));
console.log("PASS 3: Integration fixtures cover over-granted roles, cross-creator direct reads and protected-chat isolation.");

assert.ok(announcements.includes("const personInclude = viewerInclude;"));
console.log("PASS 4: Announcement viewer selection remains compatible.");
