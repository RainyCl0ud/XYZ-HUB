export type ChatMention = { userId: string; start: number; end: number };

/** Keep selected identities only when their entire visible label survives an edit. */
export function rebaseMentions(previous: string, next: string, mentions: readonly ChatMention[]): ChatMention[] {
  if (previous === next) return mentions.map(({ userId, start, end }) => ({ userId, start, end }));
  let prefix = 0;
  while (prefix < previous.length && prefix < next.length && previous[prefix] === next[prefix]) prefix++;
  let suffix = 0;
  while (suffix < previous.length - prefix && suffix < next.length - prefix && previous[previous.length - suffix - 1] === next[next.length - suffix - 1]) suffix++;
  const changedEnd = previous.length - suffix, delta = next.length - previous.length;
  return mentions.flatMap(({ userId, start, end }) => end <= prefix ? (end === prefix && /[\p{L}\p{N}_]/u.test(next.slice(end, end + 1)) ? [] : [{ userId, start, end }])
    : start >= changedEnd ? [{ userId, start: start + delta, end: end + delta }] : []);
}

export function trimmedMentionDraft(text: string, mentions: readonly ChatMention[]) {
  const offset = text.length - text.trimStart().length;
  const value = text.trim();
  return { text: value, mentions: mentions.filter(m => m.start >= offset && m.end <= offset + value.length)
    .map(({ userId, start, end }) => ({ userId, start: start - offset, end: end - offset })) };
}
