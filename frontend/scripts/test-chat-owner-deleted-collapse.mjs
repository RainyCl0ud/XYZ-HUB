import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n?/g, "\n");
const vite = await createServer({
  root, configFile: false, envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false }, logLevel: "error",
});
let passes = 0;
const pass = (label) => console.log(`PASS ${++passes}: ${label}`);
try {
  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const noop = () => {};
  const base = {
    id: "deleted-test", authorName: "Retained author", text: "Confidential retained message body",
    version: 1, createdAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z",
    canEdit: false, canReply: false, canPin: false, canModerate: false,
    canViewHistory: true, pinnedAt: null, pinnedByName: null, reactions: [], replyTo: null,
  };
  const render = (message) => renderToStaticMarkup(createElement(ChatMessageContent, {
    message, channelId: "owner-test", onReply: noop, onChanged: noop,
    onOpen: noop, onError: noop, onHistory: noop,
  }));
  const kept = { ...base, deleted: { at: base.createdAt, by: "Retained moderator", reason: "Retained reason" } };
  const collapsed = render(kept);
  assert.ok(collapsed.includes('class="creator-chat-deleted-toggle"'));
  assert.ok(collapsed.includes(">Deleted Messages</button>"));
  assert.ok(collapsed.includes('aria-expanded="false"'));
  assert.ok(collapsed.includes("is-deleted is-collapsed"));
  pass("A retained message starts as one accessible collapsed Deleted Messages control.");

  for (const hidden of ["Confidential retained message body", "Retained author", "Retained moderator",
    "Retained reason", "Deleted · Owner view", "View history", "creator-chat-file", "creator-chat-deleted-notice"]) {
    assert.ok(!collapsed.includes(hidden), "Collapsed content leaked: " + hidden);
  }
  assert.equal((collapsed.match(/<button\b/g) ?? []).length, 1);
  pass("Collapsed Owner view renders no original text, attribution, metadata, actions, or attached media.");

  const retainedFile = render({
    ...kept, text: "", attachment: { fileName: "Secret retained photo.png", byteSize: 2048, available: true, canPreview: true },
  });
  assert.ok(retainedFile.includes(">Deleted Messages</button>"));
  assert.ok(!retainedFile.includes("Secret retained photo.png"));
  assert.ok(!retainedFile.includes("/preview"));
  assert.ok(!retainedFile.includes("/file"));
  assert.ok(!retainedFile.includes("creator-chat-image-preview"));
  pass("Retained image and attachment previews do not mount or request data until expanded.");

  const normal = render({ ...base, deleted: null });
  assert.ok(normal.includes("Confidential retained message body"));
  assert.ok(normal.includes("Retained author"));
  assert.ok(!normal.includes("Deleted Messages"));
  pass("Ordinary and existing older messages retain their normal rendering.");

  const [source, page, css, backend] = await Promise.all([
    read("src/pages/ChatMessageTools.tsx"),
    read("src/pages/ChatPage.tsx"),
    read("src/pages/ChatPage.css"),
    read("../backend/src/services/creator-chat.ts"),
  ]);
  assert.ok(source.includes('const [deletedExpanded, setDeletedExpanded] = useState(false)'));
  assert.ok(source.includes('onClick={() => setDeletedExpanded((open) => !open)}'));
  assert.ok(source.includes('{(!m.deleted || deletedExpanded) && <>'));
  assert.ok(source.includes('{m.deleted && <div className="creator-chat-deleted-notice">'));
  assert.ok(source.includes('m.canViewHistory && onHistory'));
  pass("Disclosure can expand/collapse the same Owner-retained body and keep history accessible.");

  assert.ok(page.includes('m.deleted ? "is-deleted-message" : ""'));
  assert.ok(page.includes('{!m.deleted && <div className="creator-chat-avatar"'));
  assert.ok(css.includes('.creator-chat .creator-chat-message.is-deleted-message {'));
  assert.ok(css.includes('margin-bottom: 6px;'));
  assert.ok(css.includes('.creator-chat .creator-chat-deleted-toggle {'));
  assert.ok(css.includes('color: #F08080;'));
  assert.ok(css.includes('.creator-chat-message-content.is-deleted.is-expanded {'));
  assert.ok(!css.includes('.creator-chat-message-content.is-deleted { border: 2px solid #FFFFFF;'));
  pass("Deleted rows are compact and red, with no redundant avatar or large default border.");

  assert.ok(backend.includes('if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained deleted messages.");'));
  assert.ok(backend.includes('if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained message history.");'));
  assert.ok(backend.includes('...visibleMessages(viewer)'));
  pass("No change to the backend's Owner-only deleted-message and history access gates.");

  console.log(`${passes} Owner deleted-message disclosure regression groups passed.`);
} finally {
  await vite.close();
}
