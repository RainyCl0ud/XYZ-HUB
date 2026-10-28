import assert from "node:assert/strict";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

// Render the real component with the exact previous API contract. No server,
// database, session or external request is involved.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({ root, configFile: false, envDir: false, optimizeDeps: { noDiscovery: true, include: [] }, esbuild: { jsx: "automatic" }, server: { middlewareMode: true, hmr: false }, logLevel: "error" });
try {
  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const legacy = { id: "old-message", authorName: "Test author", text: "Existing messages stay readable during a rolling deploy.", version: 1, createdAt: "2026-10-28T12:00:00Z", updatedAt: "2026-10-28T12:00:00Z", canEdit: true };
  const noop = () => {};
  const html = renderToStaticMarkup(createElement(ChatMessageContent, { message: legacy, channelId: "old-channel", onReply: noop, onEdit: noop, onChanged: noop, onOpen: noop, onError: noop }));
  assert.ok(html.includes(legacy.text) && html.includes(legacy.authorName));
  assert.ok(html.includes(">Edit</button>"));
  assert.ok(!html.includes(">Reply</button>") && !html.includes(">Pin</button>") && !html.includes("Message reactions"));
  console.log("PASS: the real Chat component renders the previous backend response without new fields; existing text/edit controls remain available and unsupported interaction controls stay hidden.");
} finally { await vite.close(); }
