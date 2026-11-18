import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const chat = readFileSync(resolve(root, "src/services/creator-chat.ts"), "utf8");
const permissions = readFileSync(resolve(root, "src/permissions/chat-permissions.ts"), "utf8");
const standing = readFileSync(resolve(root, "src/services/standing-chat.ts"), "utf8");

assert.ok(chat.includes("creatorProfile: { select: { id: true, isActive: true } }"));
assert.ok(chat.includes('role.systemKey === "MODEL"'));
assert.ok(chat.includes("user.creatorProfile?.isActive"));
assert.ok(chat.includes("viewer.ownCreatorId === modelId"));
assert.ok(chat.includes('viewer.permissions.has("chat.ordinary.access")'));
assert.ok(chat.includes('viewer.permissions.has("chat.access")'));
console.log("PASS 1: Linked active Model profile grants only its own ordinary creator area, subject to saved Chat permissions.");

assert.ok(chat.includes("const inArea = inOrdinaryArea(viewer, channel.modelId);"));
assert.ok(chat.includes("const inArea = inOrdinaryArea(viewer, area.modelId);"));
assert.ok(chat.includes("...(viewer.ownCreatorId ? [viewer.ownCreatorId] : [])"));
assert.ok(chat.includes('p.has("chat.channels.all") || grants.some'));
assert.ok(chat.includes('p.has("chat.channels.post_all") || grants.some'));
assert.ok(chat.includes('viewer.user.chatQuarantines.some((q) => q.modelId === modelId)'));
console.log("PASS 2: Area listing and direct channel reads share scoped access; channel viewing, posting and pause restrictions remain.");

assert.ok(chat.includes('const reviewer = assigned && ((conversation.kind === "STAFF"'));
assert.ok(chat.includes('const isSubject = viewer.user.id === conversation.subjectUserId'));
assert.ok(standing.includes("syncCreatorStandingChat"));
assert.ok(!permissions.match(/MODEL:\s*\[[^\]]*chat\.ordinary\.access/));
console.log("PASS 3: Private-chat membership and Model defaults are not broadened or reset.");
const announcements = readFileSync(resolve(root, "src/services/chat-announcements.ts"), "utf8");
assert.ok(announcements.includes("const personInclude = viewerInclude;"));
assert.ok(!announcements.includes("creatorProfile: { select: { id: true } }"));
console.log("PASS 4: Announcement recipients preserve the complete shared viewer selection.");

