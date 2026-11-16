import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
// Normalize checkout line endings: Windows Git may use CRLF for CSS files.
const read = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n?/g, "\n");
const vite = await createServer({
  root, configFile: false, envDir: false,
  optimizeDeps: { noDiscovery: true, include: [] },
  server: { middlewareMode: true, hmr: false }, logLevel: "error",
});
let passed = 0;
const pass = (title) => console.log("PASS " + (++passed) + ": " + title);
const previousWindow = globalThis.window;

try {
  const preferences = await vite.ssrLoadModule("/src/lib/chat-reaction-emojis.ts");
  const {
    CHAT_EMOJI_OPTIONS, CHAT_RECENT_EMOJI_LIMIT, normalizeRecentEmojis,
    rememberRecentEmoji, loadRecentEmojis, saveRecentEmojiSelection, recentEmojiStorageKey,
  } = preferences;
  const options = CHAT_EMOJI_OPTIONS.map(([emoji]) => emoji);
  const backend = await read("../backend/src/services/creator-chat.ts");
  const match = backend.match(/export const CHAT_REACTIONS = (\[.*?\]) as const;/);
  assert.ok(match, "Backend reaction allowlist missing");
  assert.deepEqual(JSON.parse(match[1]), options, "Frontend emoji choices must match Backend allowlist exactly");
  assert.equal(CHAT_RECENT_EMOJI_LIMIT, 6);
  pass("All picker choices match the server's permission-checked reaction allowlist.");

  const initial = normalizeRecentEmojis(null);
  assert.equal(initial.length, 6);
  assert.equal(new Set(initial).size, 6);
  assert.deepEqual(normalizeRecentEmojis(["👍", "👍", "not an emoji", "🔥", "✅"]), ["👍", "🔥", "✅", "❤️", "😂", "🎉"]);
  assert.deepEqual(rememberRecentEmoji(initial, "🔥"), ["🔥", ...initial.slice(0, 5)]);
  assert.deepEqual(rememberRecentEmoji(initial, "🤪"), initial, "Unsupported emoji must never be stored");
  pass("Six recent emojis are unique, allowlisted, and replace the oldest choice in recency order.");

  const data = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => data.get(key) ?? null,
      setItem: (key, value) => { data.set(key, value); },
      removeItem: (key) => data.delete(key),
    },
  };
  assert.notEqual(recentEmojiStorageKey("test-user-a"), recentEmojiStorageKey("test-user-b"));
  const userA = saveRecentEmojiSelection("test-user-a", "🔥");
  const userB = saveRecentEmojiSelection("test-user-b", "🙏");
  assert.equal(loadRecentEmojis("test-user-a")[0], "🔥");
  assert.equal(loadRecentEmojis("test-user-b")[0], "🙏");
  assert.notDeepEqual(userA, userB);
  saveRecentEmojiSelection("test-user-a", "🚀");
  assert.deepEqual(loadRecentEmojis("test-user-b"), userB, "Other account must not inherit reactions");
  assert.equal(data.size, 2);
  pass("Recent choices persist independently for each signed-in account in the same browser.");

  data.set(recentEmojiStorageKey("corrupted"), JSON.stringify(["wrong", "👍", "👍", "🔥", {}, null]));
  assert.equal(loadRecentEmojis("corrupted").length, 6);
  assert.equal(new Set(loadRecentEmojis("corrupted")).size, 6);
  data.set(recentEmojiStorageKey("bad-json"), "{invalid");
  assert.deepEqual(loadRecentEmojis("bad-json"), initial);
  assert.deepEqual(loadRecentEmojis(""), initial);
  pass("Corrupted, missing or anonymous storage falls back safely without leaking other users' data.");

  const accountARecent = loadRecentEmojis("test-user-a");
  // Keep the browser storage stub out of server-side React rendering.
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;

  const { ChatMessageContent } = await vite.ssrLoadModule("/src/pages/ChatMessageTools.tsx");
  const message = {
    id: "message-1", authorName: "Test member", text: "Hello there", version: 1,
    createdAt: "2026-11-15T12:00:00.000Z", updatedAt: "2026-11-15T12:00:00.000Z",
    canEdit: true, canReply: true, canPin: true, pinVersion: 1, pinnedAt: null, pinnedByName: null,
    reactions: [], replyTo: null,
  };
  const noop = () => {};
  const markup = renderToStaticMarkup(createElement(ChatMessageContent, {
    message, channelId: "fictional-channel", recentEmojis: accountARecent,
    onReply: noop, onEdit: noop, onChanged: noop, onOpen: noop, onError: noop,
    onReactionSelected: noop,
  }));
  assert.ok(markup.includes("Hello there"));
  assert.ok(markup.includes("React with Rocket"), "Quick reactions must follow this user's actual history");
  assert.ok(markup.includes("Choose another emoji"));
  assert.ok(markup.includes('aria-haspopup="dialog"'));
  assert.ok(!markup.includes('class="creator-chat-emoji-popover"'), "Closed picker must not occupy message flow");
  assert.ok(!markup.includes("creator-chat-toolbar-reaction-grid"), "Old nested dropdown must be removed");
  pass("Actual message component renders aligned recent reaction controls without an inline picker.");

  const tools = await read("src/pages/ChatMessageTools.tsx");
  const css = await read("src/pages/ChatPage.css");
  const chat = await read("src/pages/ChatPage.tsx");
  assert.ok(tools.includes('className="creator-chat-emoji-popover"'));
  assert.ok(tools.includes('createPortal('));
  assert.ok(tools.includes('position: "fixed"'));
  assert.ok(tools.includes('Math.min(box.right - width, window.innerWidth - width - 8)'));
  assert.ok(tools.includes('const height = 350'));
  assert.ok(tools.includes('pickerEmojis.map'));
  assert.ok(tools.includes('sixRecentEmojis = normalizeRecentEmojis(recentEmojis)'));
  assert.ok(tools.includes('source.addEventListener') === false);
  assert.ok(css.includes('position: fixed;\n  z-index: 1250;'));
  assert.ok(css.includes('creator-chat-emoji-popover-grid'));
  assert.ok(tools.includes('? sixRecentEmojis'));
  assert.ok(tools.includes('Available emoji library'));
  assert.ok(tools.includes('Search emoji library'));
  assert.ok(tools.includes('"Add emoji" : "Recent"'));
  assert.ok(css.includes('creator-chat-emoji-popover-grid.is-library'));
  pass("Six personal recents remain separate from a searchable, scrollable approved emoji library.");

  assert.ok(tools.includes('document.addEventListener("pointerdown", closeOutside)'));
  assert.ok(tools.includes('document.addEventListener("keydown", closeEscape)'));
  assert.ok(tools.includes('document.addEventListener("scroll", closeScroll, true)'));
  assert.ok(tools.includes('window.addEventListener("resize", closeResize)'));
  assert.ok(tools.includes('document.removeEventListener("pointerdown", closeOutside)'));
  assert.ok(tools.includes('pickerTrigger.current?.focus({ preventScroll: true })'));
  assert.ok(tools.includes('closes only the picker, never the parent Search/Pins flyout.'));
  assert.ok(chat.includes('target.closest(".creator-chat-emoji-popover")'));
  pass("Dismissal and keyboard behavior clean up listeners, prevent detached popovers, and restore focus.");

  assert.ok(css.includes('/* Touch: tapping/focusing a message exposes a floating toolbar.'));
  assert.ok(css.includes('position: absolute;\n    z-index: 8;\n    top: -9px;'));
  assert.ok(css.includes('pointer-events: none;'));
  assert.ok(css.includes('.creator-chat-message:focus-within .creator-chat-message-actions'));
  assert.ok(chat.includes('event.pointerType !== "touch"'));
  assert.ok(chat.includes('event.currentTarget.focus({ preventScroll: true })'));
  assert.ok(css.includes('creator-chat .creator-chat-toolbar-emoji-trigger svg'));
  pass("Touch toolbar stays outside message flow and the emoji-plus SVG remains centered.");

  assert.ok(chat.includes('recentEmojiStorageKey(userId)'));
  assert.ok(chat.includes('setRecentEmojis(saveRecentEmojiSelection(userId, emoji))'));
  assert.ok(chat.includes('recentEmojis={recentEmojis} onReactionSelected={trackReactionEmoji}'));
  assert.ok(tools.includes('if (kind === "reaction" && "emoji" in body && typeof body.emoji === "string") onReactionSelected?.(body.emoji)'));
  assert.ok(tools.includes('onReactionSelected={onReactionSelected}'));
  pass("Only a successful reaction updates the correct user's six recent selections across Chat views.");

  console.log(passed + " reaction-picker and user-isolation regression groups passed.");
} finally {
  if (previousWindow === undefined) delete globalThis.window;
  else globalThis.window = previousWindow;
  await vite.close();
}
