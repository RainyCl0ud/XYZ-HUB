import { CHAT_EMOJI_LIBRARY } from "./chat-emoji-library";
/** User-specific, browser-local reaction history. No global emoji frequency or
 * cross-account storage; the current authenticated ID is part of every key.
 * On devices where storage is disabled, reactions still work with defaults. */
const DEFAULT_OPTIONS = [
  ["👍", "Thumbs up"], ["❤️", "Heart"], ["😂", "Laugh"], ["🎉", "Celebrate"],
  ["👀", "Eyes"], ["✅", "Check"], ["😊", "Smile"], ["😍", "Love"],
  ["😮", "Surprised"], ["😢", "Sad"], ["😎", "Cool"], ["🤔", "Thinking"],
  ["👏", "Clap"], ["🙌", "Hooray"], ["🔥", "Fire"], ["💯", "Hundred"],
  ["🙏", "Thanks"], ["🚀", "Rocket"], ["🤝", "Handshake"], ["😭", "Crying"],
  ["💀", "Skull"], ["⭐", "Star"], ["✨", "Sparkles"], ["👎", "Thumbs down"],
] as const;

export const CHAT_EMOJI_OPTIONS = CHAT_EMOJI_LIBRARY;
export const CHAT_EMOJI_CATEGORIES = [...new Set(CHAT_EMOJI_LIBRARY.map(([, , category]) => category))];
export const CHAT_RECENT_EMOJI_LIMIT = 6;
const DEFAULT_RECENTS: string[] = DEFAULT_OPTIONS.slice(0, CHAT_RECENT_EMOJI_LIMIT).map(([emoji]) => emoji);
const supported = new Set<string>(CHAT_EMOJI_OPTIONS.map(([emoji]) => emoji));
const labels = new Map<string, string>(CHAT_EMOJI_OPTIONS.map(([emoji, label]) => [emoji, label]));
for (const [emoji, label] of DEFAULT_OPTIONS) labels.set(emoji, label);
export const emojiLabel = (emoji: string) => labels.get(emoji) ?? "Reaction";

export function normalizeRecentEmojis(value: unknown): string[] {
  const list = Array.isArray(value) ? value : [];
  const unique = Array.from(new Set(list.filter((emoji): emoji is string =>
    typeof emoji === "string" && supported.has(emoji))));
  for (const fallback of DEFAULT_RECENTS) {
    if (unique.length >= CHAT_RECENT_EMOJI_LIMIT) break;
    if (!unique.includes(fallback)) unique.push(fallback);
  }
  return unique.slice(0, CHAT_RECENT_EMOJI_LIMIT);
}
export function rememberRecentEmoji(previous: readonly string[], emoji: string): string[] {
  if (!supported.has(emoji)) return normalizeRecentEmojis(previous);
  return normalizeRecentEmojis([emoji, ...previous.filter((value) => value !== emoji)]);
}
export const recentEmojiStorageKey = (userId: string) => `xyz_chat_recent_emojis_v1:${userId}`;

export function loadRecentEmojis(userId: string): string[] {
  if (!userId || typeof window === "undefined") return [...DEFAULT_RECENTS];
  try {
    return normalizeRecentEmojis(JSON.parse(window.localStorage.getItem(recentEmojiStorageKey(userId)) ?? "null"));
  } catch { return [...DEFAULT_RECENTS]; }
}
export function saveRecentEmojiSelection(userId: string, emoji: string): string[] {
  if (!userId) return [...DEFAULT_RECENTS];
  const next = rememberRecentEmoji(loadRecentEmojis(userId), emoji);
  try {
    if (typeof window !== "undefined") window.localStorage.setItem(recentEmojiStorageKey(userId), JSON.stringify(next));
  } catch { /* Not having local storage never blocks posting a reaction. */ }
  return next;
}
