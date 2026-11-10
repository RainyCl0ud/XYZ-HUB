import { createECDH } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { sendNotification, WebPushError } from "web-push";
import { prisma } from "../lib/prisma.js";
import { browserNotificationsEnabled } from "./chat-browser-notifications.js";
import { ChatError } from "./creator-chat.js";
import { notificationUnreadScope } from "./chat-notification-scope.js";
import { clockAllowed, clockViewerInclude } from "./clock-policy.js";

const checkInterval = 15_000;
const maxAlertAge = 5 * 60_000;
const messageBatchSize = 5;

function browserPushEndpoint(value: string) {
  try {
    const url = new URL(value);
    const allowed = ["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].includes(url.hostname)
      || url.hostname.endsWith(".notify.windows.com") || url.hostname.endsWith(".push.apple.com");
    return url.protocol === "https:" && allowed && !url.username && !url.password && !url.port && !url.hash && url.pathname !== "/";
  } catch {
    return false;
  }
}

export const pushSubscriptionSchema = z.object({
  userId: z.string().min(1).max(100),
  endpoint: z.string().max(1600).refine(browserPushEndpoint),
  keys: z.object({
    p256dh: z.string().regex(/^B[A-Za-z0-9_-]{86}$/),
    auth: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
  }).strict(),
}).strict();

function pushConfig() {
  if (process.env.BLOCK2_BACKGROUND_PUSH_ENABLED !== "true" || !browserNotificationsEnabled()) return null;
  const { HUB_PUSH_PUBLIC_KEY: publicKey, HUB_PUSH_PRIVATE_KEY: privateKey, HUB_PUSH_CONTACT: subject } = process.env;
  if (!publicKey || !privateKey || !subject || !/^mailto:[^@\s]+@[^@\s]+\.[^@\s]+$/.test(subject) ||
      !/^B[A-Za-z0-9_-]{86}$/.test(publicKey) || !/^[A-Za-z0-9_-]{43}$/.test(privateKey)) return null;
  try {
    const pair = createECDH("prime256v1");
    pair.setPrivateKey(Buffer.from(privateKey, "base64url"));
    if (pair.getPublicKey().toString("base64url") !== publicKey) return null;
  } catch {
    return null;
  }
  return { publicKey, privateKey, subject };
}

export async function backgroundPushSettings(sessionId: string, deviceId?: string) {
  const config = pushConfig();
  const device = config && deviceId ? await prisma.hubPushSubscription.findFirst({
    where: { id: deviceId, sessionId }, select: { id: true },
  }) : null;
  return { publicKey: config?.publicKey ?? null, active: !!device };
}

export async function subscribeBackgroundPush(sessionId: string, input: z.infer<typeof pushSubscriptionSchema>) {
  if (!pushConfig()) throw new ChatError(404, "Background notifications are unavailable.");
  return prisma.$transaction(async tx => {
    const now = new Date();
    const session = await tx.session.findFirst({
      where: { id: sessionId, revokedAt: null, expiresAt: { gt: now }, user: { status: "ACTIVE" } },
      select: { userId: true },
    });
    if (!session) throw new ChatError(401, "Please sign in again.");
    if (session.userId !== input.userId) throw new ChatError(409, "Your Hub account changed. Open notification settings again.");
    await notificationUnreadScope(tx, session.userId);
    const data = { sessionId, ...input.keys, cursorAt: now, cursorMessageId: null, clockCursorAt: now, nextCheckAt: now };
    return tx.hubPushSubscription.upsert({
      where: { endpoint: input.endpoint },
      create: { endpoint: input.endpoint, ...data },
      update: data,
      select: { id: true },
    });
  });
}

export async function unsubscribeBackgroundPush(sessionId: string, deviceId: string) {
  await prisma.hubPushSubscription.deleteMany({ where: { id: deviceId, sessionId } });
}

async function nextChatAlerts(tx: Prisma.TransactionClient, userId: string, cursor: { cursorAt: Date; cursorMessageId: string | null }, since: Date, through: Date) {
  const { where, areas } = await notificationUnreadScope(tx, userId);
  const messages = await tx.chatMessage.findMany({
    where: { AND: [where, { createdAt: { lte: through } }, { OR: [
      { createdAt: { gt: since } },
      ...(cursor.cursorMessageId && +cursor.cursorAt === +since ? [{ createdAt: since, id: { gt: cursor.cursorMessageId } }] : []),
    ] }] },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: messageBatchSize,
    select: { id: true, createdAt: true, channelId: true, conversationId: true },
  });
  if (!messages.length) return { messages, alerts: [] };

  const channelIds = messages.flatMap(message => message.channelId ? [message.channelId] : []);
  const privateIds = messages.flatMap(message => message.conversationId ? [message.conversationId] : []);
  const counts = await tx.chatMessage.groupBy({
    by: ["channelId", "conversationId"],
    where: { AND: [where, { OR: [{ channelId: { in: channelIds } }, { conversationId: { in: privateIds } }] }] },
    _count: { _all: true },
  });
  const conversations = new Map(areas.flatMap(area => area.channels.map(channel => [channel.id, { area, channel }] as const)));
  const unread = new Map(counts.map(count => [count.channelId ?? count.conversationId, count._count._all]));
  const alerts = messages.flatMap(message => {
    const conversationId = message.channelId ?? message.conversationId;
    const context = conversationId && conversations.get(conversationId);
    const count = unread.get(conversationId);
    if (!context || !conversationId || !count) return [];
    const { area, channel } = context;
    return [{ id: message.id, conversationId, area: area.name.slice(0, 64), channel: channel.isPrivate ? "Private chat" : channel.name.slice(0, 64), count }];
  });
  return { messages, alerts };
}

async function nextPush(id: string) {
  return prisma.$transaction(async tx => {
    const locked = await tx.$queryRaw<{ id: string }[]>`
      SELECT "id" FROM "HubPushSubscription"
      WHERE "id" = ${id} AND "nextCheckAt" <= CURRENT_TIMESTAMP AT TIME ZONE 'UTC'
      FOR UPDATE SKIP LOCKED`;
    if (!locked.length) return null;
    const device = await tx.hubPushSubscription.findUniqueOrThrow({
      where: { id }, include: { session: { select: { userId: true, revokedAt: true, expiresAt: true } } },
    });
    const now = new Date();
    const { session } = device;
    const userId = session.userId;
    const user = await tx.user.findUnique({ where: { id: userId }, include: clockViewerInclude });
    if (session.revokedAt || session.expiresAt <= now || user?.status !== "ACTIVE" || !browserPushEndpoint(device.endpoint)) {
      await tx.hubPushSubscription.delete({ where: { id } });
      return null;
    }
    // Leave a short buffer for timestamps written by transactions still committing.
    const through = new Date(now.getTime() - 2_000);
    const cutoff = now.getTime() - maxAlertAge;
    const since = new Date(Math.max(device.cursorAt.getTime(), cutoff));
    let chat: Awaited<ReturnType<typeof nextChatAlerts>> | undefined;
    try {
      if (since <= through) chat = await nextChatAlerts(tx, userId, device, since, through);
    } catch (error) {
      if (!(error instanceof ChatError) || ![401, 403].includes(error.status)) throw error;
    }
    let clock = false;
    if (process.env.BLOCK2_CLOCK_ENABLED === "true" && clockAllowed(user, "clock.self.view")) {
      const reminders = await tx.clockAlert.findMany({
        where: { kind: "BREAK_REMINDER", recordedAt: { gt: new Date(Math.max(device.clockCursorAt.getTime(), cutoff)), lte: through },
          shift: { userId, endedAt: null }, reads: { none: { userId } } },
        select: { breakId: true },
      });
      clock = !!await tx.clockBreak.findFirst({
        where: { id: { in: reminders.flatMap(reminder => reminder.breakId ? [reminder.breakId] : []) }, endedAt: null }, select: { id: true },
      });
    }
    const last = chat?.messages.length === messageBatchSize ? chat.messages.at(-1) : undefined;
    const nextCheckAt = new Date(now.getTime() + checkInterval);
    await tx.hubPushSubscription.update({
      where: { id },
      data: {
        cursorAt: last?.createdAt ?? new Date(Math.max(through.getTime(), device.cursorAt.getTime())),
        cursorMessageId: last?.id ?? null,
        clockCursorAt: new Date(Math.max(through.getTime(), device.clockCursorAt.getTime())),
        nextCheckAt,
      },
    });
    return chat?.alerts.length || clock ? { device, nextCheckAt, userId, messages: chat?.alerts ?? [], clock } : null;
  });
}

async function deliverPush(id: string, config: NonNullable<ReturnType<typeof pushConfig>>) {
  const alert = await nextPush(id);
  if (!alert) return;
  const { device, userId, messages, clock, nextCheckAt } = alert;
  const current = await prisma.hubPushSubscription.findFirst({
    where: { id, sessionId: device.sessionId, nextCheckAt, session: { revokedAt: null, expiresAt: { gt: new Date() }, user: { status: "ACTIVE" } } },
    select: { id: true },
  });
  if (!current || !pushConfig()) return;
  // A batch is claimed before sending so a retry after an uncertain response
  // cannot deliver a duplicate. The recipient always opens an authenticated page.
  try {
    await sendNotification({ endpoint: device.endpoint, keys: { p256dh: device.p256dh, auth: device.auth } },
      JSON.stringify({ userId, messages, clock }), { vapidDetails: config, TTL: 60, timeout: 5000 });
  } catch (error) {
    if (error instanceof WebPushError && [404, 410].includes(error.statusCode)) {
      await prisma.hubPushSubscription.deleteMany({ where: { id, sessionId: device.sessionId, nextCheckAt } });
    } else {
      console.warn("Hub push provider did not confirm delivery.");
    }
  }
}

export function startBackgroundPushWorker() {
  const config = pushConfig();
  if (!config) return;
  let running = false;
  const interval = setInterval(async () => {
    if (running || !pushConfig()) return;
    running = true;
    try {
      const devices = await prisma.hubPushSubscription.findMany({
        where: { nextCheckAt: { lte: new Date() } }, orderBy: [{ nextCheckAt: "asc" }, { id: "asc" }],
        select: { id: true }, take: 50,
      });
      for (let i = 0; i < devices.length; i += 5) {
        const group = await Promise.allSettled(devices.slice(i, i + 5).map(device => deliverPush(device.id, config)));
        if (group.some(result => result.status === "rejected")) console.warn("Hub push processing will retry.");
      }
    } catch {
      console.warn("Hub push worker is unavailable and will retry.");
    } finally {
      running = false;
    }
  }, checkInterval);
  interval.unref();
}
