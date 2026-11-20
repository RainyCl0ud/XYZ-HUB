import { CENTRAL_TIME_ZONE } from "./central-time";

type GroupableMessage = {
  authorUserId?: string | null; authorName: string; createdAt: string;
  deleted?: unknown; systemNotice?: boolean; announcement?: boolean;
  replyTo?: unknown; replyUnavailable?: boolean;
};
const day = new Intl.DateTimeFormat("en-US", { timeZone: CENTRAL_TIME_ZONE, year: "numeric", month: "numeric", day: "numeric" });
const separate = (message: GroupableMessage) => !!(message.deleted || message.systemNotice || message.announcement || message.replyTo || message.replyUnavailable);

export function isMessageContinuation(previous: GroupableMessage | undefined, current: GroupableMessage): boolean {
  if (!previous || !current.authorUserId || previous.authorUserId !== current.authorUserId || previous.authorName !== current.authorName) return false;
  if (separate(previous) || separate(current)) return false;
  const before = new Date(previous.createdAt), now = new Date(current.createdAt);
  const gap = now.getTime() - before.getTime();
  return Number.isFinite(gap) && gap >= 0 && gap < 5 * 60 * 1000 && day.format(before) === day.format(now);
}
