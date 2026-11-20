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
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const renderToast = element => renderToStaticMarkup(createElement(ToastProvider, null, element));
  const noop = () => {};
  const base = {
    id: "deleted-test", authorName: "Retained author", text: "Confidential retained message body",
    version: 1, createdAt: "2026-11-15T12:00:00Z", updatedAt: "2026-11-15T12:00:00Z",
    canEdit: false, canReply: false, canPin: false, canModerate: false,
    canViewHistory: true, pinnedAt: null, pinnedByName: null, reactions: [], replyTo: null,
  };
  const render = (message) => renderToast(createElement(ChatMessageContent, {
    message, channelId: "owner-test", onReply: noop, onChanged: noop,
    onOpen: noop, onError: noop, onHistory: noop,
  }));
  const kept = { ...base, deleted: { at: base.createdAt, by: "Retained moderator", reason: "Retained reason" } };
  const collapsed = render(kept);
  assert.ok(collapsed.includes('class="creator-chat-deleted-toggle"'));
  assert.ok(collapsed.includes(">Deleted Message</button>"));
  assert.ok(collapsed.includes('aria-expanded="false"'));
  assert.ok(collapsed.includes("is-deleted is-collapsed"));
  assert.ok(collapsed.includes("Retained author"));
  assert.ok(collapsed.includes(`dateTime="${base.createdAt}"`) || collapsed.includes(`datetime="${base.createdAt}"`));
  assert.ok(collapsed.indexOf("Retained author") < collapsed.indexOf(">Deleted Message</button>"));
  pass("A retained message keeps its original author/time above the compact Deleted Message control.");

  for (const hidden of ["Confidential retained message body", "Retained moderator",
    "Retained reason", "Deleted · Owner view", "View history", "creator-chat-file", "creator-chat-deleted-notice"]) {
    assert.ok(!collapsed.includes(hidden), "Collapsed content leaked: " + hidden);
  }
  assert.equal((collapsed.match(/<button\b/g) ?? []).length, 1);
  pass("Collapsed Owner view hides retained body, deletion metadata, actions and media without concealing the original author/time.");

  const retainedFile = render({
    ...kept, text: "", attachment: { fileName: "Secret retained photo.png", byteSize: 2048, available: true, canPreview: true },
  });
  assert.ok(retainedFile.includes(">Deleted Message</button>"));
  assert.ok(!retainedFile.includes("Secret retained photo.png"));
  assert.ok(!retainedFile.includes("/preview"));
  assert.ok(!retainedFile.includes("/file"));
  assert.ok(!retainedFile.includes("creator-chat-image-preview"));
  assert.ok((await read("src/pages/ChatMessageTools.tsx")).includes('(!m.attachment.canPreview || !m.attachment.available || !!voiceDuration)'));
  pass("Retained image previews load only when expanded; previewable images omit redundant filenames and sizes.");

  const normal = render({ ...base, deleted: null });
  assert.ok(normal.includes("Confidential retained message body"));
  assert.ok(normal.includes("Retained author"));
  assert.ok(!normal.includes("Deleted Message"));
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
  assert.ok(source.includes('className="creator-chat-deleted-author"'));
  assert.ok(source.includes('{!m.deleted && !compact && <header>'));
  assert.ok(!source.includes('Deleted by {m.deleted.by}'));
  assert.ok(!source.includes('Reason: {m.deleted.reason}'));
  assert.ok(!source.includes('Deleted · Owner view</strong>'));
  assert.ok(source.includes('m.canViewHistory && onHistory'));
  pass("Expanding keeps original content and Owner history, without repeating the author or deletion metadata.");

  const rowSource = await read("src/pages/ChatTranscriptMessage.tsx");
  assert.ok(page.includes('<ChatTranscriptMessage'));
  assert.ok(rowSource.includes('m.deleted ? "is-deleted-message" : ""'));
  assert.ok(rowSource.includes('<div className="creator-chat-avatar" aria-hidden="true">{m.authorName.slice(0, 1).toUpperCase()}</div>'));
  assert.ok(rowSource.includes('<ChatMessageContent'));
  assert.ok(css.includes('.creator-chat .creator-chat-message.is-deleted-message {'));
  assert.ok(css.includes('margin-bottom: 10px;'));
  assert.ok(css.includes('.creator-chat .creator-chat-deleted-toggle {'));
  assert.ok(css.includes('.creator-chat-message-content .creator-chat-deleted-author {'));
  assert.ok(css.includes('color: #F08080;'));
  assert.ok(css.includes('.creator-chat-message-content.is-deleted.is-expanded {'));
  assert.ok(!css.includes('rgba(138, 39, 39, .07)'));
  pass("Deleted author/time align with ordinary messages and expanded content has no oversized red panel.");

  assert.ok(backend.includes('if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained deleted messages.");'));
  assert.ok(backend.includes('if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained message history.");'));
  assert.ok(backend.includes('...visibleMessages(viewer)'));
  pass("No change to the backend's Owner-only deleted-message and history access gates.");

  console.log(`${passes} Owner deleted-message disclosure regression groups passed.`);
} finally {
  await vite.close();
}
