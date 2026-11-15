import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = (path) => readFile(resolve(root, path), "utf8");
const [page, settings, css] = await Promise.all([
  source("src/pages/ChatPage.tsx"),
  source("src/pages/ChatChannelSettings.tsx"),
  source("src/pages/ChatPage.css"),
]);
let count = 0;
function pass(message) { console.log(`PASS ${++count}: ${message}`); }

assert.ok(settings.includes('<section ref={workspace} tabIndex={-1}'), "Channel settings must use a native page section.");
assert.ok(settings.includes('role="region" aria-labelledby="chat-settings-title"'));
assert.ok(settings.includes('className={`creator-chat-settings creator-chat-channel-settings creator-chat-settings-workspace'));
assert.ok(!settings.includes("<dialog"), "Do not reintroduce the Channel Settings modal.");
assert.ok(!settings.includes("showModal"), "Channel Settings must not enter the browser top layer.");
assert.ok(!settings.includes("::backdrop"), "Channel Settings must not use modal backdrop behavior.");
pass("Channel Settings is an accessible, non-modal view in the Chat workspace.");

assert.ok(page.includes('settings ? "is-settings" : ""'), "Chat shell must explicitly enter a settings layout.");
assert.ok(page.includes('className="creator-chat-conversation"'), "Keep the original conversation component mounted.");
const settingsIndex = page.indexOf("{settings && <ChatChannelSettings");
const membersIndex = page.indexOf('<aside id="chat-members"');
const shellIndex = page.indexOf('className={`creator-chat-shell');
assert.ok(shellIndex >= 0 && settingsIndex > shellIndex && membersIndex > settingsIndex);
assert.equal(page.slice(membersIndex).includes("{settings && <ChatChannelSettings"), false,
  "Settings must render inside the shell before the Members rail, not as an overlay.");
pass("Settings occupies the conversation workspace without replacing global AppLayout.");

assert.ok(css.includes(".creator-chat .creator-chat-shell.is-settings > .creator-chat-conversation,"));
assert.ok(css.includes(".creator-chat .creator-chat-shell.is-settings > .creator-chat-members,"));
assert.ok(css.includes(".creator-chat .creator-chat-shell.is-settings > .creator-chat-settings-workspace"));
assert.ok(css.includes("grid-column: 2 / -1"));
assert.ok(css.includes("max-height: none;"));
assert.ok(css.includes("box-shadow: none;"));
pass("Settings hides the conversation and members rail without changing their normal layout.");

assert.ok(settings.includes('className="creator-chat-settings-back" onClick={onClose} disabled={busy}'));
assert.ok(settings.includes("Back to conversations"));
assert.ok(settings.includes("Back to #"));
assert.ok(page.includes("function openConversation(id: string) {"));
assert.ok(page.includes('setSettings(null);'), "Back and channel navigation must close settings.");
assert.ok(page.includes("function openChannelSettings(next:"));
assert.ok(page.includes("setShowMembers(false)"));
assert.ok(page.includes("setShowChannels(false)"));
assert.ok(page.includes("setShowComposerMenu(false)"));
pass("Back, same-channel selection and New channel navigation restore Chat and close transient menus.");

assert.ok(settings.includes('aria-pressed={activeTab === "details"}'));
assert.ok(settings.includes('aria-pressed={activeTab === "access"}'));
assert.ok(settings.includes("creator-chat-settings-layout"));
assert.ok(settings.includes("creator-chat-settings-main"));
assert.ok(css.includes("grid-template-columns: 180px minmax(0, 1fr)"));
assert.ok(css.includes("overflow-y: auto;"));
assert.ok(css.includes("overscroll-behavior: contain;"));
pass("Overview and Permissions are a navigable workspace with independent manual scrolling.");

assert.ok(settings.includes("matchingRoles.map"));
assert.ok(settings.includes("matchingPeople.map"));
assert.ok(settings.includes('method: "PUT"'));
assert.ok(settings.includes('method: "PATCH"'));
assert.ok(settings.includes('method: "POST"'));
assert.ok(settings.includes("Confirm archive"));
assert.ok(settings.includes("!confirmArchive || busy"));
assert.ok(settings.includes('setConfirmArchive(false)'));
pass("Channel creation, renaming, grants and two-step archive confirmation remain connected.");

assert.ok(css.includes('@media (max-width: 720px)'));
assert.ok(css.includes(".creator-chat .creator-chat-shell.is-settings > .creator-chat-channels,"));
assert.ok(css.includes("flex-direction: column;"));
assert.ok(css.includes("touch-action: pan-y"));
assert.ok(css.includes(".creator-chat .creator-chat-settings-workspace .creator-chat-settings-tabs button"));
assert.ok(css.includes(".creator-chat-members-list::-webkit-scrollbar { display: none; }"));
assert.ok(css.includes("grid-template-columns: clamp(232px, 18vw, 294px) minmax(0, 1fr) clamp(236px, 19vw, 290px)"));
pass("Mobile Settings stays in Chat, and desktop Members scrolling stays unchanged when Chat is open.");

assert.ok(settings.includes('className="creator-chat-settings-subnav" role="group" aria-label="Permission categories"'));
assert.ok(settings.includes('aria-controls="chat-settings-permission-children"'));
assert.ok(settings.includes('aria-expanded={accessExpanded}'));
assert.ok(settings.includes('setAccessCategory("roles")'));
assert.ok(settings.includes('setAccessCategory("people")'));
assert.ok(settings.includes('accessCategory === "roles" ? ('));
assert.ok(settings.includes('matchingRoles.map'));
assert.ok(settings.includes('matchingPeople.map'));
assert.ok(settings.includes('kind="Member"'), "Individual grants should be presented as Members.");
pass("Permissions expand into separate accessible Role and Member child views.");

assert.ok(settings.includes('className="creator-chat-settings-back" onClick={onClose} disabled={busy}'));
assert.ok(settings.includes('<span className="creator-chat-settings-back-icon" aria-hidden="true">←</span>'));
assert.ok(!settings.includes('<span>Back to Chat</span>'), "Back button must remain icon-only.");
assert.ok(settings.includes('aria-label={target.channelId ? `Back to #${target.name} conversation` : "Back to conversations"}'));
assert.ok(css.includes('width: 42px;'));
assert.ok(css.includes('height: 42px;'));
assert.ok(!css.includes('.creator-chat-settings-back > span:last-child'), "No obsolete text-button layout rules.");
assert.ok(css.includes('/* Channel Settings: exact XYZ Hub visual language.'));
assert.ok(css.includes('background: #141414;'));
assert.ok(css.includes('background: #0D0D0D;'));
assert.ok(css.includes('border-radius: 0;'));
assert.ok(css.includes('.creator-chat .creator-chat-settings-workspace .creator-chat-settings-nav-group'));
assert.ok(css.includes('.creator-chat .creator-chat-settings-workspace .creator-chat-settings-subnav'));
for (const legacyAccent of ["#554348", "#272326", "#8F6A71", "#3C3034", "#FAF7F8", "#765A60", "#30282B", "#52604F", "#E7F1E5"]) {
  assert.ok(!css.includes(legacyAccent), "Unexpected previous colored Settings accent: " + legacyAccent);
}
pass("Settings match the square-corner, neutral-black/white Hub theme with a visible Back control.");

assert.ok(settings.includes('<section className="creator-chat-settings-section creator-chat-settings-details" aria-label="Channel name">'));
assert.ok(!settings.includes('Channel details'), "Overview must not repeat a redundant heading.");
assert.ok(!settings.includes('Use a short name that your team can recognize easily.'), "Unneeded helper copy should be removed.");
assert.ok(settings.includes('<label htmlFor="chat-channel-name">Channel name</label>'));
assert.ok(css.includes('.creator-chat .creator-chat-settings-workspace .creator-chat-settings-details {'));
assert.ok(css.includes('border-bottom: 1px solid #333333;'));
pass("Overview is reduced to one accessible channel-name field with flat styling.");

assert.ok(css.includes('.creator-chat .creator-chat-settings-workspace .creator-chat-settings-nav-group,'));
assert.ok(css.includes('.creator-chat .creator-chat-settings-workspace .creator-chat-settings-tabs button:focus-visible,'));
assert.ok(css.includes('outline-offset: -3px;'));
assert.ok(css.includes('appearance: none;'));
assert.ok(css.includes('border-radius: 0;'));
assert.ok(css.includes('box-shadow: none;'));
pass("Navigation and keyboard focus retain square corners without a rounded focus frame.");

console.log(`${count} Channel Settings workspace regression groups passed.`);
