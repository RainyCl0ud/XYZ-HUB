import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { installChatInteractionDefaults, installCreatorChatDefaults, listChatUnread, markChatMessagesRead, provisionCreatorChat, sendChatMessage, deleteChatMessage, type ChatMentionInput } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { installClockDefaults } from "../src/services/clock.js";
import { installClockAlertDefaults } from "../src/services/clock-alerts.js";
import { installClockCorrectionDefaults } from "../src/services/clock-corrections.js";
import { centralDayKey, centralWeekKey } from "../src/services/clock-time.js";
import { NotificationError, listNotifications, markAllNotificationsRead, markNotificationRead, notificationSummary, type HubNotification } from "../src/services/hub-notifications.js";
import { createSession } from "../src/services/session.js";
import { loadSession } from "../src/middleware/session-auth.js";
import notificationRoutes from "../src/routes/notifications.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55484"); assert.equal(url.pathname, "/block2_hub_notifications_20261121");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!Object.keys(process.env).some((key) => key.startsWith("RAILWAY_")), "Local tests must not inherit Railway metadata.");
  process.env.BLOCK2_CHAT_ENABLED = "true"; process.env.BLOCK2_CLOCK_ENABLED = "true";
  const prefix = `hub-notice-${Date.now()}-${process.pid}`, users: string[] = [], models: string[] = [];
  let passed = 0; const pass = (s: string) => console.log(`PASS ${++passed}: ${s}`);
  const gone = (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, (e: unknown) => e instanceof NotificationError && e.status === status);
  await prisma.$transaction(async (tx) => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx); });
  await prisma.$transaction((tx) => installClockDefaults(tx)); await prisma.$transaction((tx) => installClockAlertDefaults(tx)); await prisma.$transaction((tx) => installClockCorrectionDefaults(tx));
  const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r.id]));
  const person = async (name: string, role: string) => {
    const u = await prisma.user.create({ data: { name, email: `${prefix}-${users.length}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(role)! } } } });
    users.push(u.id); return u;
  };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/notifications", notificationRoutes);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const owner = await person("Owner Example", "OWNER"), ops = await person("Ops Example", "OPS_MANAGER");
    const manager = await person("Manager Example", "MANAGER"), staff = await person("Sam Example", "CHATTER");
    const peer = await person("Pat Example", "CHATTER"), outsider = await person("Outside Example", "CHATTER");
    for (const name of ["One", "Two"]) { const model = await prisma.agencyModel.create({ data: { name: `${prefix} ${name}` } }); models.push(model.id); await prisma.$transaction((tx) => provisionCreatorChat(tx, model.id)); }
    for (const u of [manager, staff, peer]) await prisma.userModelAssignment.create({ data: { userId: u.id, modelId: models[0] } });
    await prisma.userModelAssignment.create({ data: { userId: outsider.id, modelId: models[1] } });
    for (const id of users) await prisma.$transaction((tx) => syncUserStandingChats(tx, id));
    const general = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: models[0], key: "general" } } })).id;
    const updates = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: models[0], key: "updates" } } })).id;
    const label = "@" + staff.name;
    const mention: ChatMentionInput[] = [{ userId: staff.id, start: 0, end: label.length }];
    const mentionStaff = (text = " please check the list", author = owner.id) => sendChatMessage(author, general, label + text, randomUUID(), undefined, mention);
    const items = async (id: string, filter: "all" | "unread" = "all") => (await listNotifications(id, filter)).items;
    const find = async (id: string, key: string) => (await items(id)).find((n) => n.key === key);

    // Mentions
    const first = await mentionStaff();
    let summary = await notificationSummary(staff.id);
    assert.equal(summary.available, true); assert.equal(summary.unreadCount, 1);
    const notice = summary.latest[0];
    assert.equal(notice.kind, "MENTION"); assert.equal(notice.key, `mention:${first.id}`); assert.equal(notice.read, false);
    assert.equal(notice.title, "Owner Example mentioned you"); assert.ok(notice.context.endsWith("· #General"), notice.context);
    assert.deepEqual(notice.target, { type: "chat-message", conversationId: general, messageId: first.id });
    assert.equal((await notificationSummary(peer.id)).unreadCount, 0); assert.equal((await notificationSummary(outsider.id)).unreadCount, 0);
    await sendChatMessage(staff.id, general, label + " self", randomUUID(), undefined, mention);
    assert.equal((await notificationSummary(staff.id)).unreadCount, 1);
    pass("A mention notifies only the person mentioned, links to the exact message, and self-mentions never notify");

    await markChatMessagesRead(staff.id, general, { messageIds: [first.id] });
    assert.equal((await notificationSummary(staff.id)).unreadCount, 0); assert.equal((await find(staff.id, `mention:${first.id}`))?.read, true);
    const second = await mentionStaff(" second");
    const before = (await listChatUnread(staff.id)).totalUnreadMentions;
    const read = await markNotificationRead(staff.id, `mention:${second.id}`);
    assert.equal(read.unreadCount, 0); assert.equal((await find(staff.id, `mention:${second.id}`))?.read, true);
    assert.equal((await listChatUnread(staff.id)).totalUnreadMentions, before, "Reading a notice never marks the Chat message itself read");
    await markNotificationRead(staff.id, `mention:${second.id}`);
    pass("Reading the message in Chat clears its notice; marking a notice read is idempotent and leaves Chat read state alone");

    const removed = await mentionStaff(" removed");
    await deleteChatMessage(owner.id, general, removed.id, removed.version, "Fictional notification deletion test");
    assert.equal(await find(staff.id, `mention:${removed.id}`), undefined);
    const hidden = await mentionStaff(" hidden");
    await prisma.userModelAssignment.deleteMany({ where: { userId: staff.id, modelId: models[0] } });
    assert.equal(await find(staff.id, `mention:${hidden.id}`), undefined); assert.equal(await find(staff.id, `mention:${first.id}`), undefined);
    await gone(() => markNotificationRead(staff.id, `mention:${hidden.id}`), 404);
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: models[0] } });
    const quarantine = await prisma.chatQuarantine.create({ data: { modelId: models[0], userId: staff.id, personName: staff.name, active: true, reason: "Fictional notice boundary check", changedById: owner.id, changedByName: owner.name, lastRequestId: randomUUID(), lastRequestHash: "notice-example" } });
    assert.equal(await find(staff.id, `mention:${hidden.id}`), undefined);
    await prisma.chatQuarantine.delete({ where: { id: quarantine.id } });
    await prisma.chatChannel.update({ where: { id: general }, data: { archivedAt: new Date() } });
    assert.equal(await find(staff.id, `mention:${hidden.id}`), undefined);
    await prisma.chatChannel.update({ where: { id: general }, data: { archivedAt: null } });
    assert.equal((await find(staff.id, `mention:${hidden.id}`))?.read, false);
    await markNotificationRead(staff.id, `mention:${hidden.id}`);
    pass("Deleted messages, lost assignments, quarantine and archived channels remove mention notices entirely; access returns them");

    // Announcements (fixture rows match what publishing creates)
    const announcement = await prisma.chatAnnouncement.create({ data: { requestId: randomUUID(), inputHash: "fixture", authorUserId: ops.id, authorName: ops.name, title: "Holiday schedule", text: "Fictional announcement body." } });
    const postId = randomUUID();
    await prisma.chatMessage.create({ data: { id: postId, channelId: updates, authorUserId: ops.id, authorName: ops.name, clientNonce: announcement.id, announcementKey: `announcement:${announcement.id}:${updates}`, text: "Holiday schedule\n\nFictional announcement body." } });
    await prisma.chatAnnouncementPost.create({ data: { announcementId: announcement.id, targetId: updates, isPrivate: false, messageId: postId } });
    for (const u of [staff, ops]) await prisma.chatAnnouncementDelivery.create({ data: { announcementId: announcement.id, userId: u.id, userKey: u.id, personName: u.name, destinations: [{ id: updates, isPrivate: false }], status: "CAPTURED" } });
    const key = `announcement:${announcement.id}`;
    const posted = await find(staff.id, key) as HubNotification;
    assert.equal(posted.kind, "ANNOUNCEMENT"); assert.equal(posted.body, "Holiday schedule"); assert.equal(posted.context, "From Ops Example"); assert.equal(posted.read, false);
    assert.deepEqual(posted.target, { type: "chat-message", conversationId: updates, messageId: postId });
    assert.equal(await find(ops.id, key), undefined, "The author is not notified of their own announcement");
    assert.equal(await find(peer.id, key), undefined); assert.equal(await find(outsider.id, key), undefined);
    await prisma.chatMessageRead.create({ data: { messageId: postId, userId: staff.id } });
    assert.equal((await find(staff.id, key))?.read, true);
    pass("Announcements reach only their delivery recipients, open the post, and clear once the post is read in Chat");

    // Attendance alerts reuse the Clock alert audience
    const now = new Date(Math.floor(Date.now() / 1000) * 1000), started = new Date(now.getTime() - 2 * 3600_000);
    const shift = await prisma.clockShift.create({ data: { userId: staff.id, personName: staff.name, startedAt: started, startDay: centralDayKey(started), startWeek: centralWeekKey(started), startRequestId: randomUUID() } });
    const shortBreak = await prisma.clockBreak.create({ data: { shiftId: shift.id, kind: "SHORT_ONE", startedAt: new Date(now.getTime() - 20 * 60_000), startRequestId: randomUUID() } });
    const meal = await prisma.clockBreak.create({ data: { shiftId: shift.id, kind: "MEAL", startedAt: new Date(now.getTime() - 90 * 60_000), endedAt: new Date(now.getTime() - 30 * 60_000), endReason: "LIMIT", startRequestId: randomUUID() } });
    const reminder = await prisma.clockAlert.create({ data: { eventKey: `${shortBreak.id}:BREAK_REMINDER`, shiftId: shift.id, breakId: shortBreak.id, breakKind: "SHORT_ONE", kind: "BREAK_REMINDER", occurredAt: now, recordedAt: now } });
    const flag = await prisma.clockAlert.create({ data: { eventKey: `${meal.id}:BREAK_LIMIT`, shiftId: shift.id, breakId: meal.id, breakKind: "MEAL", kind: "BREAK_LIMIT", occurredAt: now, recordedAt: now } });
    const own = await items(staff.id);
    assert.ok(own.some((n) => n.key === `alert:${reminder.id}` && n.kind === "BREAK_REMINDER" && n.target?.type === "clock" && !n.read));
    assert.ok(own.some((n) => n.key === `alert:${flag.id}`));
    for (const viewer of [manager, ops]) {
      const list = await items(viewer.id);
      assert.ok(list.some((n) => n.key === `alert:${flag.id}` && n.title.startsWith("Sam Example: ")), "Management sees the flag");
      assert.ok(!list.some((n) => n.key === `alert:${reminder.id}`), "A personal break reminder stays personal");
    }
    for (const viewer of [peer, outsider]) assert.ok(!(await items(viewer.id)).some((n) => n.key.startsWith("alert:")));
    await markNotificationRead(manager.id, `alert:${flag.id}`);
    assert.ok(await prisma.clockAlertRead.findUnique({ where: { alertId_userId: { alertId: flag.id, userId: manager.id } } }));
    assert.equal((await find(staff.id, `alert:${flag.id}`))?.read, false, "Read state is per person");
    await gone(() => markNotificationRead(peer.id, `alert:${flag.id}`), 404);
    pass("Attendance alerts follow the existing Clock audience: own reminders stay personal, flags reach current management only");

    // Corrections
    const correction = await prisma.clockCorrection.create({ data: { requestId: randomUUID(), userId: staff.id, personName: staff.name, kind: "MISSING_SHIFT", reason: "Fictional missing shift", proposedSnapshot: { startedAt: started.toISOString(), endedAt: now.toISOString(), breaks: [] }, submittedAt: now } });
    const review = await find(manager.id, `correction-review:${correction.id}`) as HubNotification;
    assert.equal(review.read, false); assert.deepEqual(review.target, { type: "clock-request", requestId: correction.id });
    assert.equal(await find(staff.id, `correction-review:${correction.id}`), undefined, "Nobody reviews their own request");
    assert.equal(await find(peer.id, `correction-review:${correction.id}`), undefined);
    await prisma.clockCorrection.update({ where: { id: correction.id }, data: { status: "APPROVED", reviewerId: manager.id, reviewerName: manager.name, reviewNote: "Fictional approval", reviewedAt: new Date() } });
    assert.equal((await find(manager.id, `correction-review:${correction.id}`))?.read, true, "A decided request no longer waits");
    const decided = await find(staff.id, `correction-decided:${correction.id}`) as HubNotification;
    assert.equal(decided.title, "Your clock correction was approved"); assert.equal(decided.body, "Reviewed by Manager Example"); assert.equal(decided.read, false);
    pass("Corrections notify their reviewers while pending and the requester once decided, linking to the request");

    // Pagination across sources, including equal timestamps
    const tie = new Date(Math.floor(Date.now() / 1000) * 1000 - 60_000);
    const many = [];
    for (let i = 0; i < 24; i++) many.push(await mentionStaff(` page ${i}`));
    await prisma.chatMessage.updateMany({ where: { id: { in: many.slice(0, 6).map((m) => m.id) } }, data: { createdAt: tie } });
    await prisma.clockAlert.updateMany({ where: { id: { in: [reminder.id, flag.id] } }, data: { occurredAt: tie, recordedAt: tie } });
    const all: HubNotification[] = []; let cursor: string | undefined; let pages = 0;
    do {
      const page = await listNotifications(staff.id, "all", cursor);
      assert.ok(page.items.length <= 20); all.push(...page.items); cursor = page.nextBefore ?? undefined; pages++;
    } while (cursor && pages < 10);
    const keys = all.map((n) => n.key);
    assert.equal(new Set(keys).size, keys.length, "No notice repeats across pages");
    for (const m of many) assert.ok(keys.includes(`mention:${m.id}`));
    assert.ok(keys.includes(`alert:${reminder.id}`) && keys.includes(`announcement:${announcement.id}`) && keys.includes(`correction-decided:${correction.id}`));
    for (let i = 1; i < all.length; i++) assert.ok(all[i - 1].occurredAt >= all[i].occurredAt, "Newest first");
    await gone(() => listNotifications(staff.id, "all", "not-a-cursor"), 400);
    pass("History pages merge every source newest first with no gaps or repeats, even when timestamps are equal");

    // Mark all as read
    const unreadBefore = (await notificationSummary(staff.id)).unreadCount; assert.ok(unreadBefore > 20);
    assert.equal((await markAllNotificationsRead(staff.id)).unreadCount, 0);
    assert.equal((await listNotifications(staff.id, "unread")).items.length, 0);
    assert.equal(await prisma.hubNotificationRead.count({ where: { userId: staff.id } }), 0);
    await new Promise((resolve) => setTimeout(resolve, 20));
    const later = await mentionStaff(" after mark all");
    assert.deepEqual((await notificationSummary(staff.id)).latest.map((n) => n.key), [`mention:${later.id}`]);
    const lateAlert = await prisma.clockAlert.create({ data: { eventKey: `${shift.id}:late-${prefix}`, shiftId: shift.id, kind: "OPEN_SHIFT", occurredAt: started, recordedAt: new Date(Date.now() + 2000) } });
    assert.equal((await items(staff.id, "unread")).find((n) => n.key === `alert:${lateAlert.id}`)?.read, false, "An alert recorded after Mark all arrives unread even if it is dated earlier");
    assert.ok((await notificationSummary(manager.id)).unreadCount > 0, "Mark all is per person");
    pass("Mark all as read clears everything at once for that person only; later notices still arrive unread");

    // HTTP
    const session = await createSession({ userId: staff.id, expiresAt: new Date(Date.now() + 600000) });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/notifications`;
    const headers = { Cookie: `xyz_session=${session.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(base + "/summary")).status, 401);
    const http = await fetch(base + "/summary", { headers }); assert.equal(http.status, 200); assert.equal(http.headers.get("cache-control"), "no-store");
    assert.equal(((await http.json()) as { unreadCount: number }).unreadCount, 2);
    assert.equal((await fetch(base + "?filter=unread", { headers })).status, 200);
    assert.equal((await fetch(base + "?userId=" + manager.id, { headers })).status, 400);
    assert.equal((await fetch(base + "/read", { method: "POST", headers, body: JSON.stringify({ key: "mention:../x" }) })).status, 400);
    assert.equal((await fetch(base + "/read", { method: "POST", headers, body: JSON.stringify({ key: `correction-review:${correction.id}` }) })).status, 404);
    assert.equal((await fetch(base + "/read", { method: "POST", headers, body: JSON.stringify({ key: `mention:${later.id}` }) })).status, 200);
    assert.equal((await fetch(base + "/read-all", { method: "POST", headers, body: JSON.stringify({ extra: true }) })).status, 400);
    assert.equal((await fetch(base + "/read-all", { method: "POST", headers, body: "{}" })).status, 200);
    process.env.BLOCK2_CHAT_ENABLED = "false"; process.env.BLOCK2_CLOCK_ENABLED = "false";
    assert.equal((await fetch(base + "/summary", { headers })).status, 404);
    process.env.BLOCK2_CHAT_ENABLED = "true"; process.env.BLOCK2_CLOCK_ENABLED = "true";
    await prisma.user.update({ where: { id: peer.id }, data: { status: "DEACTIVATED" } });
    await gone(() => notificationSummary(peer.id), 401);
    pass("Authenticated strict HTTP: no-store, no foreign identities or keys, per-person reads, and the feature switches off cleanly");

    console.log(`${passed} header bell notification integration groups passed.`);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.clockCorrection.deleteMany({ where: { userId: { in: users } } });
    await prisma.clockAlert.deleteMany({ where: { shift: { userId: { in: users } } } });
    await prisma.clockBreak.deleteMany({ where: { shift: { userId: { in: users } } } });
    await prisma.clockShift.deleteMany({ where: { userId: { in: users } } });
    await prisma.chatAnnouncement.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.chatMessage.deleteMany({ where: { OR: [{ channel: { modelId: { in: models } } }, { conversation: { subjectUserId: { in: users } } }] } });
    await prisma.chatStandingConversation.deleteMany({ where: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } });
    await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.userModelAssignment.deleteMany({ where: { modelId: { in: models } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
