import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const ui = readFileSync(resolve(root, "src/pages/ChatChannelSettings.tsx"), "utf8");
const server = readFileSync(resolve(root, "../backend/src/services/creator-chat.ts"), "utf8");
const css = readFileSync(resolve(root, "src/pages/ChatPage.css"), "utf8");

assert.ok(ui.includes('const ACCESS_LABEL: Record<Level, string> = { none: "No access", view: "Can see", post: "Can post" };'));
assert.ok(!ui.includes("No individual grant") && !ui.includes("No role grant") && !ui.includes(">See</option>") && !ui.includes(">Post</option>"));
assert.ok(!ui.includes("Can send</option>"));
assert.ok(!ui.includes("Can view</option>"));
console.log("PASS 1: Channel role and member selectors say No access / Can see / Can post.");

assert.ok(ui.includes('levelOf(kind === "Role" ? option.siteWideAccess : option.inheritedAccess)'), "A member's role access (or a role's all-channel access) is the minimum shown");
assert.ok(ui.includes("const current: Level = LEVEL[own] > LEVEL[floor] ? own : floor;"), "The menu shows the access they actually have");
assert.ok(ui.includes("disabled={LEVEL[level] < LEVEL[floor]}") && ui.includes('const locked = floor === "post";'), "Choices below role access are unavailable");
assert.ok(ui.includes("LEVEL[value] > LEVEL[floor] ? { canView: true, canPost: value === \"post\" } : { canView: false, canPost: false }"), "Saving the minimum clears an extra grant");
assert.ok(ui.includes("From their role: ") && ui.includes("you can give a member more access here, not less"));
assert.ok(server.includes("inheritedAccess: { canView: roleAccess.canView, canPost: roleAccess.canPost }"));
assert.ok(server.includes("channelAccess(makeViewer(a.user), { ...channel, personGrants: [] })"));
assert.ok(server.includes('select: { id: true, user: { include: viewerInclude } }'));
assert.ok(!server.includes("user: { select: { id: true, name: true, ...viewerInclude } }"));
console.log("PASS 2: Member and role menus show real access, with role access as a minimum that can't be lowered.");

assert.ok(server.includes('p.has("chat.channels.all") || grants.some((g) => g.canView || g.canPost)'));
assert.ok(server.includes('p.has("chat.channels.post_all") || grants.some((g) => g.canPost)'));
console.log("PASS 3: Backend most-generous grant rules remain unchanged.");

assert.ok(ui.indexOf('className="creator-chat-grant-inherited"') < ui.indexOf('className="creator-chat-grant-controls"'));
const grantRowRules = [...css.matchAll(/\.creator-chat \.creator-chat-settings-workspace \.creator-chat-grant-row\s*\{([^}]*)\}/g)].map((match) => match[1]);
assert.ok(grantRowRules.some((rule) => /flex-wrap:\s*wrap\s*;/.test(rule) && /align-items:\s*center\s*;/.test(rule)),
  "Desktop grant rows must wrap and center their controls");
assert.ok(grantRowRules.some((rule) => /flex-direction:\s*column\s*;/.test(rule) && /align-items:\s*stretch\s*;/.test(rule)),
  "Narrow-screen grant rows must stack without squeezing controls");
assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) auto;'));
assert.ok(css.includes('min-width: min(100%, 260px);'));
const selectRules = css.split(".creator-chat .creator-chat-settings-workspace .creator-chat-grant-controls select {")
  .slice(1).map((block) => block.split("}")[0]);
assert.ok(selectRules.some((rule) => /(?:^|\s)width:\s*100%\s*;/.test(rule) && /min-width:\s*0\s*;/.test(rule)),
  "Permission selector must have full available width without overflow");
assert.ok(selectRules.some((rule) => /font-size:\s*16px\s*;/.test(rule)),
  "Mobile selector must retain touch-friendly font sizing");
assert.ok(css.includes('max-width: none;'));
console.log("PASS 4: Member rows keep role access beside the name and give the access selectors responsive full-width controls.");
