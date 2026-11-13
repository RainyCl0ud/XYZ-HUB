import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const source = async (path) => (await readFile(resolve(root, path), "utf8")).replace(/\r\n?/g, "\n");
const [chat, css, profile, profileCss, reminders, attach, voice, notification, message, player, provider] = await Promise.all([
  "src/pages/ChatPage.tsx",
  "src/pages/ChatPage.css",
  "src/pages/AccountPage.tsx",
  "src/pages/AccountPage.css",
  "src/pages/ChatUnreadReminders.tsx",
  "src/pages/ChatAttachmentPicker.tsx",
  "src/pages/ChatVoiceRecorder.tsx",
  "src/pages/ChatBrowserNotifications.tsx",
  "src/pages/ChatMessageTools.tsx",
  "src/pages/ChatVoicePlayback.tsx",
  "src/components/BrowserNotificationsProvider.tsx",
].map(source));
let count = 0;
const pass = (name) => console.log("PASS " + (++count) + ": " + name);

assert.ok(chat.includes('useState<"channels" | "private">("channels")'));
assert.ok(chat.includes('aria-pressed={channelFilter === "channels"}'));
assert.ok(chat.includes('aria-pressed={channelFilter === "private"}'));
assert.ok(!chat.includes("['all', 'All']"));
assert.ok(chat.includes('channelFilter === "private" ? c.isPrivate : !c.isPrivate'));
assert.ok(chat.includes("const archivedChannels = visibleChannels.filter((c) => c.archived);"));
assert.ok(chat.includes('"Archived private chats"'));
pass("Channels and Private are exclusive permission-filtered views; archived items stay in their corresponding type.");

assert.ok(chat.includes("const [showChannelSearch, setShowChannelSearch] = useState(false)"));
assert.ok(chat.includes('aria-controls="chat-conversation-search"'));
assert.ok(chat.includes('aria-expanded={showChannelSearch}'));
assert.ok(chat.includes('{showChannelSearch && <div id="chat-conversation-search"'));
assert.ok(chat.includes('aria-label={showChannelSearch ? "Close conversation search" : "Search conversations"}'));
assert.ok(chat.includes('if (showChannelSearch) { setChannelSearch(""); setUnreadOnly(false); }'));
assert.ok(chat.includes('if (showChannelSearch) channelSearchInput.current?.focus()'));
pass("Conversation search is off by default, accessible, focused on open and cleared on close.");

assert.ok(chat.includes('e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing'));
assert.ok(chat.includes("e.keyCode === 229 || e.repeat"));
assert.ok(chat.includes("e.preventDefault();"));
assert.ok(chat.includes('e.currentTarget.form?.requestSubmit();'));
assert.ok(chat.includes("!sending && draft.trim() && !editConflict && !unchangedEdit"));
assert.ok(chat.includes("Enter to send · Shift + Enter for a new line"));
assert.ok(chat.includes('type="submit" className="creator-chat-send"'));
pass("Enter submits nonempty messages, Shift+Enter keeps a newline, and composing/repeating/invalid states are guarded.");

assert.ok(chat.includes('aria-label="Add attachment or voice message"'));
assert.ok(chat.includes('id="chat-composer-menu"'));
assert.ok(chat.includes("attachmentPicker.current?.open()"));
assert.ok(chat.includes("voiceRecorder.current?.start()"));
assert.ok(chat.includes('setComposerFileActive(false)'));
assert.ok(chat.includes('setComposerVoiceActive(false)'));
assert.ok(attach.includes("forwardRef<ChatAttachmentPickerHandle"));
assert.ok(attach.includes("useImperativeHandle(ref"));
assert.ok(attach.includes('type="file" hidden'));
assert.ok(attach.includes('aria-label="Send selected file"'));
assert.ok(voice.includes("forwardRef<ChatVoiceRecorderHandle"));
assert.ok(voice.includes("useImperativeHandle(ref"));
assert.ok(voice.includes('aria-label="Stop recording"'));
assert.ok(voice.includes('aria-label="Discard recording"'));
assert.ok(voice.includes('aria-label="Send voice message"'));
assert.ok(voice.includes("ChatVoicePlayback"));
pass("Composer + menu starts uploads and recording directly; compact voice controls preserve send/discard and one draft at a time.");

assert.ok(!chat.includes("ChatBrowserNotifications"));
assert.ok(!chat.includes("useBrowserNotifications"));
assert.ok(profile.includes('lazy(() => import("./ChatBrowserNotifications"))'));
assert.ok(profile.includes('access?.permissions.includes("chat.access")'));
assert.ok(profile.includes('role="switch"'));
assert.ok(profile.includes('className="account-notification-toggle"'));
assert.ok(profile.includes('aria-checked={!!notificationControls?.enabled'));
assert.ok(profile.includes("notificationControls.enable()"));
assert.ok(profile.includes("notificationControls.disable()"));
assert.ok(profile.includes("Advanced notification settings"));
assert.ok(profile.includes("notificationSettingsOpen"));
assert.ok(notification.includes("controls.enable()"));
assert.ok(notification.includes("controls.disable"));
assert.ok(notification.includes("BackgroundPushSettings"));
assert.ok(notification.includes("without replaying old unread messages"));
assert.ok(provider.includes("void releaseBackgroundPush(id)"));
pass("My Account has a monochrome opt-in switch; Off also releases previous background push and advanced setup remains reachable.");

assert.ok(reminders.includes("Email reminder activity"));
assert.ok(reminders.includes('Preview mode — no emails are sent'));
assert.ok(reminders.includes("Messages eligible"));
assert.ok(reminders.includes("Next possible reminder"));
assert.ok(reminders.includes("How email reminders work"));
assert.ok(reminders.includes("never message text, fan names or attachments"));
assert.ok(reminders.includes("Refresh activity"));
assert.ok(reminders.includes("not a personal email on/off switch"));
assert.ok(reminders.includes("Recent reminder activity"));
pass("Email reminder activity explains its schedule, capture mode, privacy and delivery history without a false on/off switch.");

assert.ok(css.includes(".creator-chat-browse-switcher"));
assert.ok(css.includes(".creator-chat-search-panel"));
assert.ok(css.includes(".creator-chat-composer-bar"));
assert.ok(css.includes(".creator-chat-composer-menu"));
assert.ok(css.includes(".creator-chat-voice-player"));
assert.ok(css.includes(".creator-chat-action-menu > summary"));
assert.ok(css.includes(".creator-chat-reminder-summary"));
assert.ok(css.includes("@media (max-width: 720px)"));
assert.ok(profileCss.includes(".account-notification-card"));
assert.ok(profileCss.includes(".account-notification-knob"));
assert.ok(profileCss.includes('.account-notification-toggle[aria-checked="true"]'));
assert.ok(profileCss.includes("@media (max-width: 720px)"));
pass("Responsive conversation, composer, reminders and profile controls retain mobile layout rules.");

assert.ok(message.includes('className="creator-chat-action-menu"'));
assert.ok(message.includes('Download file</a>'));
assert.ok(message.includes('Delete message…</button>'));
assert.ok(message.includes('aria-label={\`More actions for message by \${m.authorName}\`}'));
assert.ok(player.includes('aria-label="Seek voice message"'));
assert.ok(player.includes('title="Playback speed"'));
assert.ok(player.includes("credentials: \"include\""));
assert.ok(player.includes('preload={preview ? "metadata" : "none"}'));
pass("Three-dot menus retain file downloads and authorized moderation; waveform playback remains authenticated and lazy-loaded.");

console.log(count + " Block 2 Chat UX source regression groups passed.");
