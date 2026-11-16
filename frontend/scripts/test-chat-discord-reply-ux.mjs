import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (file) => (await readFile(resolve(root, file), "utf8")).replace(/\r\n?/g, "\n");
const vite = await createServer({
  root, configFile: false, envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false }, logLevel: "error",
});
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);

try {
  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const noop = () => {};
  // This timestamp is Nov 16 at 11:30 PM in America/Chicago.
  const sentAt = "2026-11-17T05:30:00.000Z";
  const base = {
    id: "reply-1", authorName: "Rainheart", text: "replying to this",
    version: 1, createdAt: sentAt, updatedAt: sentAt,
    canEdit: true, canReply: true, canPin: true, pinVersion: 1,
    pinnedAt: null, pinnedByName: null, reactions: [],
    replyTo: { id: "parent-1", authorName: "Original member", text: "hi", version: 1, createdAt: sentAt },
  };
  const render = (m) => renderToStaticMarkup(createElement(ChatMessageContent, {
    message: m, channelId: "test-channel",
    onReply: noop, onEdit: noop, onChanged: noop,
    onOpen: noop, onError: noop, onModerate: noop, onHistory: noop,
  }));
  const replied = render(base);
  const quoteAt = replied.indexOf('class="creator-chat-quote"');
  const headerAt = replied.indexOf("<header>");
  const messageAt = replied.indexOf("replying to this");
  assert.ok(quoteAt >= 0 && headerAt > quoteAt && messageAt > headerAt);
  assert.ok(replied.includes('class="creator-chat-quote-author"'));
  assert.ok(replied.includes('>Original member</span>'));
  assert.ok(replied.includes('class="creator-chat-quote-preview"'));
  assert.ok(replied.includes('>hi</span>'));
  assert.ok(replied.includes("View original message by Original member"));
  pass("A reply shows a compact original-author/text preview above the sender and new message.");

  assert.ok(replied.includes(">11:30 PM CST</time>"), "Message time must match the global Hub clock: US Central, CST in winter.");
  assert.ok(!replied.includes("Nov 16") && !replied.includes(">11/16"));
  assert.ok(replied.includes(`dateTime="${sentAt}"`) || replied.includes(`datetime="${sentAt}"`));
  const normal = render({ ...base, replyTo: null });
  assert.ok(normal.includes(">11:30 PM CST</time>"));
  assert.ok(!normal.includes('class="creator-chat-quote"'));
  pass("Message headers use compact clock time and the global Hub clock CST/CDT abbreviation.");

  const long = "This is a very long original message ".repeat(40);
  const verbose = render({ ...base, replyTo: { ...base.replyTo, text: long, authorName: "Very Long Name" } });
  assert.ok(verbose.includes('class="creator-chat-quote-preview"'));
  assert.ok(verbose.includes('title="Reply to Very Long Name:'));
  pass("Long quoted content remains accessible while the display is constrained through CSS ellipsis.");

  const older = render({ ...base, createdAt: "2026-10-03T16:15:00.000Z", updatedAt: "2026-10-03T16:15:00.000Z" });
  assert.ok(older.includes(">11:15 AM CDT</time>"));
  assert.ok(!older.includes(">Oct 3,"));
  pass("Older message headers automatically switch to CDT during daylight-saving time.");

  const unavailable = render({ ...base, replyTo: null, replyUnavailable: true });
  assert.ok(unavailable.includes('class="creator-chat-quote-unavailable"'));
  assert.ok(unavailable.includes("Original message unavailable."));
  assert.ok(!unavailable.includes("Original member"));
  pass("Unavailable or redacted reply targets remain redacted and use the same compact preview treatment.");

  const deleted = render({
    ...base, replyTo: null, canReply: false, canEdit: false, canPin: false,
    deleted: { at: sentAt, by: "Moderator", reason: "Retained audit" },
  });
  assert.ok(deleted.includes("Deleted Message</button>"));
  assert.ok(deleted.includes(">11:30 PM CST</time>"));
  assert.ok(!deleted.includes("replying to this"));
  assert.ok(!deleted.includes("Moderator") && !deleted.includes("Retained audit"));
  pass("Owner-retained deleted messages still start collapsed and display the compact timestamp.");

  const [component, page, css, backend] = await Promise.all([
    read("src/pages/ChatMessageTools.tsx"), read("src/pages/ChatPage.tsx"),
    read("src/pages/ChatPage.css"), read("../backend/src/services/creator-chat.ts"),
  ]);
  assert.ok(component.includes('const chatTime = formatCentralMessageTime;'));
  const centralTime = await read("src/lib/central-time.ts");
  const layout = await read("src/components/AppLayout.tsx");
  assert.ok(centralTime.includes('CENTRAL_TIME_ZONE = "America/Chicago"'));
  assert.ok(centralTime.includes('timeZoneName: "short"'));
  assert.ok(layout.includes('import { CENTRAL_TIME_ZONE } from "../lib/central-time";'));
  assert.ok(!component.includes('month: "short", day: "numeric", hour: "numeric"'));
  assert.ok(page.includes('timeZone: CENTRAL_TIME_ZONE, month: "long", day: "numeric", year: "numeric"'));
  assert.ok(page.includes('className="creator-chat-day"'));
  assert.ok(page.includes('!m.deleted && (m.replyTo || m.replyUnavailable) ? "has-reply" : ""'));
  assert.ok(css.includes(".creator-chat .creator-chat-message.has-reply > .creator-chat-avatar { margin-top: 21px; }"));
  assert.ok(css.includes(".creator-chat .creator-chat-quote {"));
  assert.ok(css.includes("height: 19px;"));
  assert.ok(css.includes("white-space: nowrap; text-overflow: ellipsis;"));
  assert.ok(!css.includes('border-left: 2px solid #999999; border-radius: 0; background: #0D0D0D; padding: 8px 12px; margin-bottom: 8px;'));
  pass("Reply and avatar layout is compact; date dividers still provide day context without full-width quote boxes.");

  assert.ok(component.includes('onClick={() => onOpen(m.replyTo!.id)}'));
  assert.ok(component.includes('m.replyTo.deleted ? " · Deleted" : ""'));
  assert.ok(component.includes('m.replyTo.version > 1 ? " · edited" : ""'));
  assert.ok(backend.includes('if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained deleted messages.");'));
  pass("Original-message navigation, edited/deleted indicators and Owner permission boundaries are preserved.");
  console.log(`${passed} Discord-style Chat reply/timestamp regression groups passed.`);
} finally {
  await vite.close();
}
