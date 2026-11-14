import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { dirname, join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
async function collect(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = await Promise.all(entries.map(e => e.isDirectory()
    ? collect(join(directory, e.name))
    : Promise.resolve(/\.(tsx|ts)$/.test(e.name) ? [join(directory, e.name)] : [])));
  return files.flat();
}
const files = await collect(resolve(root, "src"));
const sources = new Map(await Promise.all(files.map(async f =>
  [relative(root, f).replaceAll("\\", "/"), (await readFile(f, "utf8")).replace(/\r\n?/g, "\n")])));
const page = sources.get("src/pages/ChatPage.tsx");
const message = sources.get("src/pages/ChatMessageTools.tsx");
const css = await readFile(resolve(root, "src/pages/ChatPage.css"), "utf8");
const alerts = sources.get("src/components/ClockAlerts.tsx");
let passed = 0;
const pass = text => console.log("PASS " + (++passed) + ": " + text);

const unwantedCopy = [
  "Enter to send · Shift + Enter for a new line",
  "Device push notifications are not enabled in this build.",
  "Notices appear in the Hub.",
  "Management view · Staff flags follow your current attendance permissions and creator assignments.",
  "The server records times to the second.",
  "Operational attendance overview and correction approvals.",
  "not a personal email on/off switch",
  "Private chats are assigned automatically.",
  "All times in US Central",
  "Staging sends only to the configured test list.",
  "Subteams are collapsed for clarity",
];
const violations = [];
for (const [file, source] of sources) for (const phrase of unwantedCopy) {
  if (source.includes(phrase)) violations.push(file + ": " + phrase);
}
assert.deepEqual(violations, [], "Unnecessary technical copy should not appear in Hub pages and modals.");
pass("Audited " + files.length + " frontend source files against unwanted technical UI copy.");

assert.ok(page.includes('<span>Search</span>'));
assert.ok(page.includes('aria-label="Pinned messages"'));
assert.ok(page.includes('kind: "search"'));
assert.ok(page.includes('kind: "pins"'));
assert.ok(page.includes('kind: "deleted"'));
assert.ok(!page.includes('>Tools</span>'));
assert.ok(!page.includes('showConversationTools'));
assert.ok(page.indexOf('className="creator-chat-search-action"') < page.indexOf('className="creator-chat-pin-action"'));
pass("Search is direct with the adjacent Pin icon and authorized deleted-message access.");

assert.ok(message.includes("createPortal("));
assert.ok(message.includes('closest("dialog") ?? document.body'));
assert.ok(message.includes('className="creator-chat-action-popover"'));
assert.ok(message.includes('aria-expanded={menuOpen}'));
assert.ok(message.includes('event.key !== "Escape"'));
assert.ok(message.includes('document.addEventListener("scroll", closeOnScroll, true)'));
assert.ok(message.includes('document.addEventListener("pointerdown", closeOnOutside)'));
assert.ok(css.includes(".creator-chat-action-popover {"));
assert.ok(css.includes("position: fixed;"));
assert.ok(css.includes("overflow: auto;"));
pass("Floating More menu is layered, viewport-bounded, dismissible and not in message flow.");

assert.ok(!message.includes('<strong>{voiceDuration ? "Voice message"'));
assert.ok(message.includes('durationMs={voiceDuration}'));
assert.ok(message.includes('m.attachment.available && !!voiceDuration'));
assert.ok(message.includes('className="creator-chat-file-unavailable"'));
assert.ok(message.includes('href={'));
pass("Voice messages display their player without a redundant heading; file fallback stays visible.");

assert.ok(message.includes('m.canModerate && onModerate && <button'));
assert.ok(message.includes('m.canViewHistory && onHistory && <button'));
assert.ok(message.includes('m.canPin && <button'));
assert.ok(message.includes('m.attachment?.available && <a href='));
assert.ok(sources.get("src/pages/ChatModerationDialog.tsx").includes("onDeleted"));
assert.ok(sources.get("src/pages/ChatAnnouncements.tsx").includes("preview.blockers"));
assert.ok(sources.get("src/pages/ChatChannelCleanupDialog.tsx").includes("target.download"));
assert.ok(alerts.includes("markRead(alert.id)"));
pass("Moderation permissions, file downloads, confirmation safeguards and attendance actions remain present.");

assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(css.includes(".creator-chat-discover-actions"));
assert.ok(css.includes(".creator-chat-header-actions .creator-chat-search-action"));
pass("Search/Pin controls keep their responsive touch layout.");

console.log(passed + " Hub copy and floating Chat UX regression groups passed.");
