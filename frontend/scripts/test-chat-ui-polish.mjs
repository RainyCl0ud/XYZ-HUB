import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
async function read(path) { return readFile(resolve(root, path), "utf8"); }
const [page, tools, settings, css, service, routes] = await Promise.all([
  read("frontend/src/pages/ChatPage.tsx"),
  read("frontend/src/pages/ChatMessageTools.tsx"),
  read("frontend/src/pages/ChatChannelSettings.tsx"),
  read("frontend/src/pages/ChatPage.css"),
  read("backend/src/services/creator-chat.ts"),
  read("backend/src/routes/chat.ts"),
]);
let passed = 0;
const pass = (label) => console.log("PASS " + (++passed) + ": " + label);

assert.ok(!page.includes("TEAM COMMUNICATION"));
assert.ok(!page.includes('<h1 id="chat-page-title">Chat</h1>'));
assert.ok(page.includes('aria-label="Chat workspace"'));
assert.ok(page.includes('{canAnnounce && <header className="creator-chat-heading"'));
pass("No redundant Chat or Team communication heading; secondary actions remain available.");

assert.ok(page.includes('<div className="creator-chat-channel-title"><h2>{channel?.name'));
assert.ok(page.includes('creator-chat-title-icon'));
assert.ok(!page.includes('Emily Carter · Channel'));
assert.ok(!page.includes(' · {channel?.isPrivate ? "Private chat" : "Channel"}'));
pass("Conversation header displays only the name next to the existing channel or private icon.");

assert.ok(page.includes('aria-label="Pinned messages"'));
assert.ok(page.includes('<span>Search</span>'));
assert.ok(page.includes('aria-controls="chat-discovery-panel"'));
assert.ok(page.includes('creator-chat-live-panel-anchor'));
assert.ok(page.includes('inline={inlineDiscoveryOpen}'));
assert.ok(tools.includes('className={`creator-chat-live-panel creator-chat-tools ${target.kind === "pins" ? "is-pins" : "is-search"}`}'));
assert.ok(tools.includes('return inline'));
pass("Search and Pins open anchored, in-context flyouts rather than modal dialogs.");

assert.ok(tools.includes('if (inline) { searchInput.current?.focus(); return; }'));
assert.ok(tools.includes('element?.showModal()'), "Protected deleted/history tools still use a dialog.");
assert.ok(tools.includes('setTimeout(() => {'));
assert.ok(tools.includes('setSubmitted({ q: text, scope })'));
assert.ok(tools.includes('}, 400)'));
assert.ok(tools.includes('function invalidateSearch()'));
assert.ok(tools.includes('invalidateSearch(); setQuery(e.target.value)'));
assert.ok(tools.includes('invalidateSearch(); setScope(e.target.value)'));
assert.ok(!tools.includes('    // Clear the previous query immediately so its polling request is aborted'),
  "Search invalidation must happen in input callbacks, not synchronously within the debounce effect.");
assert.ok(tools.includes('controller.abort()'));
assert.ok(tools.includes('scope === "conversation"') || tools.includes('submitted.scope === "conversation"'));
pass("Debounced live search preserves cancellable, permission-checked requests and both scopes.");

assert.ok(page.includes('document.addEventListener("pointerdown", outside)'));
assert.ok(page.includes('document.addEventListener("keydown", escape)'));
assert.ok(page.includes('target.closest(".creator-chat-action-popover")'));
assert.ok(page.includes('target.closest("dialog[open]")'));
assert.ok(page.includes('setTools(null);'));
assert.ok(!page.includes('setToolsNotice'), "Action confirmations use one global toast");
assert.ok(tools.includes('onKeyDown={(event) => { if (event.key === "Escape")'));
assert.ok(page.includes('setTools(null); setDeleting(null)'));
pass("Flyouts dismiss on outside click, Escape and channel change without changing message actions.");

assert.ok(page.includes('className="creator-chat-member-identity"'));
assert.ok(page.includes('className="creator-chat-member-role"'));
assert.ok(page.includes('<UserAvatar name={m.name}'));
assert.ok(!page.includes('m.canPost ? "Can post" : "Read only"'));
assert.ok(page.includes('<ChatMemberActions target={m.quarantine}'), "Existing reviewer pause control stays available.");
assert.ok(service.includes('role: primaryRole?.name ?? "Member"'));
assert.ok(service.includes('avatarUpdatedAt: user.avatarUpdatedAt'));
pass("Member list has avatars, name and muted primary role without access labels.");

assert.ok(routes.includes('router.get("/channels/:channelId/members/:memberId/avatar"'));
assert.ok(routes.includes('getChatMemberAvatar(user(req), channelId, memberId)'));
assert.ok(service.includes('export async function getChatMemberAvatar('));
assert.ok(service.includes('channelAccess(member, channel) : standingAccess(member, conversation!)'));
assert.ok(service.includes('if (!access.canView && !quarantine?.active)'));
assert.ok(routes.includes('"Cache-Control": "no-store"'));
assert.ok(service.includes('const access = channel ? channelAccess(subject, channel) : standingAccess(subject, conversation!);'));
pass("Member avatar reads recheck both participants, without exposing the roster or People permissions.");

assert.ok(settings.includes('creator-chat-settings-tabs'));
assert.ok(settings.includes('aria-pressed={activeTab === "details"}'));
assert.ok(settings.includes('aria-pressed={activeTab === "access"}'));
assert.ok(settings.includes('Find a role'));
assert.ok(settings.includes('Find a member'));
assert.ok(settings.includes('aria-controls="chat-settings-permission-children"'));
assert.ok(settings.includes('className="creator-chat-settings-subnav"'));
assert.ok(settings.includes('matchingRoles.map'));
assert.ok(settings.includes('matchingPeople.map'));
assert.ok(settings.includes('No role grant'));
assert.ok(settings.includes('No individual grant'));
assert.ok(settings.includes('<option value="view">See</option>'));
assert.ok(settings.includes('<option value="post">Post</option>'));
pass("Channel Settings has Overview and expandable Role/Member permissions with existing grant semantics.");

assert.ok(settings.includes('Confirm archive'));
assert.ok(settings.includes('setConfirmArchive(true)'));
assert.ok(settings.includes('setConfirmArchive(false)'));
assert.ok(settings.includes('onClick={() => void archive()}'));
assert.ok(settings.includes('await apiRequest('));
pass("Archive safeguards and all grant/name API actions remain wired.");

assert.ok(css.includes('creator-chat-live-panel-anchor'));
assert.ok(css.includes('creator-chat-live-panel'));
assert.ok(css.includes('.creator-chat-member-role'));
assert.ok(css.includes('.creator-chat-settings-tabs'));
assert.ok(css.includes('@media (max-width: 720px)'));
assert.ok(css.includes('.creator-chat-members-list::-webkit-scrollbar { display: none; }'));
assert.ok(css.includes('grid-template-columns: clamp(232px, 18vw, 294px) minmax(0, 1fr) clamp(236px, 19vw, 290px)'));
assert.ok(css.includes('touch-action: pan-y'));
pass("Chat-only desktop member rail and manual mobile/touch scrolling remain defined.");

console.log(passed + " Chat UI polish source regression groups passed.");
