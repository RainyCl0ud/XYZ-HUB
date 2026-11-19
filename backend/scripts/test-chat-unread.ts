import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { ChatError, installCreatorChatDefaults, installChatInteractionDefaults, installChatModerationDefaults, installChatQuarantineDefaults,
  provisionCreatorChat, listChatAreas, listChatMessages, listChatUnread, markChatMessagesRead, sendChatMessage, editChatMessage,
  setChatReaction, setChatPin, deleteChatMessage, searchChatMessages, getChatQuarantine, setChatQuarantine } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { loadSession } from "../src/middleware/session-auth.js";
import { createSession } from "../src/services/session.js";
import chatRoutes from "../src/routes/chat.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && (
    (url.port === "55484" && /^\/block2_unread_/.test(url.pathname)) ||
    (url.port === "55494" && url.pathname === "/block2_ux_20261119")
  ), "Use an explicitly named isolated local unread or UX regression database.");
  assert.equal(process.env.NODE_ENV, "test");
  assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID, "Never run in Railway.");
  process.env.BLOCK2_CHAT_ENABLED = "true";
  const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r]));
  await prisma.$transaction(async (tx) => { await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx); await installChatModerationDefaults(tx); await installChatQuarantineDefaults(tx); });
  const prefix = `unread-${Date.now()}-${process.pid}`, users: string[] = [], models: string[] = [];
  let passed = 0;
  const pass = (name: string) => { passed++; console.log(`PASS ${name}`); };
  const denied = (fn: () => Promise<unknown>, status = 404) => assert.rejects(fn, (e: unknown) => e instanceof ChatError && e.status === status);
  const person = async (name: string, role: string) => {
    const u = await prisma.user.create({ data: { name: `${prefix} ${name}`, email: `${prefix}-${name}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(role)!.id } } } }); users.push(u.id); return u;
  };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/chat", chatRoutes);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const owner = await person("owner", "OWNER"), staff = await person("staff", "CHATTER"), otherStaff = await person("other", "CHATTER"), trial = await person("trial", "TRIAL_CHATTER");
    const accountant = await person("accountant", "ACCOUNTANT"), general = await person("general", "GENERAL_STAFF"), dev = await person("dev", "DEV");
    for (const name of ["One", "Two"]) { const m = await prisma.agencyModel.create({ data: { name: `${prefix} ${name}` } }); models.push(m.id); await prisma.$transaction((tx) => provisionCreatorChat(tx, m.id)); }
    const [one, two] = models;
    for (const u of [staff, otherStaff, trial]) await prisma.userModelAssignment.create({ data: { userId: u.id, modelId: one } });
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: two } });
    for (const u of [staff, otherStaff, trial, accountant, general]) await prisma.$transaction((tx) => syncUserStandingChats(tx, u.id));
    const channel = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: one, key: "general" } } })).id;
    const other = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: two, key: "general" } } })).id;
    const hidden = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: one, key: "trial-feedback" } } })).id;
    const ownPrivate = (await prisma.chatStandingConversation.findFirstOrThrow({ where: { kind: "STAFF", subjectUserId: staff.id, modelId: one, archivedAt: null } })).id;
    const otherPrivate = (await prisma.chatStandingConversation.findFirstOrThrow({ where: { kind: "STAFF", subjectUserId: otherStaff.id, archivedAt: null } })).id;
    const send = (id: string, text = "Fictional unread test") => sendChatMessage(owner.id, id, text, randomUUID());
    const count = async (id: string, who = staff.id) => (await listChatUnread(who)).conversations.find((c) => c.channelId === id)?.unreadCount ?? 0;
    const baseline = { incidents: await prisma.incident.count(), strikes: await prisma.strike.count(), assignments: await prisma.userModelAssignment.count() };
    const a = await send(channel), b = await send(channel), c = await send(channel);
    await sendChatMessage(staff.id, channel, "My own message", randomUUID());
    await send(hidden, "Hidden trial feedback"), await send(otherPrivate, "Private to someone else");
    const otherMessage = await send(other);
    assert.equal(await count(channel), 3); assert.equal(await count(other), 1); assert.equal(await count(hidden), 0); assert.equal(await count(otherPrivate), 0);
    const areas = await listChatAreas(staff.id);
    assert.equal(areas.find((a) => a.modelId === one)?.channels.find((c) => c.id === channel)?.unreadCount, 3);
    assert.equal(await count(channel, accountant.id), 0); assert.equal(await count(channel, general.id), 0);
    pass("Badges count received messages only; creator, role and protected-private access gates remain intact");

    await listChatMessages(staff.id, channel); await searchChatMessages(staff.id, "Fictional", channel);
    assert.equal(await count(channel), 3);
    await markChatMessagesRead(staff.id, channel, { messageIds: [b.id] });
    assert.equal(await count(channel), 2); assert.equal(await count(channel, otherStaff.id), 4);
    assert.deepEqual(new Set((await listChatMessages(staff.id, channel)).unreadMessageIds), new Set([a.id, c.id]));
    pass("Transcript/search GETs never clear counts; explicit per-message reads belong to one person");

    await Promise.all([markChatMessagesRead(staff.id, channel, { messageIds: [b.id, c.id] }), markChatMessagesRead(staff.id, channel, { messageIds: [c.id, b.id] })]);
    assert.equal(await count(channel), 1); assert.equal(await prisma.chatMessageRead.count({ where: { userId: staff.id, messageId: c.id } }), 1);
    pass("Concurrent tabs and exact retries are idempotent; an earlier unseen message remains unread");

    const d = await send(channel); await markChatMessagesRead(staff.id, channel, { throughMessageId: c.id });
    assert.equal(await count(channel), 1); assert.equal((await listChatMessages(staff.id, channel)).unreadMessageIds[0], d.id);
    await denied(() => markChatMessagesRead(staff.id, channel, { messageIds: [d.id, otherMessage.id] }));
    assert.equal(await count(channel), 1);
    await denied(() => markChatMessagesRead(staff.id, hidden, { messageIds: [a.id] }));
    await denied(() => markChatMessagesRead(staff.id, channel, { throughMessageId: otherMessage.id }));
    pass("Mark conversation read respects the displayed cutoff; cross-conversation ID batches fail atomically");

    await markChatMessagesRead(staff.id, channel, { messageIds: [d.id] });
    await editChatMessage(owner.id, channel, d.id, "Edited text should not notify again", 1);
    await setChatReaction(staff.id, channel, d.id, "👍", true); await setChatPin(owner.id, channel, d.id, true, 0);
    assert.equal(await count(channel), 0);
    const removed = await send(channel); assert.equal(await count(channel), 1);
    await deleteChatMessage(owner.id, channel, removed.id, 1, "Fictional test deletion");
    assert.equal(await count(channel), 0); assert.equal(await count(channel, owner.id), 1, "Owner has only the staff-authored message, not deleted content");
    pass("Edits, reactions and pin changes add no unread event; deleted text never contributes, including for Owners");

    const beforeRollout = await send(channel);
    const start = (await prisma.chatSetup.findUniqueOrThrow({ where: { id: "chat-unread-v1" } })).createdAt;
    await prisma.chatMessage.update({ where: { id: beforeRollout.id }, data: { createdAt: new Date(start.getTime() - 1000) } });
    assert.equal(await count(channel), 0);
    pass("Rollout cutoff leaves earlier history readable without a backlog or future old-message email triggers");

    const pausedInput = await getChatQuarantine(owner.id, one, staff.id);
    const unreadBeforePause = await send(channel);
    await setChatQuarantine(owner.id, one, staff.id, { active: true, reason: "Fictional unread test", requestId: randomUUID(), version: pausedInput.version, assignmentId: pausedInput.assignmentId });
    assert.equal(await count(channel), 0); assert.equal(await count(other), 1); assert.ok(await count(ownPrivate) > 0);
    await denied(() => markChatMessagesRead(staff.id, channel, { messageIds: [unreadBeforePause.id] }));
    const current = await getChatQuarantine(owner.id, one, staff.id);
    await setChatQuarantine(owner.id, one, staff.id, { active: false, reason: "Fictional restore", requestId: randomUUID(), version: current.version, assignmentId: current.assignmentId });
    assert.equal(await count(channel), 1);
    pass("Quarantine removes affected ordinary counts/acknowledgements; own management and other creators remain available");

    const assignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: staff.id, modelId: two } } });
    await prisma.userModelAssignment.delete({ where: { id: assignment.id } });
    assert.equal(await count(other), 0); await denied(() => markChatMessagesRead(staff.id, other, { messageIds: [otherMessage.id] }));
    await prisma.userModelAssignment.create({ data: { userId: staff.id, modelId: two } });
    await prisma.$transaction((tx) => syncUserStandingChats(tx, staff.id));
    await prisma.chatArea.update({ where: { modelId: two }, data: { archivedAt: new Date() } });
    assert.equal(await count(other), 0); assert.equal(await count(other, dev.id), 0);
    await prisma.chatArea.update({ where: { modelId: two }, data: { archivedAt: null } });
    pass("Assignment loss and archives remove unread data immediately, even with direct IDs or archive oversight");

    let inserted!: () => void, commit!: () => void;
    const ready = new Promise<void>((resolve) => { inserted = resolve; }), release = new Promise<void>((resolve) => { commit = resolve; });
    let lateId = "";
    const late = prisma.$transaction(async (tx) => {
      const m = await tx.chatMessage.create({ data: { channelId: channel, authorUserId: owner.id, authorName: owner.name, clientNonce: randomUUID(), text: "Late commit, earlier timestamp" } });
      lateId = m.id; inserted(); await release;
    }, { timeout: 15000 });
    await ready;
    try { const anchor = await send(channel); await markChatMessagesRead(staff.id, channel, { throughMessageId: anchor.id }); }
    finally { commit(); }
    await late;
    assert.equal(await count(channel), 1); assert.ok((await listChatMessages(staff.id, channel)).unreadMessageIds.includes(lateId));
    pass("A late-committing message stays unread even if its timestamp is earlier than a marked-read message");

    const session = await createSession({ userId: staff.id, expiresAt: new Date(Date.now() + 600000) });
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`;
    const headers = { Cookie: `xyz_session=${session.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${base}/unread`)).status, 401);
    const response = await fetch(`${base}/unread`, { headers }); assert.equal(response.status, 200); assert.equal(response.headers.get("cache-control"), "no-store");
    const summary = await response.json() as { totalUnread: number; conversations: unknown[] }; assert.ok(summary.totalUnread > 0);
    assert.ok(!JSON.stringify(summary).includes("Fictional"));
    assert.equal((await fetch(`${base}/channels/${channel}/read`, { method: "PUT", headers, body: JSON.stringify({ messageIds: [lateId], userId: owner.id }) })).status, 400);
    assert.equal((await fetch(`${base}/channels/${channel}/read`, { method: "PUT", headers, body: JSON.stringify({ messageIds: Array(101).fill(lateId) }) })).status, 400);
    assert.equal((await fetch(`${base}/channels/${channel}/read`, { method: "PUT", headers, body: JSON.stringify({ messageIds: [lateId] }) })).status, 200);
    assert.equal(await count(channel), 0);
    pass("Authenticated no-store HTTP rejects forged recipients and oversized input; unread summary has counts and IDs only");

    await prisma.user.update({ where: { id: staff.id }, data: { status: "DEACTIVATED" } });
    await denied(() => listChatUnread(staff.id), 401); await denied(() => markChatMessagesRead(staff.id, channel, { messageIds: [lateId] }), 401);
    assert.equal((await fetch(`${base}/unread`, { headers })).status, 401);
    await prisma.user.update({ where: { id: staff.id }, data: { status: "ACTIVE" } });
    assert.deepEqual({ incidents: await prisma.incident.count(), strikes: await prisma.strike.count(), assignments: await prisma.userModelAssignment.count() }, baseline);
    pass("Deactivation blocks stale sessions; no incidents, strikes or persistent assignment changes");
    console.log(`\n${passed} Chat unread integration groups passed. No email provider was called.`);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.chatQuarantine.deleteMany({ where: { modelId: { in: models } } });
    // Delete replies first if future fixtures add them; never touch non-fixture rows.
    await prisma.chatMessage.deleteMany({ where: { OR: [{ channel: { modelId: { in: models } } }, { conversation: { subjectUserId: { in: users } } }] } });
    await prisma.chatStandingConversation.deleteMany({ where: { OR: [{ modelId: { in: models } }, { subjectUserId: { in: users } }] } });
    await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.userModelAssignment.deleteMany({ where: { modelId: { in: models } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
