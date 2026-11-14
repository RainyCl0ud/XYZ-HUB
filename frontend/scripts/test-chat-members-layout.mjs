import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const [chat, css, globalCss] = await Promise.all([
  "src/pages/ChatPage.tsx",
  "src/pages/ChatPage.css",
  "src/index.css",
].map(path => readFile(resolve(root, path), "utf8")));
let count = 0;
const pass = text => console.log("PASS " + (++count) + ": " + text);

assert.ok(chat.includes('className="creator-chat-members creator-chat-members-rail"'));
assert.ok(chat.includes('className="creator-chat-members creator-chat-members-drawer"'));
assert.ok(chat.includes('className="creator-chat-member-drawer-toggle"'));
assert.ok(chat.includes('<ChatMemberRoster members={members} onQuarantine={setQuarantining} />'));
assert.ok(chat.includes('members.filter(m => m.canView !== false).length'));
assert.ok(chat.includes('member.quarantine?.active'));
assert.ok(chat.includes('onQuarantine(member.quarantine!)'));
pass("Wide-screen rail and compact-screen drawer share the authorized member roster and moderation actions.");

assert.ok(css.includes("@media (min-width: 1440px)"));
assert.ok(css.includes("grid-template-columns: minmax(245px, 270px) minmax(0, 1fr) minmax(218px, 250px)"));
assert.ok(css.includes(".creator-chat .creator-chat-members-rail"));
assert.ok(css.includes(".creator-chat .creator-chat-members-drawer"));
assert.ok(css.includes("@media (max-width: 1439px)"));
assert.ok(css.includes(".creator-chat-members-rail { display: none; }"));
pass("Three columns are limited to wide desktops; drawer remains the narrow-screen fallback.");

assert.ok(css.includes("max-width: none; padding: 20px"));
assert.ok(css.includes(".creator-chat-shell { min-width: 0; }"));
assert.ok(globalCss.includes(".page {"));
assert.ok(!css.includes(".main-content {"), "Shared portal main sizing must stay untouched.");
assert.ok(!css.includes(".page {"), "Shared page width must stay untouched.");
pass("Width expansion is scoped to Chat, never the globally shared page or app shell.");

const roster = chat.slice(chat.indexOf("function ChatMemberRoster"), chat.indexOf("export default function ChatPage"));
assert.ok(roster.includes('className="creator-chat-members-scroll"'));
assert.ok(roster.includes('tabIndex={0}'));
assert.ok(!/scrollTop|scrollIntoView|setInterval|setTimeout|requestAnimationFrame|scrollTo\(/.test(roster),
  "Members roster must not auto-scroll.");
assert.ok(css.includes("overflow-y: auto;"));
assert.ok(css.includes("scrollbar-width: none"));
assert.ok(css.includes(".creator-chat-members-scroll::-webkit-scrollbar { display: none;"));
assert.ok(css.includes("touch-action: pan-y"));
assert.ok(css.includes("overscroll-behavior: contain"));
pass("Member list scrolls only via mouse, trackpad, keyboard or touch, with hidden scrollbars and no automation.");

assert.ok(chat.includes('maxLength={8000} rows={1}'));
assert.ok(chat.includes('field.style.height = "auto"'));
assert.ok(chat.includes('field.scrollHeight'));
assert.ok(chat.includes('Math.min(152, Math.max(44, field.scrollHeight))'));
assert.ok(css.includes("grid-template-columns: 40px minmax(0, 1fr) 40px"));
assert.ok(css.includes("align-items: center"));
assert.ok(css.includes(".creator-chat .creator-chat-composer-bar textarea"));
assert.ok(css.includes("min-height: 44px; height: 44px"));
assert.ok(chat.includes('e.nativeEvent.isComposing'));
assert.ok(chat.includes('e.shiftKey'));
assert.ok(chat.includes('e.currentTarget.form?.requestSubmit()'));
pass("Composer centers +, text and Send while growing with multiline drafts, preserving keyboard send behavior.");

assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(css.includes(".creator-chat .creator-chat-members-drawer {"));
assert.ok(css.includes("height: calc(100% - 16px)"));
assert.ok(chat.includes('aria-label="Close members"'));
assert.ok(chat.includes('onClick={() => setShowMembers(false)}'));
assert.ok(chat.includes('if (event.key === "Escape") setShowMembers(false)'));
pass("Mobile drawer stays dismissible by backdrop, close button and Escape, and can be swiped to scroll.");

console.log(count + " Chat members and composer layout regression groups passed.");
