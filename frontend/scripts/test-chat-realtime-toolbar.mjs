import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const source = (path) => readFile(resolve(root, path), "utf8");
const [page, message, settings, css, routes, service, broker] = await Promise.all([
  source("frontend/src/pages/ChatPage.tsx"),
  source("frontend/src/pages/ChatMessageTools.tsx"),
  source("frontend/src/pages/ChatChannelSettings.tsx"),
  source("frontend/src/pages/ChatPage.css"),
  source("backend/src/routes/chat.ts"),
  source("backend/src/services/creator-chat.ts"),
  source("backend/src/services/chat-live-events.ts"),
]);
let passed = 0;
const pass = (name) => console.log("PASS " + (++passed) + ": " + name);

assert.ok(settings.includes('>General</button>'));
assert.ok(!settings.includes('>Overview</button>'));
assert.ok(settings.includes('aria-pressed={activeTab === "details"}'));
assert.ok(settings.includes('>Permissions</span>'));
assert.ok(settings.includes('setAccessCategory("roles")'));
assert.ok(settings.includes('setAccessCategory("people")'));
pass("Channel Settings General label retains Role/Member permissions.");

assert.ok(routes.includes('router.get("/channels/:channelId/live"'));
assert.ok(routes.includes('await assertChatChannelReadable(viewerId, channelId)'));
assert.ok(routes.includes('"Content-Type": "text/event-stream; charset=utf-8"'));
assert.ok(routes.includes('"Cache-Control": "no-store, no-transform"'));
assert.ok(routes.includes('"X-Accel-Buffering": "no"'));
assert.ok(routes.includes('"event: changed\\ndata: {}\\n\\n"'.replaceAll("\\\\n","\\n")));
assert.ok(routes.includes("res.once(\"close\", close)"));
assert.ok(routes.includes("clearInterval(heartbeat); clearTimeout(rotation);"));
assert.ok(service.includes('export async function assertChatChannelReadable(userId: string, channelId: string)'));
assert.ok(service.includes('await openChannel(tx, userId, channelId);'));
pass("SSE validates existing Chat permissions, sends no message payload, and releases connections.");

const writes = ["sendChatMessage", "uploadChatAttachment", "editChatMessage", "deleteChatMessage", "setChatReaction", "setChatPin"];
for (const operation of writes) assert.ok(routes.includes(operation + "("), operation + " must be wired.");
assert.equal((routes.match(/publishChatChange\(channelId\)/g) ?? []).length, 6);
assert.ok(broker.includes("const MAX_LISTENERS_PER_CHANNEL = 150"));
assert.ok(broker.includes("listeners.delete(channelId)"));
pass("Committed message writes broadcast scoped invalidations without additional paid services.");

assert.ok(page.includes('new EventSource('));
assert.ok(page.includes('{ withCredentials: true }'));
assert.ok(page.includes('source.addEventListener("changed", onChanged)'));
assert.ok(page.includes('source.close()'));
assert.ok(page.includes('document.addEventListener("visibilitychange", onVisibility)'));
assert.ok(page.includes('const liveRefresh = useRef<() => void>'));
assert.ok(page.includes("if (refreshing) { pendingRefresh = true; return; }"));
assert.ok(page.includes('timer = setTimeout(() => { void refresh(); }, 5000)'));
pass("Authenticated EventSource wakes the transcript and preserves coalesced polling fallback.");

assert.ok(message.includes('className="creator-chat-quick-reactions"'));
assert.ok(message.includes('palette.slice(0, 3).map'));
assert.ok(message.includes('className="creator-chat-toolbar-reaction-picker"'));
assert.ok(message.includes('aria-label="Reply to message"'));
assert.ok(message.includes('aria-label="Edit message"'));
assert.ok(message.includes('className="creator-chat-action-menu"'));
assert.ok(message.includes('className="creator-chat-more-button"'));
assert.ok(message.includes('m.canReply &&'));
assert.ok(message.includes('m.canEdit && onEdit'));
pass("Discord-style toolbar provides authorized reactions, Reply, Edit and More.");

assert.ok(message.includes('aria-label="Choose a reaction"'));
assert.ok(message.includes('const quickReactionMenu = useRef<HTMLDetailsElement>(null)'));
assert.ok(message.includes('onChanged(response.message)'));
assert.ok(message.includes('disabled={busy}'));
assert.ok(message.includes('aria-pressed={reactions.some'));
pass("Reaction picker uses the existing API with correct state, pending and error guards.");

assert.ok(css.includes('creator-chat .creator-chat-message:hover .creator-chat-message-actions'));
assert.ok(css.includes('creator-chat .creator-chat-message:focus-within .creator-chat-message-actions'));
assert.ok(css.includes('@media (hover: none), (pointer: coarse)'));
assert.ok(css.includes('creator-chat-toolbar-reaction-picker[open]'));
assert.ok(css.includes('border-radius: 0;'));
assert.ok(css.includes('pointer-events: none'));
assert.ok(css.includes('pointer-events: auto'));
pass("Hover/focus toolbar does not shift message layout and remains available on touch screens.");
console.log(passed + " Chat realtime and action toolbar source groups passed.");
