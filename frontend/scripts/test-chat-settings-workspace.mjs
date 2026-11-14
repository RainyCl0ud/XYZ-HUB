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

console.log(`${count} Channel Settings workspace regression groups passed.`);
