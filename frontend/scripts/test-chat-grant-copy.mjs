import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ui = readFileSync(resolve(root, "src/pages/ChatChannelSettings.tsx"), "utf8");
const server = readFileSync(resolve(root, "../backend/src/services/creator-chat.ts"), "utf8");

assert.ok(ui.includes('<option value="view">See</option>'));
assert.ok(ui.includes('<option value="post">Post</option>'));
assert.ok(ui.includes('kind === "Member" ? "No individual grant" : "No role grant"'));
assert.ok(!ui.includes("Can send</option>"));
assert.ok(!ui.includes("Can view</option>"));
console.log("PASS 1: Channel role and member selectors use Block 2 See/Post terminology.");

assert.ok(ui.includes("Role access: {option.inheritedAccess.canPost"));
assert.ok(ui.includes("Role and member grants combine"));
assert.ok(server.includes("inheritedAccess: { canView: roleAccess.canView, canPost: roleAccess.canPost }"));
assert.ok(server.includes("channelAccess(makeViewer(a.user), { ...channel, personGrants: [] })"));
console.log("PASS 2: Member settings show role-derived access separately from named grants.");

assert.ok(server.includes('p.has("chat.channels.all") || grants.some((g) => g.canView || g.canPost)'));
assert.ok(server.includes('p.has("chat.channels.post_all") || grants.some((g) => g.canPost)'));
console.log("PASS 3: Backend most-generous grant rules remain unchanged.");
