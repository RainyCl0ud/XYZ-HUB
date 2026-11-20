import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n?/g, "\n");
const [page, css, tools, layout] = await Promise.all([
  read("frontend/src/pages/ChatPage.tsx"),
  read("frontend/src/pages/ChatPage.css"),
  read("frontend/src/pages/ChatMessageTools.tsx"),
  read("frontend/src/components/PortalAccess.css"),
]);
let passed = 0;
const pass = (name) => console.log(`PASS ${++passed}: ${name}`);

assert.ok(page.includes("Staff announcements") && !page.includes("Email reminder"));
assert.ok(page.includes('className={`creator-chat-heading-actions ${showChatOptions ? "is-open" : ""}`}'));
assert.ok(css.includes("@media (min-width: 721px)"));
assert.ok(css.includes(".creator-chat .creator-chat-heading-actions {"));
assert.ok(css.includes("flex-direction: row;"));
assert.ok(css.includes("flex-wrap: nowrap;"));
assert.ok(css.includes("white-space: nowrap;"));
pass("Chat options keep Staff announcements on a single desktop row.");

assert.ok(layout.includes("--portal-footer-height: 58px;"));
assert.ok(layout.includes(".portal-shell .main-content {"));
assert.ok(page.includes("const chatShellRef = useRef<HTMLDivElement>(null)"));
assert.ok(page.includes("ref={chatShellRef}"));
assert.ok(page.includes('shell?.closest<HTMLElement>(".main-content")'));
assert.ok(page.includes("const mainBottom = main.getBoundingClientRect().bottom"));
assert.ok(page.includes("const available = Math.max(0, Math.floor(mainBottom - shellTop - sectionBottomPadding - 2))"));
assert.ok(page.includes('shell.style.height = `${available}px`'));
assert.ok(css.includes(".creator-chat .creator-chat-shell { min-height: 0; }"));
assert.ok(css.includes(".creator-chat { padding-bottom: 2px; }"));
pass("Chat shell fills measured available height up to the footer, without legacy minimum-height overflow.");

assert.ok(page.includes("new ResizeObserver(schedule)"));
assert.ok(page.includes("observer.observe(main)"));
assert.ok(page.includes("observer.observe(section)"));
assert.ok(page.includes("observer.observe(heading)"));
assert.ok(page.includes('window.addEventListener("resize", schedule)'));
assert.ok(page.includes('main.addEventListener("scroll", schedule, { passive: true })'));
assert.ok(!page.includes('window.addEventListener("scroll", schedule, true)'));
assert.ok(page.includes('main.removeEventListener("scroll", schedule)'));
assert.ok(page.includes('shell.style.removeProperty("height")'));
pass("Height recomputes on container/heading resize without reacting to transcript scrolling, and cleans up listeners.");

assert.ok(css.includes(".creator-chat .creator-chat-live-panel-anchor {"));
assert.ok(css.includes("position: absolute;"));
assert.ok(css.includes("z-index: 22;"));
assert.ok(css.includes("top: 68px;"));
assert.ok(css.includes("bottom: 10px;"));
assert.ok(!page.includes('anchor.style.top'));
assert.ok(!page.includes('anchor.style.left'));
assert.ok(!page.includes('anchor.style.width'));
assert.ok(page.includes('className={`creator-chat-live-panel-anchor ${tools?.kind === "pins" ? "is-pins" : "is-search"}`}'));
pass("Search restores the original bounded in-context panel instead of a clipped viewport-fixed overlay.");

assert.ok(css.includes(".creator-chat .creator-chat-live-panel {"));
assert.ok(css.includes("height: auto;"));
assert.ok(css.includes("max-height: min(68dvh, 100%);"));
assert.ok(css.includes("overflow-y: auto;"));
assert.ok(css.includes("overscroll-behavior: contain;"));
assert.ok(css.includes(".creator-chat .creator-chat-live-panel > header {"));
assert.ok(css.includes("position: sticky;"));
pass("Search results scroll independently in a bounded flyout; Close remains visible.");

assert.ok(tools.includes('className="creator-chat-message-search-field"'));
assert.ok(tools.includes('className="creator-chat-search-clear"'));
assert.ok(tools.includes('aria-label="Clear message search"'));
assert.ok(!tools.includes('onPointerDown={(event) => event.preventDefault()}'));
assert.ok(tools.includes('invalidateSearch(); setQuery(""); searchInput.current?.focus();'));
assert.ok(css.includes(".creator-chat .creator-chat-message-search-field .creator-chat-search-clear {"));
assert.ok(css.includes("width: 44px;"));
assert.ok(css.includes("height: 44px;"));
assert.ok(css.includes('input::-webkit-search-cancel-button'));
pass("Search X has a full 44×44 px pointer/touch target, accessible label and safe result invalidation.");

assert.ok(tools.includes('target.kind === "pins" ? "creator-chat-pin-close" : "creator-chat-live-close"'));
assert.ok(css.includes(".creator-chat .creator-chat-live-panel > header .creator-chat-live-close {"));
assert.ok(css.includes("background: #FFFFFF;"));
assert.ok(css.includes("color: #101010;"));
assert.ok(css.includes("min-width: 82px;"));
assert.ok(tools.includes('onClick={onClose}>{target.kind === "pins" ? "×" : "Close"}</button>'));
pass("The Close action is a clearly distinguishable high-contrast button.");

assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(css.includes(".creator-chat .creator-chat-live-panel-anchor {"));
assert.ok(css.includes(".creator-chat .creator-chat-live-panel {"));
assert.ok(css.includes(".creator-chat { padding-bottom: 4px; }"));
assert.ok(css.includes(".creator-chat-heading-actions.is-open { display: flex; }"));
assert.ok(page.includes('aria-expanded={showChatOptions}'));
pass("Mobile Chat preserves its secondary-action menu and responsive panel/composer behavior.");

console.log(`${passed} Chat viewport, header actions and search UX regression groups passed.`);
