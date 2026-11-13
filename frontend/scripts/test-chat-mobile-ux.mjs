import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const page = await readFile(resolve(root, "src/pages/ChatPage.tsx"), "utf8");
const css = (await readFile(resolve(root, "src/pages/ChatPage.css"), "utf8")).replace(/\r\n?/g, "\n");
let passed = 0;
const pass = (description) => console.log(`PASS ${++passed}: ${description}`);

assert.ok(page.includes('const [showChatOptions, setShowChatOptions] = useState(false)'));
assert.ok(page.includes('className="creator-chat-mobile creator-chat-options-toggle"'));
assert.ok(page.includes('aria-controls="chat-page-options"'));
assert.ok(page.includes('aria-expanded={showChatOptions}'));
assert.ok(page.includes('className={`creator-chat-heading-actions ${showChatOptions ? "is-open" : ""}`}'));
for (const label of ["Staff announcements", "Email reminders"]) {
  assert.ok(page.includes(label));
}
assert.ok(!page.includes("Browser notifications"), "Browser notification settings live under My Account, not Chat.");
pass("Secondary Chat settings use one accessible, initially closed mobile control.");

assert.ok(page.includes('const [showConversationTools, setShowConversationTools] = useState(false)'));
assert.ok(page.includes('aria-controls="chat-message-tools"'));
assert.ok(page.includes('aria-expanded={showConversationTools}'));
assert.ok(page.includes('id="chat-message-tools"'));
assert.ok(page.includes('className={`creator-chat-conversation-tools ${showConversationTools ? "is-open" : ""}`}'));
for (const label of ["Search messages", "Pinned messages", "Deleted messages"]) {
  assert.ok(page.includes(label));
}
pass("Message search, pins and deleted-message history remain accessible behind a mobile disclosure.");

assert.ok(page.includes('aria-label="Channel settings"'));
assert.ok(page.includes('aria-label="Conversation members"'));
assert.ok(page.includes('aria-expanded={showMembers}'));
assert.ok(page.includes('aria-controls="chat-members"'));
assert.ok(page.includes("setShowMembers(false);"));
assert.ok(page.includes("setShowChatOptions(false);"));
assert.ok(page.includes("setShowConversationTools(false);"));
pass("Essential conversation controls keep screen-reader names, and menus reset on account/channel change.");

assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(css.includes(".creator-chat-heading-actions {\n    display: none;"));
assert.ok(css.includes(".creator-chat-heading-actions.is-open { display: flex; }"));
assert.ok(css.includes(".creator-chat-conversation-tools { display: none; }"));
assert.ok(css.includes(".creator-chat-conversation-tools.is-open {"));
assert.ok(css.includes("grid-template-columns: auto minmax(0, 1fr) auto"));
pass("Compact layout and hidden secondary actions are limited to mobile viewports.");

assert.ok(css.includes(".creator-chat-heading-actions button {"));
assert.ok(css.includes("min-height: 44px;"));
assert.ok(css.includes("max-height: calc(100% - 80px)"));
assert.ok(css.includes("background: #141414;"));
assert.ok(css.includes("outline: 2px solid #FFFFFF"));
pass("Touch targets, member overlay bounds, monochrome theme and keyboard focus remain defined.");

console.log(`${passed} mobile Chat UX source regression groups passed.`);
