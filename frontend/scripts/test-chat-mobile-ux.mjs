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
assert.ok(!page.includes("Email reminder"), "Email delivery moved to the Owner Audit Log");
for (const label of ["Staff announcements"]) {
  assert.ok(page.includes(label));
}
assert.ok(!page.includes("Browser notifications"), "Browser notification settings live under My Account, not Chat.");
pass("Secondary Chat settings use one accessible, initially closed mobile control.");

assert.ok(page.includes('className="creator-chat-discover-actions"'));
assert.ok(page.includes('<span>Search</span>'));
assert.ok(page.includes('aria-label="Pinned messages"'));
assert.ok(page.includes('aria-label="Deleted messages"'));
assert.ok(page.includes('kind: "search"'));
assert.ok(page.includes('kind: "pins"'));
assert.ok(page.includes('kind: "deleted"'));
assert.ok(!page.includes('>Tools</span>'));
pass("Search and pinned messages have direct, adjacent actions; Owner-only deleted history stays available.");

assert.ok(page.includes('aria-label="Channel settings"'));
assert.ok(page.includes('aria-label="Conversation members"'));
assert.ok(page.includes('aria-expanded={showMembers}'));
assert.ok(page.includes('aria-controls="chat-members"'));
assert.ok(page.includes("setShowMembers(false);"));
assert.ok(page.includes("setShowChatOptions(false);"));
assert.ok(page.includes('aria-label="Pinned messages"'));
pass("Essential conversation controls keep screen-reader names, and menus reset on account/channel change.");

assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(css.includes(".creator-chat-heading-actions {\n    display: none;"));
assert.ok(css.includes(".creator-chat-heading-actions.is-open { display: flex; }"));
assert.ok(css.includes(".creator-chat-discover-actions"));
assert.ok(css.includes(".creator-chat-header-actions .creator-chat-search-action"));
assert.ok(css.includes("grid-template-columns: auto minmax(0,1fr)"));
pass("Compact layout and hidden secondary actions are limited to mobile viewports.");

assert.ok(css.includes(".creator-chat-heading-actions button {"));
assert.ok(css.includes("min-height: 44px;"));
assert.ok(css.includes("max-height: calc(100% - 80px)"));
assert.ok(css.includes("background: #141414;"));
assert.ok(css.includes("outline: 2px solid #FFFFFF"));
pass("Touch targets, member overlay bounds, monochrome theme and keyboard focus remain defined.");

assert.ok(page.includes('className="creator-chat-members-toggle"'));
assert.ok(page.includes('className={`creator-chat-members ${showMembers ? "is-open" : ""}`}'));
assert.ok(page.includes('className="creator-chat-members-list" tabIndex={0}'));
assert.ok(!page.includes('{showMembers && <aside'), "The member rail must not unmount on desktop when the mobile drawer closes.");
assert.ok(css.includes("@media (min-width: 1280px)"));
assert.ok(css.includes("grid-template-columns: clamp(232px, 18vw, 294px) minmax(0, 1fr) clamp(236px, 19vw, 290px)"));
assert.ok(css.includes("scrollbar-width: none;"));
assert.ok(css.includes(".creator-chat-members-list::-webkit-scrollbar { display: none; }"));
assert.ok(css.includes("overflow-y: auto;"));
assert.ok(css.includes("touch-action: pan-y;"));
assert.ok(!page.includes("membersList.scrollTop"), "Members must never auto-scroll.");
pass("The Chat-only desktop member rail stays mounted and has manual wheel/touch scrolling without a visible scrollbar.");

assert.ok(page.includes("field.style.height = \"auto\";"));
assert.ok(page.includes("Math.min(naturalHeight, 140)"));
assert.ok(page.includes("rows={1} placeholder="));
assert.ok(css.includes(".creator-chat-composer-bar { align-items: center; min-height: 58px; }"));
assert.ok(css.includes(".creator-chat-composer-plus { display: flex; align-items: center; align-self: center; }"));
pass("The composer starts as one aligned text row, grows for multiline drafts, and centers the plus/send actions.");

assert.ok(page.includes('disabled={!transcript}><ChatIcon name="people" />'));
assert.ok(!page.includes('disabled={!transcript}>><ChatIcon name="people" />'));
assert.ok(page.includes('className="creator-chat-mobile-actions"'));
assert.ok(page.includes('aria-label="More conversation actions"'));
assert.ok(page.includes('aria-controls="chat-mobile-actions-menu"'));
assert.ok(page.includes('aria-expanded={showMobileActions}'));
assert.ok(page.includes('const [showMobileActions, setShowMobileActions] = useState(false)'));
assert.ok(page.includes('event.target.closest(".creator-chat-mobile-actions")'));
assert.ok(page.includes('event.key === "Escape"'));
assert.ok(page.includes('Search messages</button>'));
assert.ok(page.includes('Pinned messages</button>'));
assert.ok(page.includes('Deleted messages</button>'));
assert.ok(page.includes('Channel settings</button>'));
assert.ok(css.includes('.creator-chat .creator-chat-mobile-actions-toggle {'));
assert.ok(css.includes('.creator-chat-mobile-actions-menu {'));
assert.ok(css.includes('.creator-chat-header-actions > .creator-chat-discover-actions,'));
assert.ok(css.includes('white-space: nowrap; overflow: hidden; text-overflow: ellipsis;'));
pass("Mobile header stays on one line with accessible member shortcut and one dismissible secondary-actions menu.");

assert.ok(page.includes('className="creator-chat-members-backdrop"'));
assert.ok(page.includes('aria-label="Close members panel"'));
assert.ok(css.includes('.creator-chat .creator-chat-members-backdrop {'));
assert.ok(css.includes('.creator-chat .creator-chat-members.is-open {'));
assert.ok(css.includes('bottom: 8px; width: calc(100% - 16px); max-height: none;'));
assert.ok(page.includes('className="creator-chat-members-close"'));
assert.ok(!page.includes('See who has access</button>'));
assert.ok(!page.includes('>View members</button></div>'));
assert.ok(css.includes('@media (min-width: 721px) {\n  .creator-chat-members-backdrop { display: none !important; }'));
pass("Mobile member list is a dismissible scrollable overlay with no redundant membership links.");

assert.ok(page.includes('className="creator-chat-options-chevron"'));
assert.ok(css.includes('.creator-chat-options-toggle[aria-expanded="true"] .creator-chat-options-chevron { transform: rotate(180deg); }'));
assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
assert.ok(page.includes('setShowChatOptions(false); setShowAnnouncements(true);'));
assert.ok(!page.includes('setShowReminders'), "Email delivery is no longer a Chat option");
pass("Chat options use a chevron disclosure while retaining permission-gated tools.");

console.log(`${passed} mobile Chat UX source regression groups passed.`);
