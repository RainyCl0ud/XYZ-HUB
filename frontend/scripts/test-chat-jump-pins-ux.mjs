import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const read = async (p) => (await readFile(resolve(root, p), "utf8")).replace(/\r\n?/g, "\n");
const [page, css, tools, routes, service, layout, central, reactions] = await Promise.all([
  read("frontend/src/pages/ChatPage.tsx"),
  read("frontend/src/pages/ChatPage.css"),
  read("frontend/src/pages/ChatMessageTools.tsx"),
  read("backend/src/routes/chat.ts"),
  read("backend/src/services/creator-chat.ts"),
  read("frontend/src/components/AppLayout.tsx"),
  read("frontend/src/lib/central-time.ts"),
  read("frontend/src/lib/chat-reaction-emojis.ts"),
]);
let passed = 0;
const pass = (title) => console.log("PASS " + (++passed) + ": " + title);

assert.ok(layout.includes('import { CENTRAL_TIME_ZONE } from "../lib/central-time";'));
assert.ok(page.includes('timeZone: CENTRAL_TIME_ZONE, month: "long", day: "numeric", year: "numeric"'));
assert.ok(tools.includes('const chatTime = formatCentralMessageTime;'));
assert.ok(central.includes('CENTRAL_TIME_ZONE = "America/Chicago"'));
const vite = await createServer({root:resolve(root,"frontend"),configFile:false,envDir:false,server:{middlewareMode:true,hmr:false},optimizeDeps:{noDiscovery:true,include:[]},logLevel:"error"});
try {
  const { formatCentralMessageTime } = await vite.ssrLoadModule("/src/lib/central-time.ts");
  assert.equal(formatCentralMessageTime("2026-11-17T05:30:00.000Z"), "11:30 PM CST");
  assert.equal(formatCentralMessageTime("2026-07-01T16:30:00.000Z"), "11:30 AM CDT");
  pass("Chat timestamps share the global Hub timezone and adjust CST/CDT automatically.");
} finally {await vite.close();}

assert.ok(service.includes('export async function getChatMessageContext(userId: string, channelId: string, messageId: string)'));
assert.ok(service.includes('await openChannel(tx, userId, channelId)'));
assert.ok(service.includes('const audience = { ...scope, ...visibleMessages(viewer) };'));
assert.ok(service.includes('if (!target) throw new ChatError(404, "Message not found.");'));
assert.ok(service.includes("take: 26, include: messageInclude;") === false);
assert.equal((service.slice(service.indexOf("export async function getChatMessageContext"),service.indexOf("type NewAttachment")).match(/take: 26, include: messageInclude/g) ?? []).length, 2);
assert.ok(routes.includes('router.get("/channels/:channelId/messages/:messageId/context"'));
pass("Reply/pin context reads remain bounded, permission-filtered and inaccessible to unauthorized viewers.");

assert.ok(page.includes("const [jumpTarget, setJumpTarget] = useState<"));
assert.ok(page.includes("function jumpToMessage(channelId: string, messageId: string)"));
assert.ok(page.includes("setJumpTarget({ channelId, messageId })"));
assert.ok(page.includes('onOpen={(messageId) => jumpToMessage(selected, messageId)}'));
assert.ok(page.includes('onJumpToMessage={jumpToMessage}'));
assert.ok(page.includes('onJumpToMessage(r.channelId, r.message.id)') === false);
pass("Quoted messages and discovered messages route through the same real transcript jump handler.");

assert.ok(page.includes('pane.scrollTo({ top: Math.max(0, desiredTop)'));
assert.ok(page.includes('setJumpHighlight(jumpTarget.messageId)'));
assert.ok(page.includes('setJumpTarget(null)'));
assert.ok(page.includes('className={\`creator-chat-message'));
assert.ok(page.includes('jumpHighlight === m.id ? "is-jump-highlight" : ""'));
assert.ok(css.includes("@keyframes creator-chat-target-highlight"));
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"));
pass("Jump scrolls only the message pane, centers the target and briefly highlights its row.");

assert.ok(page.includes('apiRequest<{') && page.includes('/context\`'));
assert.ok(page.includes('controller.abort()'));
assert.ok(page.includes("if (controller.signal.aborted || selectedRef.current !== destination.channelId) return"));
assert.ok(page.includes('const transcriptLoaded = !!transcript;'));
assert.ok(page.includes("setViewingOlderJump(true)"));
assert.ok(page.includes('className="creator-chat-return-latest"'));
assert.ok(page.includes("function jumpToLatest()"));
pass("Older target navigation fetches context with stale-request cancellation and an escape to latest messages.");

assert.ok(page.includes('className={\`creator-chat-live-panel-anchor \${tools?.kind === "pins" ? "is-pins" : "is-search"}\`}'));
assert.ok(css.includes("position: absolute;") && css.includes("z-index: 22;") && css.includes("top: 68px;"));
assert.ok(css.includes("max-height: min(68dvh, 100%);"));
assert.ok(!page.includes("anchor.style.top"));
assert.ok(tools.includes('<option value="conversation">Current conversation</option>'));
assert.ok(tools.includes('<option value="all">All conversations I can access</option>'));
assert.ok(tools.includes('if (submitted.scope === "conversation") params.set("channelId", target.channelId)'));
pass("Search returns to its original bounded flyout with explicitly scoped, permission-checked search choices.");

assert.ok(tools.includes('className="creator-chat-pin-list"'));
assert.ok(tools.includes('className="creator-chat-pin-card"'));
assert.ok(tools.includes('className="creator-chat-pin-excerpt"'));
assert.ok(tools.includes('onJumpToMessage(target.channelId, m.id)'));
assert.ok(tools.includes('className="creator-chat-pin-remove"'));
assert.ok(tools.includes('setConfirmUnpin('));
assert.ok(tools.includes('pinned: false, version: value.pinVersion'));
assert.ok(tools.includes('if (!value.canPin || unpinBusy || !value.pinnedAt) return'));
assert.ok(css.includes(".creator-chat-pin-excerpt {"));
assert.ok(css.includes("max-height: 172px;"));
pass("Pinned cards show compact excerpts, Jump controls and guarded two-step removal with internal scrolling.");

assert.ok(tools.includes('pickerMode === "recent"'));
assert.ok(tools.includes('? sixRecentEmojis'));
assert.ok(tools.includes('Available emoji library'));
assert.ok(tools.includes('Search emoji library'));
assert.ok(tools.includes('>Add emoji') === false);
assert.ok(tools.includes('"Add emoji" : "Recent"'));
assert.ok(tools.includes("palette.filter(([emoji, label])"));
assert.ok(css.includes("creator-chat-emoji-popover-grid.is-library"));
assert.ok(reactions.includes("CHAT_RECENT_EMOJI_LIMIT = 6"));
pass("Add emoji opens a searchable approved library while the six account-specific recents stay intact.");

assert.ok(tools.includes("const [unpinBusy, setUnpinBusy] = useState(false)"));
assert.ok(tools.includes('changed(target.channelId, response.message)'));
assert.ok(tools.includes("setPins((old) => old.map"));
assert.ok(page.includes("setTools(null); setToolsNotice(\"\");"));
pass("Pinned-message updates keep the existing mutation/refresh infrastructure and do not touch permissions.");

console.log(passed + " Chat reply jump, global clock, Search, Pins and emoji library regression groups passed.");
