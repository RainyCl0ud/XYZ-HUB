import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: "error" });
try {
  const { isMessageContinuation: groups } = await vite.ssrLoadModule("/src/lib/chat-message-grouping.ts");
  const base = { id: "one", authorUserId: "person-1", authorName: "Jordan", createdAt: "2026-11-20T15:00:00Z", updatedAt: "2026-11-20T15:00:00Z", text: "First message", version: 1, canReply: true, canEdit: true, canPin: true, reactions: [], replyTo: null, pinnedAt: null, pinnedByName: null, pinVersion: 0 };
  const next = { ...base, id: "two", text: "Second message", createdAt: "2026-11-20T15:04:59.999Z" };
  assert.equal(groups(base, next), true); assert.equal(groups(undefined, next), false);
  assert.equal(groups(base, { ...next, createdAt: "2026-11-20T15:05:00Z" }), false);
  assert.equal(groups(base, { ...next, createdAt: "2026-11-20T14:59:59Z" }), false);
  assert.equal(groups(base, { ...next, createdAt: "bad date" }), false);
  for (const change of [{ authorUserId: "person-2" }, { authorUserId: null }, { authorUserId: undefined }, { authorName: "Renamed person" }]) assert.equal(groups(base, { ...next, ...change }), false);
  for (const change of [{ replyTo: { id: "source" } }, { replyUnavailable: true }, { deleted: { at: next.createdAt } }, { systemNotice: true }, { announcement: true }]) {
    assert.equal(groups(base, { ...next, ...change }), false); assert.equal(groups({ ...base, ...change }, next), false);
  }
  assert.equal(groups({ ...base, createdAt: "2026-11-20T05:59:00Z" }, { ...next, createdAt: "2026-11-20T06:01:00Z" }), false, "Central midnight splits groups");
  assert.equal(groups({ ...base, createdAt: "2026-11-19T23:59:00Z" }, { ...next, createdAt: "2026-11-20T00:01:00Z" }), true, "UTC midnight does not split a Central day");
  assert.equal(groups({ ...base, createdAt: "2026-11-01T06:59:00Z" }, { ...next, createdAt: "2026-11-01T07:01:00Z" }), true, "DST fallback uses elapsed time");
  assert.equal(groups(base, { ...next, attachment: { fileName: "note.txt" } }), true);
  console.log("PASS: account identity, five-minute boundary, first loaded message, Central dates, DST, replies and protected message types group correctly.");
  const { default: Row } = await vite.ssrLoadModule("/src/pages/ChatTranscriptMessage.tsx");
  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const props = { channelId: "channel", onReply() {}, onChanged() {}, onOpen() {}, onError() {}, onEdit() {} };
  const render = el => renderToStaticMarkup(createElement(ToastProvider, null, el));
  const first = render(createElement(Row, { ...props, message: base }));
  const compact = render(createElement(Row, { ...props, message: { ...next, version: 2 }, previous: base }));
  assert.ok(first.includes("creator-chat-avatar") && first.includes("<header>") && first.includes("is-group-start"));
  assert.ok(compact.includes("is-grouped") && !compact.includes("creator-chat-avatar") && !compact.includes("<header>"));
  assert.ok(compact.includes("creator-chat-group-time") && compact.includes(next.createdAt) && compact.includes("Sent Nov 20, 2026"));
  assert.ok(compact.includes("creator-chat-group-edited") && compact.includes("Second message"));
  assert.ok(compact.includes("Reply to message") && compact.includes("Edit message") && compact.includes("Choose another emoji"));
  const standalone = render(createElement(ChatMessageContent, { ...props, message: next }));
  assert.ok(standalone.includes("<header>") && standalone.includes("Jordan"), "Search/pin/history content keeps full attribution by default");
  console.log("PASS: actual transcript rows hide repeated headers while preserving timestamps, edited labels, independent actions and standalone attribution.");
} finally { await vite.close(); }
