import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const read = (path) => readFile(resolve(root, path), "utf8").then((s) => s.replace(/\r\n?/g, "\n"));
let passed = 0;
const pass = (text) => console.log(`PASS ${++passed}: ${text}`);
const vite = await createServer({ configFile: false, root, server: { middlewareMode: true, hmr: false }, optimizeDeps: { noDiscovery: true }, logLevel: "error" });
try {
  const lib = await vite.ssrLoadModule("/src/lib/hub-notifications.ts");
  assert.equal(lib.notificationHref({ type: "chat-message", conversationId: "c1", messageId: "m-1" }), "/chat?conversation=c1&message=m-1");
  assert.equal(lib.notificationHref({ type: "clock-request", requestId: "req_1" }), "/clock/requests/req_1");
  assert.equal(lib.notificationHref({ type: "clock" }), "/clock");
  assert.equal(lib.notificationHref(null), null);
  for (const bad of ["../admin", "a/b", "https://x", "", "x".repeat(101)]) {
    assert.equal(lib.notificationHref({ type: "chat-message", conversationId: bad, messageId: "m1" }), null);
    assert.equal(lib.notificationHref({ type: "clock-request", requestId: bad }), null);
  }
  pass("Notice links stay inside the Hub and refuse malformed or external identifiers");

  const now = Date.parse("2026-11-21T12:00:00Z");
  assert.equal(lib.relativeNotificationTime("2026-11-21T11:59:45Z", now), "Just now");
  assert.equal(lib.relativeNotificationTime("2026-11-21T11:56:00Z", now), "4 min ago");
  assert.equal(lib.relativeNotificationTime("2026-11-21T10:00:00Z", now), "2 h ago");
  assert.equal(lib.relativeNotificationTime("2026-11-20T11:00:00Z", now), "Yesterday");
  assert.equal(lib.relativeNotificationTime("2026-11-18T12:00:00Z", now), "3 days ago");
  assert.equal(lib.relativeNotificationTime("2026-11-01T12:00:00Z", now), "Nov 1");
  assert.ok(!lib.DEVICE_NOTICE_KINDS.has("MENTION") && !lib.DEVICE_NOTICE_KINDS.has("ANNOUNCEMENT") && lib.DEVICE_NOTICE_KINDS.has("BREAK_REMINDER"));
  pass("Relative times read naturally in US Central, and only attendance/correction notices may reach the device");

  const bell = await read("src/components/NotificationBell.tsx");
  const layout = await read("src/components/AppLayout.tsx");
  const sidebar = await read("src/components/SidebarNavigation.tsx");
  const chat = await read("src/pages/ChatPage.tsx");
  assert.ok(layout.includes("<NotificationBell />") && !layout.includes("ClockAlerts"));
  assert.ok(!bell.includes("/api/chat/unread"), "Chat unread counts stay on channel badges, never in the bell");
  assert.ok(bell.includes('aria-haspopup="dialog"') && bell.includes("aria-expanded={open}") && bell.includes('event.key === "Escape"'));
  assert.ok(bell.includes("See older notifications") && bell.includes("Mark all as read") && bell.includes(">New<") && bell.includes(">Earlier<"));
  assert.ok(!sidebar.includes("mentions=1") && !sidebar.includes("useChatMentionCount"), "The bell replaces the separate sidebar mention badge");
  assert.ok(chat.includes("searchParams.get('message')") && chat.includes('next.delete("message")'));
  pass("One header bell holds mentions, announcements, attendance and corrections; Chat opens the exact linked message");

  const css = await read("src/components/NotificationBell.css");
  const approved = new Set(["#000000", "#0D0D0D", "#141414", "#1A1A1A", "#FFFFFF", "#CCCCCC", "#999999", "#8E8E8E", "#5C5C5C", "#333333", "#666666"]);
  const colours = [...css.matchAll(/#[0-9A-Fa-f]{3,8}\b/g)].map((m) => m[0].toUpperCase());
  assert.ok(colours.length > 0 && colours.every((c) => approved.has(c)), "Only approved monochrome tokens: " + colours.filter((c) => !approved.has(c)).join(", "));
  const corners = [...css.matchAll(/border-radius:\s*([^;}]+)/g)].map((m) => m[1].trim());
  assert.ok(corners.length > 0 && corners.every((value) => ["2px", "0", "50%"].includes(value)), "Corners stay at 2px (the unread dot is the only circle): " + corners.join(", "));
  assert.ok(!/box-shadow|linear-gradient/.test(css));
  assert.ok(css.includes("@media (max-width: 720px)") && css.includes(":focus-visible"));
  pass("Bell styling follows the XYZ web kit: monochrome tokens, 2px corners, no shadows, focus outline and a phone layout");
  console.log(`${passed} notification bell groups passed.`);
} finally { await vite.close(); }
