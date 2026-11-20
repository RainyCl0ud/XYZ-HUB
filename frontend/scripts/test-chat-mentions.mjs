import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
const vite = await createServer({ configFile: false, root: fileURLToPath(new URL("..", import.meta.url)), server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: "error" });
try {
  const { rebaseMentions, trimmedMentionDraft } = await vite.ssrLoadModule("/src/lib/chat-mentions.ts");
  const m = { userId: "member-1", start: 3, end: 7 };
  assert.deepEqual(rebaseMentions("Hi @Sam!", "Hey Hi @Sam!", [m]), [{ ...m, start: 7, end: 11 }]);
  assert.deepEqual(rebaseMentions("Hi @Sam!", "Hi @Samuel!", [m]), [], "Editing a label drops its identity");
  assert.deepEqual(rebaseMentions("Hi @Sam!", "Hi @Sam! More", [m]), [m]);
  assert.deepEqual(rebaseMentions("Hi @Sam!", "Hi !", [m]), []);
  assert.deepEqual(trimmedMentionDraft("  Hi @Sam!  ", [{ ...m, start: 5, end: 9 }]), { text: "Hi @Sam!", mentions: [m] });
  assert.deepEqual(rebaseMentions("🦊 @Sam", "🦊🦊 @Sam", [{ ...m, start: 3, end: 7 }]), [{ ...m, start: 5, end: 9 }]);
  console.log("PASS: selected identities survive surrounding edits and Unicode; edited/deleted labels stop mentioning, and trimming preserves offsets.");
  const { ChatMentionText } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const html = renderToStaticMarkup(createElement(ChatMentionText, { text: "Hi @Sam <script>", mentions: [{ ...m, mine: true }] }));
  assert.ok(html.includes('creator-chat-mention is-mine'));
  assert.ok(html.includes('&lt;script&gt;'));
  assert.ok(!html.includes('<script>'));
  const old = renderToStaticMarkup(createElement(ChatMentionText, { text: "Old @Sam message" }));
  assert.equal(old, "Old @Sam message");
  console.log("PASS: real mention rendering highlights selected recipients, escapes text and keeps old messages readable.");
} finally { await vite.close(); }
