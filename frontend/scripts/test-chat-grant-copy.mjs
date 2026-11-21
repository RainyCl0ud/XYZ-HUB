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

assert.ok(ui.includes("const floor = levelOf(member ? option.inheritedAccess : option.siteWideAccess);"), "A member's role access (or a role's all-channel access) is the minimum");
assert.ok(ui.includes("const current: Level = member && option.access ? levelOf(option.access) : LEVEL[own] > LEVEL[floor] ? own : floor;"), "Members show the access they actually have now");
assert.ok(ui.includes('const ceiling: Level = member && option.limit ? levelOf(option.limit) : "post";'), "Choices a grant can't give are capped");
assert.ok(ui.includes("disabled={LEVEL[level] < LEVEL[floor] || LEVEL[level] > LEVEL[ceiling]}") && ui.includes("const locked = LEVEL[floor] >= LEVEL[ceiling];"), "Choices outside what a grant can change are unavailable");
assert.ok(ui.includes("LEVEL[value] > LEVEL[floor] ? { canView: true, canPost: value === \"post\" } : { canView: false, canPost: false }"), "Saving the minimum clears an extra grant");
assert.ok(ui.includes('const covered = own !== "none" && LEVEL[own] <= LEVEL[floor];') && ui.includes("const unused = LEVEL[own] > LEVEL[ceiling];") && ui.includes("const extra = covered || unused;") && ui.includes("const removing = extra && value === current && value === floor;")
  && ui.includes('disabled={busy || !(value !== current || removing)}>{removing ? "Remove extra grant" : "Save"}'), "An extra grant the role already covers can still be removed, even when the menu is locked");
assert.ok(ui.includes('" · also granted here"') && ui.includes('" · unused grant here"') && ui.includes("Can’t post here: their roles don’t allow sending messages.") && ui.includes("blocked by their roles or a Chat pause"));
assert.ok(ui.includes("<GrantRow key={option.id} kind=\"Role\"") && ui.includes("<GrantRow key={option.id} kind=\"Member\"") && !ui.includes("rowKey("), "Rows stay mounted after a save, so keyboard focus stays put");
assert.ok(ui.includes("if (shown !== current) { setShown(current); setValue(current); }"), "Rows follow access changes after a refetch");
assert.ok(server.includes("access: { canView: access.canView, canPost: access.canPost },") && server.includes("limit: { canView: limit.canView, canPost: limit.canPost },"));
assert.ok(server.includes("personGrants: [{ channelId: channel.id, assignmentId: a.id, canView: true, canPost: true }]"), "The limit runs a full grant through the same access rules");
assert.ok(server.includes('limit: { canView: reachable, canPost: reachable && keys.has("chat.messages.send") }'));
assert.ok(ui.includes("From their role: ") && ui.includes("you can give a member more access here, not less"));
assert.ok(server.includes("inheritedAccess: { canView: roleAccess.canView, canPost: roleAccess.canPost }"));
assert.ok(server.includes("const roleAccess = channelAccess(person, { ...channel, personGrants: [] });"));
assert.ok(server.includes('select: { id: true, user: { include: viewerInclude } }'));
assert.ok(!server.includes("user: { select: { id: true, name: true, ...viewerInclude } }"));
console.log("PASS 2: Member and role menus show real access, with role access as a minimum that can't be lowered.");

assert.ok(server.includes('p.has("chat.channels.all") || grants.some((g) => g.canView || g.canPost)'));
assert.ok(server.includes('p.has("chat.channels.post_all") || grants.some((g) => g.canPost)'));
console.log("PASS 3: Backend most-generous grant rules remain unchanged.");

const inheritedAt = ui.indexOf('className={floor === "none" ? undefined : "creator-chat-grant-inherited"}');
const controlsAt = ui.indexOf('className="creator-chat-grant-controls"');
assert.ok(inheritedAt > 0 && controlsAt > inheritedAt, "Role access sits beside the name, before the controls");
assert.ok(css.includes(".creator-chat .creator-chat-settings-workspace .creator-chat-grant-note {"));
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
