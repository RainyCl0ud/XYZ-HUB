import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";
import { runInNewContext } from "node:vm";

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
  assert.ok(html.includes("More actions for message by Test author"));
  assert.ok(!html.includes(">Edit</button>"), "Edit is only shown when More opens.");
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
  assert.ok(moderator.includes("More actions for message by Test author") && !moderator.includes(">View history</button>"));
  assert.ok(moderator.includes('class="creator-chat-action-menu"') && moderator.includes('More actions for message by Test author'));
  console.log("PASS: redacted reply previews reveal no deleted source and moderation/history controls follow separate server capabilities.");
  const attachment = { fileName: "Floor report <test>.txt", byteSize: 8, available: true };
  const file = render({ ...legacy, text: "", canEdit: false, attachment });
  assert.ok(file.includes("Floor report &lt;test&gt;.txt"));
  assert.ok(file.includes("More actions for message by Test author"));
  assert.ok(!file.includes("/api/chat/channels/test-channel/messages/old-message/file"), "Download stays inside More until opened.");
  assert.ok(!file.includes(">Edit</button>"));
  assert.ok(render({ ...legacy, text: "", attachment: { ...attachment, available: false } }).includes("File unavailable"));
  console.log("PASS: files use an authenticated download link and unavailable files are labeled.");
  assert.ok(!file.includes("/preview"));
  const image = render({ ...legacy, text: "", attachment: { ...attachment, fileName: "Preview.jpg", canPreview: true } });
  assert.ok(image.includes("/api/chat/channels/test-channel/messages/old-message/preview"));
  assert.ok(image.includes('loading="lazy"') && image.includes('alt="Preview of Preview.jpg"'));
  assert.ok(!image.includes("/api/chat/channels/test-channel/messages/old-message/file"), "Download stays hidden until More opens.");
  console.log("PASS: an eligible image loads its small preview separately from the original download.");
  const voice = render({ ...legacy, text: "", attachment: { ...attachment, fileName: "Voice message.wav", voiceDurationMs: 2300 } });
  assert.ok(voice.includes("Play voice message") && !voice.includes(">Voice message</strong>"));
  assert.ok(voice.includes('preload="none"') && !voice.includes("/voice"));
  console.log("PASS: rendering a voice message exposes a Play button without requesting audio.");
  const source = await readFile(resolve(root, "src/pages/ChatMessageTools.tsx"), "utf8");
  assert.ok(source.includes('m.canModerate && onModerate && <button'));
  assert.ok(source.includes('href={`${attachmentPath}/file`}'));
  assert.ok(source.includes('createPortal('));
  console.log("PASS: permitted message controls are rendered only when their floating More menu opens.");
  const worklet = await readFile(resolve(root, "public/chat-voice-recorder-v1.js"), "utf8");
  let Recorder;
  const messages = [];
  runInNewContext(worklet, {
    AudioWorkletProcessor: class { port = { postMessage: message => messages.push(message) }; },
    registerProcessor: (_, processor) => { Recorder = processor; },
  });
  const limited = new Recorder({ processorOptions: { maxFrames: 3 } });
  assert.equal(limited.process([[Float32Array.of(-1, 0, 1, 1)]]), false);
  assert.deepEqual(Array.from(messages[0].samples), [-32768, 0, 32767]);
  assert.equal(messages[1].done, true);
  limited.port.onmessage();
  assert.equal(messages.length, 2);
  messages.length = 0;
  const stopped = new Recorder({ processorOptions: { maxFrames: 10_000 } });
  assert.equal(stopped.process([[new Float32Array(4100)]]), true);
  stopped.port.onmessage();
  assert.deepEqual(messages.map(message => message.samples?.length ?? message.done), [4096, 4, true]);
  console.log("PASS: the recorder flushes all samples on Stop and stops exactly at the recording limit.");
} finally { await vite.close(); }
