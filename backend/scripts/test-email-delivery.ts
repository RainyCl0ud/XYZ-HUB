import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { ChatError, installCreatorChatDefaults, provisionCreatorChat } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { runUnreadReminderSweep } from "../src/services/chat-unread-reminder-worker.js";
import { emailDeliveryOverview, resolveEmailReview } from "../src/services/chat-email-health.js";
import { chatMailerCapacityConfig } from "../src/services/mailer-capacity.js";
import { listNotifications, markAllNotificationsRead, notificationSummary } from "../src/services/hub-notifications.js";
import { presentAuditEvents } from "../src/services/audit-presentation.js";
import { createSession } from "../src/services/session.js";
import { loadSession } from "../src/middleware/session-auth.js";
import chatRoutes from "../src/routes/chat.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55484"); assert.equal(url.pathname, "/block2_email_delivery_20261121");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!Object.keys(process.env).some((key) => key.startsWith("RAILWAY_")), "Local tests must not inherit Railway metadata.");
  Object.assign(process.env, { BLOCK2_CHAT_ENABLED: "true", BLOCK2_UNREAD_EMAIL_ENABLED: "true", CHAT_UNREAD_EMAIL_MODE: "capture",
    BLOCK2_ANNOUNCEMENTS_ENABLED: "true", CHAT_ANNOUNCEMENT_EMAIL_MODE: "capture", FRONTEND_URL: "http://localhost:4134" });
  for (const key of ["CHAT_EMAIL_HOURLY_CAP", "CHAT_EMAIL_DAILY_CAP", "CHAT_EMAIL_AUTH_HOURLY_RESERVE", "CHAT_EMAIL_AUTH_DAILY_RESERVE", "GOOGLE_WORKSPACE_USER"]) delete process.env[key];
  const prefix = `email-health-${Date.now()}-${process.pid}`, users: string[] = [], models: string[] = [];
  let passed = 0; const pass = (s: string) => console.log(`PASS ${++passed}: ${s}`);
  const denied = (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, (e: unknown) => e instanceof ChatError && e.status === status);
  await prisma.$transaction(async (tx) => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); });
  // This isolated database holds only this suite's warning periods.
  await prisma.emailLimitWarning.deleteMany();
  // A fresh database starts unread tracking now; fixtures need older unread messages.
  await prisma.chatSetup.update({ where: { id: "chat-unread-v1" }, data: { createdAt: new Date(Date.now() - 2 * 86_400_000) } });
  const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r.id]));
  const person = async (name: string, role: string) => {
    const u = await prisma.user.create({ data: { name, email: `${prefix}-${users.length}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(role)! } } } });
    users.push(u.id); return u;
  };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/chat", chatRoutes);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const owner = await person("Owner Example", "OWNER"), staff = await person("Sam Example", "CHATTER"), other = await person("Pat Example", "CHATTER");
    const model = await prisma.agencyModel.create({ data: { name: `${prefix} creator` } }); models.push(model.id);
    await prisma.$transaction((tx) => provisionCreatorChat(tx, model.id));
    for (const u of [staff, other]) await prisma.userModelAssignment.create({ data: { userId: u.id, modelId: model.id } });
    for (const id of users) await prisma.$transaction((tx) => syncUserStandingChats(tx, id));
    const general = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: model.id, key: "general" } } })).id;
    const unread = (n: number) => prisma.chatMessage.createMany({ data: Array.from({ length: n }, () => ({ id: randomUUID(), channelId: general, authorUserId: owner.id, authorName: owner.name,
      clientNonce: randomUUID(), text: "SECRET fictional message body", createdAt: new Date(Date.now() - 31 * 60_000) })) });
    const reminders = (id: string) => prisma.chatUnreadReminder.findMany({ where: { userKey: id }, orderBy: { createdAt: "asc" } });
    const audits = (action: string) => prisma.auditEvent.findMany({ where: { action }, orderBy: { occurredAt: "asc" } });
    const allowHourly = (id: string) => prisma.chatUnreadReminderState.updateMany({ where: { userKey: id }, data: { lastAttemptAt: new Date(Date.now() - 2 * 3_600_000), retryAfter: null } });

    // Status and the shared sending budget
    await denied(() => emailDeliveryOverview(staff.id), 403);
    assert.equal((await emailDeliveryOverview(owner.id)).status, "PREVIEW");
    process.env.CHAT_UNREAD_EMAIL_MODE = "off"; process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = "off";
    assert.equal((await emailDeliveryOverview(owner.id)).status, "OFF");
    process.env.CHAT_UNREAD_EMAIL_MODE = "gmail";
    assert.equal((await emailDeliveryOverview(owner.id)).status, "NOT_CONFIGURED");
    Object.assign(process.env, { CHAT_EMAIL_HOURLY_CAP: "50", CHAT_EMAIL_AUTH_HOURLY_RESERVE: "10", CHAT_EMAIL_DAILY_CAP: "100", CHAT_EMAIL_AUTH_DAILY_RESERVE: "20", GOOGLE_WORKSPACE_USER: `${prefix}@example.test` });
    const senderKey = chatMailerCapacityConfig()!.senderKey;
    const reserve = (n: number, ageMinutes: number) => prisma.mailerCapacityReservation.createMany({ data: Array.from({ length: n }, (_, i) => ({ category: "AUTH", senderKey, createdAt: new Date(Date.now() - ageMinutes * 60_000 - i * 1000) })) });
    let overview = await emailDeliveryOverview(owner.id); assert.equal(overview.status, "SENDING"); assert.equal(overview.usage, null);
    assert.ok(!(await listNotifications(owner.id)).items.some((n) => n.kind === "EMAIL_LIMIT"));
    await reserve(40, 5);
    overview = await emailDeliveryOverview(owner.id); assert.equal(overview.status, "PAUSED_HOUR"); assert.equal(overview.usage?.usedHour, 40);
    assert.ok(!(await listNotifications(owner.id)).items.some((n) => n.kind === "EMAIL_LIMIT"), "An hourly pause alone is not a daily warning");
    await prisma.mailerCapacityReservation.updateMany({ where: { senderKey }, data: { createdAt: new Date(Date.now() - 100 * 60_000) } });
    await reserve(32, 120);
    overview = await emailDeliveryOverview(owner.id); assert.equal(overview.status, "NEAR_LIMIT");
    assert.deepEqual([overview.usage?.usedToday, overview.usage?.allowanceToday, overview.usage?.dailyLimit], [72, 80, 100]);
    const warning = (await notificationSummary(owner.id)).latest.find((n) => n.kind === "EMAIL_LIMIT")!;
    assert.ok(warning && warning.title === "Daily email limit nearly reached" && warning.body.startsWith("72 of 80") && warning.target?.type === "email-delivery");
    assert.ok(!(await listNotifications(staff.id)).items.some((n) => n.key.startsWith("email:")), "Only Owners see email problems");
    await reserve(8, 180);
    assert.equal((await emailDeliveryOverview(owner.id)).status, "PAUSED_TODAY");
    const pausedToday = (await listNotifications(owner.id, "unread")).items.filter((n) => n.kind === "EMAIL_LIMIT");
    assert.equal(pausedToday.length, 1, "One notice for the whole warning period");
    assert.equal(pausedToday[0].key, warning.key, "Same notice, same key"); assert.equal(pausedToday[0].occurredAt, warning.occurredAt, "Its date never moves");
    assert.equal(pausedToday[0].title, "Chat emails paused for today");
    assert.equal(await prisma.emailLimitWarning.count({ where: { endedAt: null } }), 1);
    await prisma.mailerCapacityReservation.deleteMany({ where: { senderKey } });
    assert.ok(!(await listNotifications(owner.id, "unread")).items.some((n) => n.kind === "EMAIL_LIMIT"), "Back under the limit: the period closes");
    const closed = (await listNotifications(owner.id)).items.find((n) => n.key === warning.key)!;
    assert.equal(closed.read, true); assert.equal(closed.occurredAt, warning.occurredAt); assert.ok(closed.body.startsWith("Chat email went back under"));
    assert.equal(await prisma.emailLimitWarning.count({ where: { endedAt: null } }), 0);
    process.env.CHAT_UNREAD_EMAIL_MODE = "capture"; process.env.CHAT_ANNOUNCEMENT_EMAIL_MODE = "capture";
    pass("Owner-only status reports off, preview, missing budget, normal sending, hourly pause, near-limit warning and daily pause, with an Owner bell warning");

    // Every reminder email is recorded without content
    await unread(3); await runUnreadReminderSweep();
    const [captured] = await reminders(staff.id); assert.equal(captured.status, "CAPTURED");
    const record = (await audits("chat.unread_reminder.email")).find((e) => e.targetId === captured.id)!;
    assert.deepEqual(record.metadata, { personName: "Sam Example", unreadCount: 3, outcome: "Preview saved" });
    assert.ok(!JSON.stringify(record).includes("SECRET") && !JSON.stringify(record).includes("@example.test"));
    const [presented] = await presentAuditEvents([record]);
    assert.equal(presented.actionLabel, "Unread reminder email");
    assert.ok(presented.changes.some((c) => c.label === "Outcome" && c.after === "Preview saved"));
    pass("Each reminder email is recorded in the Audit Log with recipient, unread count and outcome only");

    // A paused reminder blocks further reminders until an Owner resumes it
    // Mark all as read first: a pause that happens afterwards must still arrive
    // unread, even though the reminder itself was created earlier.
    await markAllNotificationsRead(owner.id); await new Promise((resolve) => setTimeout(resolve, 20));
    const paused = await prisma.chatUnreadReminder.create({ data: { userKey: staff.id, userId: staff.id, status: "REVIEW", unreadCount: 3, lastError: "Delivery outcome could not be confirmed; further reminders are paused for review.", createdAt: new Date(Date.now() - 15 * 60_000), reviewAt: new Date() } });
    await allowHourly(staff.id); await runUnreadReminderSweep();
    assert.equal((await reminders(staff.id)).length, 2, "No new reminder while paused");
    overview = await emailDeliveryOverview(owner.id);
    assert.deepEqual(overview.attention.map((a) => [a.type, a.id, a.personName]), [["reminder", paused.id, "Sam Example"]]);
    const bell = (await listNotifications(owner.id, "unread")).items.find((n) => n.key === `email:reminder-${paused.id}`)!;
    assert.equal(bell.kind, "EMAIL_REVIEW"); assert.equal(bell.title, "Reminder emails paused for Sam Example"); assert.deepEqual(bell.target, { type: "email-delivery" });
    await denied(() => resolveEmailReview(staff.id, "reminder", paused.id), 403);
    const resolvesBefore = (await audits("chat.email.review_resolve")).length;
    const both = await Promise.all([resolveEmailReview(owner.id, "reminder", paused.id), resolveEmailReview(owner.id, "reminder", paused.id)]);
    assert.deepEqual(both, [{ resolved: true }, { resolved: true }]);
    assert.equal((await audits("chat.email.review_resolve")).length, resolvesBefore + 1, "Two clicks together record one resolve");
    assert.equal((await emailDeliveryOverview(owner.id)).attention.length, 0);
    const resolvedNotice = (await listNotifications(owner.id)).items.find((n) => n.key === `email:reminder-${paused.id}`)!;
    assert.equal(resolvedNotice.read, true); assert.equal(resolvedNotice.body, "Resumed by Owner Example");
    const resolution = (await audits("chat.email.review_resolve")).at(-1)!;
    assert.equal(resolution.actorUserId, owner.id); assert.deepEqual(resolution.metadata, { kind: "Unread reminder", personName: "Sam Example" });
    await allowHourly(staff.id); await runUnreadReminderSweep();
    assert.equal((await reminders(staff.id)).length, 3, "Reminders flow again after resuming");
    await denied(() => resolveEmailReview(owner.id, "reminder", captured.id), 404);
    pass("A paused reminder blocks that person's reminders; only an Owner can resume them, once, with an audit record and no resend");

    // Announcement emails Gmail did not confirm
    const announcement = await prisma.chatAnnouncement.create({ data: { requestId: randomUUID(), inputHash: "fixture", authorUserId: owner.id, authorName: owner.name, title: "Holiday schedule", text: "Fictional body" } });
    const delivery = await prisma.chatAnnouncementDelivery.create({ data: { announcementId: announcement.id, userId: other.id, userKey: other.id, personName: other.name,
      destinations: [], status: "REVIEW", attemptedAt: new Date(Date.now() - 5 * 60_000), reviewAt: new Date(), lastError: "Email delivery could not be confirmed. Automatic resend is paused to prevent duplicates." } });
    overview = await emailDeliveryOverview(owner.id);
    assert.deepEqual(overview.attention.map((a) => [a.type, a.personName, a.title]), [["announcement", "Pat Example", "Holiday schedule"]]);
    assert.ok((await listNotifications(owner.id, "unread")).items.some((n) => n.key === `email:announcement-${delivery.id}` && n.title === "Announcement email unconfirmed for Pat Example"));
    await resolveEmailReview(owner.id, "announcement", delivery.id);
    assert.equal((await prisma.chatAnnouncementDelivery.findUniqueOrThrow({ where: { id: delivery.id } })).status, "REVIEW", "Handled, never re-sent");
    assert.equal((await emailDeliveryOverview(owner.id)).attention.length, 0);
    pass("Unconfirmed announcement emails are listed for Owners and can be marked handled without resending");

    // An abandoned send becomes a pause and is recorded
    const stuck = await prisma.chatUnreadReminder.create({ data: { userKey: other.id, userId: other.id, status: "SENDING", unreadCount: 2, createdAt: new Date(Date.now() - 11 * 60_000) } });
    await runUnreadReminderSweep();
    const flipped = await prisma.chatUnreadReminder.findUniqueOrThrow({ where: { id: stuck.id } });
    assert.equal(flipped.status, "REVIEW"); assert.ok(flipped.reviewAt && flipped.reviewAt.getTime() > stuck.createdAt.getTime() + 10 * 60_000, "Dated when it was paused");
    assert.ok((await listNotifications(owner.id, "unread")).items.some((n) => n.key === `email:reminder-${stuck.id}`), "A pause found by the sweep reaches the bell unread");
    assert.equal((await audits("chat.unread_reminder.email")).find((e) => e.targetId === stuck.id)?.success, true, "Uncertain, not failed");
    assert.deepEqual((await audits("chat.unread_reminder.email")).find((e) => e.targetId === stuck.id)?.metadata, { personName: "Pat Example", unreadCount: 2, outcome: "Needs review" });
    assert.ok((await emailDeliveryOverview(owner.id)).attention.some((a) => a.id === stuck.id));
    pass("A send abandoned mid-flight becomes a paused delivery, is recorded as needing review, and appears for Owners");

    // HTTP
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
    const cookie = async (id: string) => ({ Cookie: `xyz_session=${(await createSession({ userId: id, expiresAt: new Date(Date.now() + 600000) })).token}`, "Content-Type": "application/json" });
    const ownerHeaders = await cookie(owner.id), staffHeaders = await cookie(staff.id);
    assert.equal((await fetch(base + "/email-delivery")).status, 401);
    assert.equal((await fetch(base + "/email-delivery", { headers: staffHeaders })).status, 403);
    const http = await fetch(base + "/email-delivery", { headers: ownerHeaders }); assert.equal(http.status, 200); assert.equal(http.headers.get("cache-control"), "no-store");
    assert.equal(((await http.json()) as { status: string }).status, "PREVIEW");
    assert.equal((await fetch(base + "/email-delivery/resolve", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ type: "reminder" }) })).status, 400);
    assert.equal((await fetch(base + "/email-delivery/resolve", { method: "POST", headers: staffHeaders, body: JSON.stringify({ type: "reminder", id: stuck.id }) })).status, 403);
    assert.equal((await fetch(base + "/email-delivery/resolve", { method: "POST", headers: ownerHeaders, body: JSON.stringify({ type: "reminder", id: stuck.id }) })).status, 200);
    assert.equal((await fetch(base + "/unread-reminders/log", { headers: ownerHeaders })).status, 404, "The Chat-menu log is gone");
    const areas = (await (await fetch(base + "/areas", { headers: ownerHeaders })).json()) as { unreadReminders: Record<string, unknown> };
    assert.deepEqual(Object.keys(areas.unreadReminders), ["enabled"]);
    pass("Authenticated strict HTTP: Owner-only status and resolve, validated input, and the old Chat-menu log removed");

    console.log(`${passed} email delivery integration groups passed. No real email sent.`);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.emailLimitWarning.deleteMany(); await prisma.mailerCapacityReservation.deleteMany({ where: { createdAt: { gte: new Date(Date.now() - 2 * 86_400_000) }, category: "AUTH", senderKey: { not: "" } } });
    await prisma.chatAnnouncement.deleteMany({ where: { authorUserId: { in: users } } });
    await prisma.chatUnreadReminder.deleteMany({ where: { userKey: { in: users } } }); await prisma.chatUnreadReminderState.deleteMany({ where: { userKey: { in: users } } });
    await prisma.chatMessage.deleteMany({ where: { OR: [{ channel: { modelId: { in: models } } }, { conversation: { subjectUserId: { in: users } } }] } });
    await prisma.chatStandingConversation.deleteMany({ where: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } });
    await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.userModelAssignment.deleteMany({ where: { modelId: { in: models } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
