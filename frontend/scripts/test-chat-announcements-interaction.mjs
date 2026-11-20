import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n?/g, "\n");
const [page, css, tools, announcements, reminders, service, routes] = await Promise.all([
  read("src/pages/ChatPage.tsx"),
  read("src/pages/ChatPage.css"),
  read("src/pages/ChatMessageTools.tsx"),
  read("src/pages/ChatAnnouncements.tsx"),
  read("src/pages/AuditEmailDelivery.tsx"),
  read("../backend/src/services/chat-announcements.ts"),
  read("../backend/src/routes/chat.ts"),
]);
let passed = 0;
const pass = (name) => console.log("PASS " + (++passed) + ": " + name);
const vite = await createServer({
  root, configFile: false, envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false },
  logLevel: "error",
});
try {
  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const { ToastProvider } = await vite.ssrLoadModule("/src/components/ToastProvider.tsx");
  const renderToast = element => renderToStaticMarkup(createElement(ToastProvider, null, element));
  const noop = () => {};
  const normalMessage = {
    id: "hover-message", authorName: "Reviewer", text: "Hello team!",
    version: 1, createdAt: "2026-11-17T05:30:00.000Z", updatedAt: "2026-11-17T05:30:00.000Z",
    canEdit: true, canReply: true, canPin: true, pinVersion: 1,
    pinnedAt: null, pinnedByName: null, reactions: [], replyTo: null,
  };
  const renderMessage = (m) => renderToast(createElement(ChatMessageContent, {
    message: m, channelId: "test-channel", onReply: noop, onEdit: noop,
    onChanged: noop, onOpen: noop, onError: noop,
  }));

  const message = renderMessage(normalMessage);
  assert.ok(message.includes("Hello team!"));
  assert.ok(message.includes('class="creator-chat-touch-actions-toggle"'));
  assert.ok(message.includes('aria-label="Message actions for Reviewer"'));
  assert.ok(message.includes('aria-expanded="false"'));
  assert.ok(message.includes('data-touch-open="false"'));
  assert.ok(message.includes('class="creator-chat-message-actions"'));
  pass("Real message UI starts with explicit, closed touch actions and preserves hover toolbar controls.");

  assert.ok(!page.includes("tabIndex={m.deleted ? undefined : 0}"));
  assert.ok(!page.includes('event.currentTarget.focus({ preventScroll: true })'));
  assert.ok(!page.includes('event.pointerType !== "touch"'));
  const transcriptRow = await read("src/pages/ChatTranscriptMessage.tsx");
  assert.ok(page.includes('<ChatTranscriptMessage'));
  assert.ok(transcriptRow.includes('data-chat-message-id={m.id}'));
  assert.ok(css.includes("@media (hover: hover) and (pointer: fine)"));
  assert.ok(css.includes(".creator-chat .creator-chat-message:hover .creator-chat-message-actions"));
  assert.ok(css.includes(".creator-chat .creator-chat-message-actions:focus-within"));
  assert.ok(!css.includes(".creator-chat .creator-chat-message:focus-within .creator-chat-message-actions"));
  pass("Clicking blank message content no longer focuses the row or keeps reaction actions open.");

  assert.ok(tools.includes("const [touchActionsOpen, setTouchActionsOpen] = useState(false)"));
  assert.ok(tools.includes('className="creator-chat-touch-actions-toggle"'));
  assert.ok(tools.includes("onClick={() => setTouchActionsOpen((open) => !open)}"));
  assert.ok(tools.includes('data-touch-open={touchActionsOpen}'));
  assert.ok(css.includes('.creator-chat .creator-chat-message-actions[data-touch-open="true"]'));
  assert.ok(css.includes('.creator-chat .creator-chat-touch-actions-toggle[aria-expanded="true"]'));
  assert.ok(tools.includes('document.addEventListener("pointerdown", closeOutside)'));
  assert.ok(tools.includes('document.removeEventListener("pointerdown", closeOutside)'));
  pass("Touch uses an intentional actions button with outside-dismissal, without any message-row focus handler.");

  const actual = renderMessage({
    ...normalMessage, id: "ann-1", text: "New staff workflow\n\nPlease follow the updated instructions.\nCheck with management if unsure.",
    announcement: true, systemNotice: true, canEdit: false, canReply: false, canPin: false,
  });
  assert.ok(actual.includes('class="creator-chat-announcement-message"'));
  assert.ok(actual.includes("<h4>New staff workflow</h4>"));
  assert.ok(actual.includes("Please follow the updated instructions."));
  assert.ok(actual.includes('class="creator-chat-announcement-tag"'));
  assert.ok(!actual.includes('class="creator-chat-touch-actions-toggle"'));
  assert.ok(!message.includes('class="creator-chat-announcement-message"'));
  assert.ok(transcriptRow.includes('m.announcement ? "is-announcement" : ""'));
  assert.ok(css.includes(".creator-chat .creator-chat-message.is-announcement {"));
  pass("Published staff announcements display structured titles/bodies without turning ordinary messages into announcement cards.");

  const { default: ChatAnnouncements } = await vite.ssrLoadModule("/src/pages/ChatAnnouncements.tsx");
  const compose = renderToast(createElement(ChatAnnouncements, { onClose: noop, onPublished: noop }));
  for (const copy of ["Staff announcements", "Compose", "Review", "Published",
    "Compose announcement", "Who receives it", "Review audience", "Title", "Message"]) {
    assert.ok(compose.includes(copy), "Missing announcement workflow UI: " + copy);
  }
  assert.ok(compose.includes('aria-label="Announcement workflow"'));
  assert.ok(compose.includes('aria-current="step"'));
  assert.ok(compose.includes("Review audience"));
  pass("Announcement modal renders an accessible three-step workflow, message editor and destination summary.");

  assert.ok(announcements.includes('setPreview(result); setConfirmed(false); requestId.current = crypto.randomUUID();'));
  assert.ok(announcements.includes('previewToken: preview.previewToken'));
  assert.ok(announcements.includes('requestId: requestId.current'));
  assert.ok(announcements.includes('disabled={busy || !confirmed || !!preview.blockers.length}'));
  assert.ok(announcements.includes("uncertain ? 'Check submission' : 'Publish announcement'"));
  assert.ok(announcements.includes('if (busy || uncertain) e.preventDefault()'));
  pass("The redesigned review retains audience validation, explicit confirmation, idempotent publication and uncertain-delivery safeguards.");

  assert.ok(announcements.includes('className="creator-chat-announcement-reach"'));
  assert.ok(announcements.includes('preview.staffCount'));
  assert.ok(announcements.includes('preview.creatorCount'));
  assert.ok(announcements.includes('preview.privateCopyCount'));
  assert.ok(announcements.includes('preview.recipients.map('));
  assert.ok(announcements.includes('posted.deliveries.map('));
  assert.ok(announcements.includes('creator-chat-announcement-disclosure'));
  assert.ok(css.includes(".creator-chat-announcement-compose-layout {"));
  assert.ok(css.includes("grid-template-columns: minmax(0, 1.5fr) minmax(240px, .9fr)"));
  assert.ok(css.includes(".creator-chat-announcement-workspace {"));
  assert.ok(css.includes("overflow-y: auto;"));
  assert.ok(announcements.includes('className="creator-chat-announcement-recipient-list"'));
  assert.ok(announcements.includes('<span>{r.name}</span>'));
  assert.ok(announcements.includes('Also receives a private Chat copy'));
  assert.ok(!announcements.includes('creator-chat-announcement-recipient-avatar'));
  assert.ok(!announcements.includes('creator-chat-announcement-recipient-indicator'));
  assert.ok(css.includes('max-height: 220px;'));
  pass("Audience counts and recipient/delivery drill-downs are compact and internally scrollable.");

  // The footer must be outside .creator-chat-announcement-workspace. In the
  // Compose stage this is also verifiable from the actual server-rendered UI.
  assert.equal((announcements.match(/className="creator-chat-dialog-actions creator-chat-announcement-footer"/g) ?? []).length, 1);
  assert.ok(announcements.includes('<footer className="creator-chat-dialog-actions creator-chat-announcement-footer" aria-label="Announcement actions">'));
  assert.ok(announcements.includes('form id="chat-announcement-compose-form"'));
  assert.ok(announcements.includes('type="submit" form="chat-announcement-compose-form"'));
  assert.ok(announcements.indexOf('    </div>\n    <footer className="creator-chat-dialog-actions creator-chat-announcement-footer"') > announcements.indexOf('    <div className="creator-chat-announcement-workspace">'));
  assert.ok(compose.includes('aria-label="Announcement actions"'));
  assert.ok(compose.includes('form="chat-announcement-compose-form"'));
  assert.ok(compose.includes('id="chat-announcement-compose-form"'));
  assert.ok(css.includes('.creator-chat-announcements > .creator-chat-announcement-footer {'));
  assert.ok(css.includes('flex: 0 0 auto;'));
  assert.ok(css.includes('min-height: 0;\n  overflow-y: auto;'));
  assert.ok(announcements.includes('disabled={busy || uncertain} onClick={() => { setPreview(null); setConfirmed(false); setError(\'\'); }}'));
  assert.ok(announcements.includes('onClick={() => void publish()}'));
  pass("All stage actions render once in a footer outside the scrollable workspace; Compose submission and guarded Review actions stay wired.");

  assert.equal((announcements.match(/creator-chat-announcement-disclosure-icon/g) ?? []).length, 2);
  assert.equal((announcements.match(/creator-chat-announcement-disclosure-title/g) ?? []).length, 2);
  assert.equal((announcements.match(/creator-chat-announcement-disclosure-meta/g) ?? []).length, 2);
  assert.equal((announcements.match(/<path d="m5 7 5 5 5-5"/g) ?? []).length, 2);
  assert.ok(!announcements.includes('creator-chat-announcement-disclosure-plus'));
  assert.ok(css.includes('grid-template-columns: minmax(0, 1fr) auto 18px;'));
  assert.ok(css.includes('.creator-chat-announcement-disclosure[open] > summary .creator-chat-announcement-disclosure-icon { transform: rotate(180deg); }'));
  assert.ok(css.includes('.creator-chat-announcements .creator-chat-announcement-disclosure > summary:focus-visible'));
  assert.ok(css.includes('@media (prefers-reduced-motion: reduce)'));
  assert.ok(css.includes('.creator-chat-announcements label.creator-chat-announcement-confirm {'));
  assert.ok(css.includes('text-transform: none;'));
  pass("Chevron disclosures align label and count, rotate on expansion, and preserve keyboard accessibility.");

  assert.ok(!announcements.includes("Email previews only — no emails sent."));
  assert.ok(!announcements.includes("No emails will be sent during testing."));
  assert.ok(!announcements.includes("approved test addresses"));
  assert.ok(!announcements.includes("Not sent (test)"));
  assert.ok(!announcements.includes("View sample email"));
  assert.ok(!announcements.includes("creator-chat-announcement-email-note"));
  assert.ok(!announcements.includes("emailNotice("));
  assert.ok(!announcements.includes("preview.emailMode"));
  assert.ok(announcements.includes("CAPTURED: 'Not emailed'"));
  assert.ok(announcements.includes("View email details"));
  assert.ok(announcements.includes("Staff email status"));
  assert.ok(announcements.includes("posted.deliveries.map("));
  assert.ok(!announcements.includes("Preview mode"));
  assert.ok(!announcements.includes("Email delivery</span>"));
  pass("Staff-facing announcement flow omits testing-only notices while retaining accurate post-publication email status.");

  assert.ok(service.includes("where: { key: 'updates'"));
  assert.ok(service.includes("export function buildAnnouncementEmail"));
  assert.ok(service.includes("!person.creatorProfile"));
  assert.ok(service.includes("role.systemKey === 'MODEL'"));
  assert.ok(announcements.includes("Model #Updates channels"));
  assert.ok(announcements.includes("Only selected staff can see the Chat announcement or receive its email."));
  assert.ok(announcements.includes("Additional private chats"));
  assert.ok(announcements.includes("Under the current setup, some staff receive an additional private Chat copy."));
  assert.ok(!announcements.includes("Private Hub copies"));
  assert.ok(css.includes("repeat(auto-fit, minmax(165px, 1fr))"));
  pass("Staff announcements distinguish the brief-required model Updates and staff emails from the additional private Chat copy implementation.");

  assert.ok(page.includes('{canAnnounce && <button'));
  assert.ok(routes.includes('router.post("/announcements/preview"'));
  assert.ok(routes.includes('router.post("/announcements"'));
  assert.ok(service.includes("chat.announcements.send"));
  assert.ok(service.includes("OWNER") && service.includes("OPS_MANAGER"));
  assert.ok(service.includes("previewToken"));
  assert.ok(service.includes("requestId"));
  pass("The backend's authorization, preview token and audience recheck remain unchanged.");

  console.log(passed + " Chat hover-actions and staff-announcement workflow regression groups passed.");
} finally {
  await vite.close();
}
