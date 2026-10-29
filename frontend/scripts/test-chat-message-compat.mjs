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
  const render = (message) => renderToStaticMarkup(createElement(ChatMessageContent, { message, channelId: "test-channel", onReply: noop, onEdit: noop, onChanged: noop, onOpen: noop, onError: noop, onModerate: noop, onHistory: noop }));
  const retained = render({ ...legacy, canEdit: false, canReply: false, canPin: false, canModerate: false, canViewHistory: true, reactions: [], deleted: { at: legacy.createdAt, by: "Test moderator", reason: "Test retained reason" } });
  for (const text of [legacy.text, "Owner view", "Test moderator", "Test retained reason", "View history"]) assert.ok(retained.includes(text));
  for (const action of ["Edit", "Reply", "Pin", "Delete", "React"]) assert.ok(!retained.includes(`>${action}</button>`));
  console.log("PASS: Owner deleted messages retain text and attribution, have a clear Owner label and history, and expose no mutation controls.");
  const redacted = render({ ...legacy, replyTo: null, replyUnavailable: true });
  assert.ok(redacted.includes("Original message unavailable"));
  assert.ok(!redacted.includes("Deleted · Owner view") && !redacted.includes("Test retained reason"));
  const moderator = render({ ...legacy, canModerate: true, canViewHistory: false });
  assert.ok(moderator.includes(">Delete</button>") && !moderator.includes(">View history</button>"));
  console.log("PASS: redacted reply previews reveal no deleted source and moderation/history controls follow separate server capabilities.");
} finally { await vite.close(); }
