import { Prisma } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { accessibleChatAreas, isCreatorChatEnabled, makeViewer, viewerInclude } from "./creator-chat.js";
import { alertInclude, clockAlertAudience, describeClockAlert } from "./clock-alerts.js";
import { correctionCapabilities, correctionReviewWhere } from "./clock-corrections.js";
import { clockAllowed, clockViewerInclude, type ClockViewer } from "./clock-policy.js";
import { isClockEnabled } from "./clock.js";

/*
 * Header bell inbox. Every notice is derived live from its source record and
 * that feature's own access rule, so losing access removes the notice at once
 * and nothing about a conversation outlives the person's membership. Only
 * read state is stored (HubNotificationRead and HubNotificationState).
 * Chat unread counts stay on channel badges and are not part of this inbox.
 */

export class NotificationError extends Error {
  constructor(readonly status: number, message: string) { super(message); this.name = "NotificationError"; }
}

export type NotificationKind = "MENTION" | "ANNOUNCEMENT" | "BREAK_REMINDER" | "BREAK_LIMIT" | "OPEN_SHIFT" | "CORRECTION_REVIEW" | "CORRECTION_DECIDED";
export type NotificationTarget =
  | { type: "chat-message"; conversationId: string; messageId: string }
  | { type: "clock" }
  | { type: "clock-request"; requestId: string };
export type HubNotification = {
  key: string; kind: NotificationKind; occurredAt: string; read: boolean;
  title: string; body: string; context: string; target: NotificationTarget | null;
};

const PAGE = 20;
const SUMMARY_SIZE = 5;
const EXCERPT = 140;
export const NOTIFICATION_KEY = /^(alert|announcement|correction-decided|correction-review|mention):([A-Za-z0-9_-]{1,100})$/;

type Tx = Prisma.TransactionClient;
type Conversation = { name: string; area: string; isPrivate: boolean };
type Context = {
  tx: Tx; userId: string; watermark: Date | null; explicit: Set<string>;
  chat: { conversations: Map<string, Conversation>; unreadStart: Date } | null;
  clock: { viewer: ClockViewer; alerts: boolean; ownCorrections: boolean; review: boolean } | null;
};
type Query = { unread: boolean; time?: Prisma.DateTimeFilter; id?: string; take?: number };
type Entry = { key: string; at: Date; notice: HubNotification };
type Source = { prefix: string; available: (ctx: Context) => boolean; fetch: (ctx: Context, query: Query) => Promise<Entry[]>; unreadCount: (ctx: Context) => Promise<number> };

const excerpt = (text: string) => {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > EXCERPT ? flat.slice(0, EXCERPT - 1).trimEnd() + "…" : flat;
};
const explicitIds = (ctx: Context, prefix: string) => [...ctx.explicit].filter((key) => key.startsWith(prefix + ":")).map((key) => key.slice(prefix.length + 1));
const readByWatermark = (ctx: Context, at: Date) => !!ctx.watermark && at.getTime() <= ctx.watermark.getTime();
const after = (ctx: Context) => (ctx.watermark ? { gt: ctx.watermark } : {});
const notice = (key: string, kind: NotificationKind, at: Date, read: boolean, title: string, body: string, context: string, target: NotificationTarget | null): Entry =>
  ({ key, at, notice: { key, kind, occurredAt: at.toISOString(), read, title, body, context, target } });

const mentionSource: Source = {
  prefix: "mention",
  available: (ctx) => !!ctx.chat,
  async fetch(ctx, query) {
    const where = mentionWhere(ctx, query);
    const rows = await ctx.tx.chatMessage.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.take,
      select: { id: true, createdAt: true, text: true, authorName: true, channelId: true, conversationId: true, reads: { where: { userId: ctx.userId }, select: { userId: true }, take: 1 } } });
    return rows.flatMap((m) => {
      const conversationId = m.channelId ?? m.conversationId;
      const conversation = conversationId ? ctx.chat!.conversations.get(conversationId) : undefined;
      if (!conversationId || !conversation) return [];
      const key = `mention:${m.id}`;
      const read = m.createdAt < ctx.chat!.unreadStart || m.reads.length > 0 || ctx.explicit.has(key) || readByWatermark(ctx, m.createdAt);
      const where = conversation.isPrivate ? conversation.name : `${conversation.area} · #${conversation.name}`;
      return [notice(key, "MENTION", m.createdAt, read, `${m.authorName} mentioned you`, excerpt(m.text), where,
        { type: "chat-message", conversationId, messageId: m.id })];
    });
  },
  unreadCount: (ctx) => ctx.tx.chatMessage.count({ where: mentionWhere(ctx, { unread: true }) }),
};
function mentionWhere(ctx: Context, query: Query): Prisma.ChatMessageWhereInput {
  const conversations = [...ctx.chat!.conversations];
  return { AND: [
    { deletedAt: null, announcementKey: null, mentions: { some: { userId: ctx.userId } } },
    { OR: [{ authorUserId: null }, { authorUserId: { not: ctx.userId } }] },
    { OR: [
      { channelId: { in: conversations.filter(([, c]) => !c.isPrivate).map(([id]) => id) } },
      { conversationId: { in: conversations.filter(([, c]) => c.isPrivate).map(([id]) => id) } },
    ] },
    ...(query.unread ? [{ createdAt: { gte: ctx.chat!.unreadStart, ...after(ctx) }, reads: { none: { userId: ctx.userId } }, id: { notIn: explicitIds(ctx, "mention") } }] : []),
    ...(query.time ? [{ createdAt: query.time }] : []),
    ...(query.id ? [{ id: query.id }] : []),
  ] };
}

const announcementSource: Source = {
  prefix: "announcement",
  available: (ctx) => !!ctx.chat,
  async fetch(ctx, query) {
    const reachable = [...ctx.chat!.conversations.keys()];
    const rows = await ctx.tx.chatAnnouncement.findMany({ where: announcementWhere(ctx, query), orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: query.take,
      select: { id: true, title: true, authorName: true, createdAt: true,
        posts: { where: { targetId: { in: reachable } }, orderBy: [{ isPrivate: "asc" }, { targetId: "asc" }], take: 1, select: { targetId: true, messageId: true } },
        _count: { select: { posts: { where: { targetId: { in: reachable }, message: { reads: { some: { userId: ctx.userId } } } } } } } } });
    return rows.map((a) => {
      const key = `announcement:${a.id}`;
      const read = a._count.posts > 0 || ctx.explicit.has(key) || readByWatermark(ctx, a.createdAt);
      const post = a.posts[0];
      return notice(key, "ANNOUNCEMENT", a.createdAt, read, "Staff announcement", a.title, `From ${a.authorName}`,
        post ? { type: "chat-message", conversationId: post.targetId, messageId: post.messageId } : null);
    });
  },
  unreadCount: (ctx) => ctx.tx.chatAnnouncement.count({ where: announcementWhere(ctx, { unread: true }) }),
};
function announcementWhere(ctx: Context, query: Query): Prisma.ChatAnnouncementWhereInput {
  const reachable = [...ctx.chat!.conversations.keys()];
  return { AND: [
    { deliveries: { some: { userId: ctx.userId } } },
    { OR: [{ authorUserId: null }, { authorUserId: { not: ctx.userId } }] },
    ...(query.unread ? [{ createdAt: after(ctx), id: { notIn: explicitIds(ctx, "announcement") },
      posts: { none: { targetId: { in: reachable }, message: { reads: { some: { userId: ctx.userId } } } } } }] : []),
    ...(query.time ? [{ createdAt: query.time }] : []),
    ...(query.id ? [{ id: query.id }] : []),
  ] };
}

const alertSource: Source = {
  prefix: "alert",
  available: (ctx) => !!ctx.clock?.alerts,
  async fetch(ctx, query) {
    const rows = await ctx.tx.clockAlert.findMany({ where: alertWhere(ctx, query), orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: query.take,
      include: { ...alertInclude, reads: { where: { userId: ctx.userId }, select: { readAt: true } } } });
    return rows.map((a) => {
      const d = describeClockAlert(a, ctx.userId);
      const read = a.reads.length > 0 || readByWatermark(ctx, a.recordedAt);
      return notice(`alert:${a.id}`, a.kind, a.occurredAt, read, d.own ? d.title : `${d.personName}: ${d.title}`, d.message, `Attendance · ${d.status}`, { type: "clock" });
    });
  },
  unreadCount: (ctx) => ctx.tx.clockAlert.count({ where: alertWhere(ctx, { unread: true }) }),
};
function alertWhere(ctx: Context, query: Query): Prisma.ClockAlertWhereInput {
  // The watermark compares the time the alert was recorded, so an alert the
  // worker records just after "Mark all as read" still arrives unread.
  return { AND: [
    clockAlertAudience(ctx.clock!.viewer),
    ...(query.unread ? [{ reads: { none: { userId: ctx.userId } }, recordedAt: after(ctx) }] : []),
    ...(query.time ? [{ occurredAt: query.time }] : []),
    ...(query.id ? [{ id: query.id }] : []),
  ] };
}

const correctionStatus: Record<string, string> = { PENDING: "Waiting for review", APPROVED: "Approved", REJECTED: "Rejected", CANCELLED: "Cancelled" };
const reviewSource: Source = {
  prefix: "correction-review",
  available: (ctx) => !!ctx.clock?.review,
  async fetch(ctx, query) {
    const rows = await ctx.tx.clockCorrection.findMany({ where: reviewWhere(ctx, query), orderBy: [{ submittedAt: "desc" }, { id: "desc" }], take: query.take,
      select: { id: true, personName: true, kind: true, status: true, submittedAt: true } });
    return rows.map((c) => {
      const key = `correction-review:${c.id}`;
      const read = c.status !== "PENDING" || ctx.explicit.has(key) || readByWatermark(ctx, c.submittedAt);
      return notice(key, "CORRECTION_REVIEW", c.submittedAt, read, "Clock correction to review",
        `${c.personName} · ${c.kind === "MISSING_SHIFT" ? "missing shift" : "shift times"}`, `Attendance · ${correctionStatus[c.status] ?? c.status}`,
        { type: "clock-request", requestId: c.id });
    });
  },
  unreadCount: (ctx) => ctx.tx.clockCorrection.count({ where: reviewWhere(ctx, { unread: true }) }),
};
function reviewWhere(ctx: Context, query: Query): Prisma.ClockCorrectionWhereInput {
  return { AND: [
    correctionReviewWhere(ctx.clock!.viewer),
    ...(query.unread ? [{ status: "PENDING" as const, submittedAt: after(ctx), id: { notIn: explicitIds(ctx, "correction-review") } }] : []),
    ...(query.time ? [{ submittedAt: query.time }] : []),
    ...(query.id ? [{ id: query.id }] : []),
  ] };
}

const decidedSource: Source = {
  prefix: "correction-decided",
  available: (ctx) => !!ctx.clock?.ownCorrections,
  async fetch(ctx, query) {
    const rows = await ctx.tx.clockCorrection.findMany({ where: decidedWhere(ctx, query), orderBy: [{ reviewedAt: "desc" }, { id: "desc" }], take: query.take,
      select: { id: true, status: true, kind: true, reviewerName: true, reviewedAt: true } });
    return rows.flatMap((c) => {
      if (!c.reviewedAt) return [];
      const key = `correction-decided:${c.id}`;
      const read = ctx.explicit.has(key) || readByWatermark(ctx, c.reviewedAt);
      return [notice(key, "CORRECTION_DECIDED", c.reviewedAt, read, c.status === "APPROVED" ? "Your clock correction was approved" : "Your clock correction was rejected",
        `Reviewed by ${c.reviewerName ?? "a reviewer"}`, `Attendance · ${c.kind === "MISSING_SHIFT" ? "Missing shift" : "Shift times"}`,
        { type: "clock-request", requestId: c.id })];
    });
  },
  unreadCount: (ctx) => ctx.tx.clockCorrection.count({ where: decidedWhere(ctx, { unread: true }) }),
};
function decidedWhere(ctx: Context, query: Query): Prisma.ClockCorrectionWhereInput {
  return { AND: [
    { userId: ctx.userId, status: { in: ["APPROVED", "REJECTED"] }, reviewedAt: { not: null } },
    ...(query.unread ? [{ reviewedAt: after(ctx), id: { notIn: explicitIds(ctx, "correction-decided") } }] : []),
    ...(query.time ? [{ reviewedAt: query.time }] : []),
    ...(query.id ? [{ id: query.id }] : []),
  ] };
}

const SOURCES: Source[] = [mentionSource, announcementSource, alertSource, reviewSource, decidedSource];

async function databaseNow(tx: Tx) {
  const [{ now }] = await tx.$queryRaw<{ now: Date }[]>`SELECT clock_timestamp() AS "now"`;
  return now;
}

async function loadContext(tx: Tx, userId: string): Promise<Context> {
  // Same shared per-person lock as Chat reads, taken first, so a quarantine or
  // removal that commits before this request is always reflected here.
  if (isCreatorChatEnabled()) await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${"chat-access:" + userId}, 0))`;
  const person = await tx.user.findUnique({ where: { id: userId }, select: { status: true } });
  if (!person || person.status !== "ACTIVE") throw new NotificationError(401, "Please sign in again.");
  const state = await tx.hubNotificationState.findUnique({ where: { userId } });
  const explicit = new Set((await tx.hubNotificationRead.findMany({ where: { userId }, select: { key: true } })).map((r) => r.key));
  let chat: Context["chat"] = null;
  if (isCreatorChatEnabled()) {
    const chatUser = await tx.user.findUnique({ where: { id: userId }, include: viewerInclude });
    const viewer = chatUser ? makeViewer(chatUser) : null;
    if (viewer?.permissions.has("chat.access")) {
      const areas = await accessibleChatAreas(tx, viewer);
      const conversations = new Map<string, Conversation>();
      for (const area of areas) for (const c of area.channels) if (!c.archived) conversations.set(c.id, { name: c.name, area: area.name, isPrivate: c.isPrivate });
      const setup = await tx.chatSetup.findUnique({ where: { id: "chat-unread-v1" } });
      chat = { conversations, unreadStart: setup?.createdAt ?? new Date(0) };
    }
  }
  let clock: Context["clock"] = null;
  if (isClockEnabled()) {
    const viewer = await tx.user.findUnique({ where: { id: userId }, include: clockViewerInclude });
    if (viewer) {
      const alerts = clockAllowed(viewer, "clock.access") && ["clock.self.view", "clock.alerts.team", "clock.alerts.all"].some((p) => clockAllowed(viewer, p));
      const ownCorrections = clockAllowed(viewer, "clock.self.view");
      const review = ownCorrections && correctionCapabilities(viewer).canReviewCorrections;
      if (alerts || ownCorrections) clock = { viewer, alerts, ownCorrections, review };
    }
  }
  return { tx, userId, watermark: state?.readAllBefore ?? null, explicit, chat, clock };
}

function withContext<T>(userId: string, fn: (ctx: Context) => Promise<T>) {
  return prisma.$transaction(async (tx) => fn(await loadContext(tx, userId)), { timeout: 15_000 });
}

type Cursor = { at: Date; key: string };
const precedes = (at: Date, key: string, cursor: Cursor) => at.getTime() < cursor.at.getTime() || (at.getTime() === cursor.at.getTime() && key < cursor.key);
const newestFirst = (a: Entry, b: Entry) => b.at.getTime() - a.at.getTime() || (a.key < b.key ? 1 : a.key > b.key ? -1 : 0);
export function parseNotificationCursor(value: string): Cursor {
  const split = value.indexOf("|");
  const at = new Date(value.slice(0, split));
  const key = value.slice(split + 1);
  if (split < 1 || !Number.isFinite(at.getTime()) || !NOTIFICATION_KEY.test(key)) throw new NotificationError(400, "The notification history cursor is invalid.");
  return { at, key };
}
const cursorFor = (entry: Entry) => `${entry.at.toISOString()}|${entry.key}`;

/* One window per source. Ties are ordered by key in JavaScript, never by the
 * database collation, so each window also fetches every row sharing its
 * boundary timestamp. Merging windows then yields a gap-free global order. */
async function sourceWindow(ctx: Context, source: Source, unread: boolean, cursor: Cursor | null, size: number) {
  const top = await source.fetch(ctx, { unread, take: size + 1, ...(cursor ? { time: { lt: cursor.at } } : {}) });
  const extra: Entry[] = [];
  if (cursor) extra.push(...await source.fetch(ctx, { unread, time: { equals: cursor.at } }));
  if (top.length > size) extra.push(...await source.fetch(ctx, { unread, time: { equals: top[top.length - 1].at } }));
  const seen = new Set<string>();
  return [...top, ...extra].filter((entry) => {
    if (seen.has(entry.key)) return false;
    seen.add(entry.key);
    return !cursor || precedes(entry.at, entry.key, cursor);
  });
}

async function page(ctx: Context, unread: boolean, cursor: Cursor | null, size: number) {
  const sources = SOURCES.filter((s) => s.available(ctx));
  const merged: Entry[] = [];
  for (const source of sources) merged.push(...await sourceWindow(ctx, source, unread, cursor, size));
  merged.sort(newestFirst);
  const items = merged.slice(0, size);
  return { items, hasMore: merged.length > size, nextBefore: merged.length > size ? cursorFor(items[items.length - 1]) : null };
}

async function unreadTotal(ctx: Context) {
  let total = 0;
  for (const source of SOURCES) if (source.available(ctx)) total += await source.unreadCount(ctx);
  return total;
}

export async function listNotifications(userId: string, filter: "all" | "unread" = "all", before?: string) {
  const cursor = before ? parseNotificationCursor(before) : null;
  return withContext(userId, async (ctx) => {
    const result = await page(ctx, filter === "unread", cursor, PAGE);
    return { unreadCount: await unreadTotal(ctx), items: result.items.map((e) => e.notice), nextBefore: result.nextBefore };
  });
}

export function notificationSummary(userId: string) {
  return withContext(userId, async (ctx) => {
    const available = SOURCES.some((s) => s.available(ctx));
    if (!available) return { available, unreadCount: 0, latest: [] as HubNotification[] };
    const latest = await page(ctx, true, null, SUMMARY_SIZE);
    return { available, unreadCount: await unreadTotal(ctx), latest: latest.items.map((e) => e.notice) };
  });
}

export async function markNotificationRead(userId: string, key: string) {
  const match = NOTIFICATION_KEY.exec(key);
  if (!match) throw new NotificationError(400, "Choose a notification from your list.");
  const [, prefix, id] = match;
  return withContext(userId, async (ctx) => {
    const source = SOURCES.find((s) => s.prefix === prefix && s.available(ctx));
    // Only a notice the person can currently see can be acknowledged.
    const [entry] = source ? await source.fetch(ctx, { unread: false, id, take: 1 }) : [];
    if (!entry) throw new NotificationError(404, "This notification is no longer available.");
    const now = await databaseNow(ctx.tx);
    // INSERT ... ON CONFLICT DO NOTHING keeps the first read time when two
    // tabs acknowledge the same notice together.
    if (prefix === "alert") await ctx.tx.clockAlertRead.createMany({ data: { alertId: id, userId, readAt: now }, skipDuplicates: true });
    else await ctx.tx.hubNotificationRead.createMany({ data: { userId, key, occurredAt: entry.at, readAt: now }, skipDuplicates: true });
    return { read: true, unreadCount: await unreadTotal({ ...ctx, explicit: new Set([...ctx.explicit, key]) }) };
  });
}

export function markAllNotificationsRead(userId: string) {
  return withContext(userId, async (ctx) => {
    const now = await databaseNow(ctx.tx);
    await ctx.tx.hubNotificationState.upsert({ where: { userId }, create: { userId, readAllBefore: now }, update: { readAllBefore: now } });
    // The watermark now covers every earlier acknowledgement.
    await ctx.tx.hubNotificationRead.deleteMany({ where: { userId } });
    return { read: true, unreadCount: await unreadTotal({ ...ctx, watermark: now, explicit: new Set() }) };
  });
}
