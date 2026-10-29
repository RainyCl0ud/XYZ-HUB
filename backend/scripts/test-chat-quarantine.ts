import "dotenv/config";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { ChatError, installCreatorChatDefaults, installChatInteractionDefaults, installChatModerationDefaults, installChatQuarantineDefaults, provisionCreatorChat,
  getChatQuarantine, setChatQuarantine, listChatAreas, listChatMessages, listChatMembers, getChatMessage, refreshChatMessages, searchChatMessages,
  listChatPins, sendChatMessage, editChatMessage, setChatReaction, setChatPin, deleteChatMessage } from "../src/services/creator-chat.js";
import { installStandingChatDefaults, syncUserStandingChats } from "../src/services/standing-chat.js";
import { installClockDefaults, getOwnClock, clockIn, clockOut, startBreak, endBreak } from "../src/services/clock.js";
import { loadSession } from "../src/middleware/session-auth.js";
import { createSession } from "../src/services/session.js";
import chatRoutes from "../src/routes/chat.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) && /^\/block2_/.test(url.pathname), "Use an isolated named local database.");
  assert.ok(!process.env.RAILWAY_PROJECT_ID && !process.env.RAILWAY_ENVIRONMENT_ID, "Never run these tests in Railway.");
  process.env.BLOCK2_CHAT_ENABLED = "true"; process.env.BLOCK2_CLOCK_ENABLED = "true";
  await prisma.$transaction(async (tx) => {
    await installCreatorChatDefaults(tx); await installStandingChatDefaults(tx); await installChatInteractionDefaults(tx);
    await installChatModerationDefaults(tx); await installChatQuarantineDefaults(tx); await installClockDefaults(tx);
  });
  const prefix = `pause-${Date.now()}-${process.pid}`;
  const users: string[] = [], models: string[] = [];
  const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r]));
  let passed = 0, triggerInstalled = false;
  const triggerName = `quarantine_audit_test_${process.pid}`;
  const check = (name: string) => { passed++; console.log(`PASS ${name}`); };
  const denied = (fn: () => Promise<unknown>, status = 404) => assert.rejects(fn, (e: unknown) => e instanceof ChatError && e.status === status);
  const person = async (name: string, key: string) => {
    const user = await prisma.user.create({ data: { name: `${prefix} ${name}`, email: `${prefix}-${name}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(key)!.id } } } });
    users.push(user.id); return user;
  };
  const currentInput = async (actor: string, modelId: string, subject: string, active: boolean, reason = "Fictional staging test") => {
    const state = await getChatQuarantine(actor, modelId, subject);
    return { active, version: state.version, assignmentId: state.assignmentId, reason, requestId: randomUUID() };
  };
  const change = async (actor: string, modelId: string, subject: string, active: boolean) => setChatQuarantine(actor, modelId, subject, await currentInput(actor, modelId, subject, active));
  const baseline = { incidents: await prisma.incident.count(), strikes: await prisma.strike.count() };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/chat", chatRoutes);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  try {
    const owner = await person("owner", "OWNER"), ops = await person("ops", "OPS_MANAGER"), manager = await person("manager", "MANAGER");
    const outsider = await person("other-manager", "MANAGER"), qc = await person("qc", "QC"), staff = await person("staff", "CHATTER"), trial = await person("trial", "TRIAL_CHATTER");
    const dev = await person("developer", "DEV"), creator = await person("creator", "MODEL"), accountant = await person("accountant", "ACCOUNTANT");
    for (const name of ["One", "Two"]) { const m = await prisma.agencyModel.create({ data: { name: `${prefix} ${name}` } }); models.push(m.id); await prisma.$transaction((tx) => provisionCreatorChat(tx, m.id)); }
    const [one, two] = models;
    for (const user of [manager, qc, staff, trial, dev, creator, accountant]) await prisma.userModelAssignment.create({ data: { userId: user.id, modelId: one } });
    for (const user of [outsider, staff, trial]) await prisma.userModelAssignment.create({ data: { userId: user.id, modelId: two } });
    await prisma.$transaction(async (tx) => { await syncUserStandingChats(tx, staff.id); await syncUserStandingChats(tx, trial.id); });
    const channel = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: one, key: "general" } } })).id;
    const other = (await prisma.chatChannel.findUniqueOrThrow({ where: { modelId_key: { modelId: two, key: "general" } } })).id;
    const ownPrivate = (await getChatQuarantine(manager.id, one, staff.id)).privateChatId!;
    const trialPrivate = (await getChatQuarantine(qc.id, one, trial.id)).privateChatId!;
    assert.ok((await getChatQuarantine(qc.id, one, trial.id)).canPause);
    for (const actor of [owner, ops, manager]) assert.ok((await getChatQuarantine(actor.id, one, staff.id)).canPause);
    for (const [actor, subject] of [[qc, staff], [manager, manager], [outsider, staff], [staff, trial], [dev, trial], [manager, qc], [owner, creator], [owner, accountant], [owner, owner]])
      await denied(() => getChatQuarantine(actor.id, one, subject.id));
    check("Current creator authority, QC Trial-only targets, no self-action and protected-role boundaries");

    await prisma.userRole.create({ data: { userId: trial.id, roleId: roles.get("CHATTER")!.id } });
    await denied(() => getChatQuarantine(qc.id, one, trial.id));
    await prisma.userRole.deleteMany({ where: { userId: trial.id, roleId: roles.get("CHATTER")!.id } });
    await prisma.userRole.create({ data: { userId: staff.id, roleId: roles.get("QC")!.id } });
    await denied(() => getChatQuarantine(manager.id, one, staff.id));
    await prisma.userRole.deleteMany({ where: { userId: staff.id, roleId: roles.get("QC")!.id } });
    check("Mixed Chatter/Trial cannot use Trial-only routing; higher supplementary roles protect the target");

    const message = await sendChatMessage(staff.id, channel, `Protected search ${prefix}`, randomUUID());
    await setChatPin(owner.id, channel, message.id, true, 0);
    const pauseInput = await currentInput(manager.id, one, staff.id, true);
    const paused = await setChatQuarantine(manager.id, one, staff.id, pauseInput);
    assert.equal(paused.active, true); assert.equal(paused.version, 1); assert.ok(paused.canLift);
    const areas = await listChatAreas(staff.id), affected = areas.find((a) => a.modelId === one)!;
    assert.equal(affected.pausedForYou, true); assert.deepEqual(affected.channels.map((c) => c.id), [ownPrivate]);
    assert.ok(areas.find((a) => a.modelId === two)?.channels.some((c) => c.id === other));
    await listChatMessages(staff.id, other); await sendChatMessage(staff.id, ownPrivate, "Can contact management", randomUUID());
    check("Pause affects one creator only and preserves the current staff-management private chat");

    for (const fn of [() => listChatMessages(staff.id, channel), () => getChatMessage(staff.id, channel, message.id),
      () => refreshChatMessages(staff.id, channel, [message.id]), () => listChatPins(staff.id, channel), () => listChatMembers(staff.id, channel),
      () => sendChatMessage(staff.id, channel, "Blocked", randomUUID()), () => editChatMessage(staff.id, channel, message.id, "Blocked", 1),
      () => setChatReaction(staff.id, channel, message.id, "👍", true), () => setChatPin(staff.id, channel, message.id, true, 1),
      () => deleteChatMessage(staff.id, channel, message.id, 1, "Blocked"), () => searchChatMessages(staff.id, prefix, channel)]) await denied(fn);
    assert.ok(!(await searchChatMessages(staff.id, prefix)).results.some((r) => r.message.id === message.id));
    check("Transcript, refresh, search, direct links, replies, edits, reactions, pins and deletion share the pause gate");

    const management = await listChatMembers(manager.id, channel);
    assert.ok(management.some((m) => m.id === staff.id && m.quarantine?.active));
    assert.ok(!(await listChatMembers(trial.id, channel)).some((m) => m.id === staff.id));
    assert.equal((await listChatMessages(manager.id, ownPrivate)).quarantine?.active, true);
    assert.equal((await listChatMessages(staff.id, ownPrivate)).quarantine, null);
    check("Only authorized reviewers see pause controls/status; the team receives no pause announcement");

    const count = await prisma.chatMessage.count({ where: { systemEventKey: `quarantine-${pauseInput.requestId}` } });
    assert.equal(count, 1);
    await setChatQuarantine(manager.id, one, staff.id, pauseInput);
    assert.equal(await prisma.chatMessage.count({ where: { systemEventKey: `quarantine-${pauseInput.requestId}` } }), 1);
    await denied(() => setChatQuarantine(manager.id, one, staff.id, { ...pauseInput, reason: "Changed payload" }), 409);
    await denied(() => setChatQuarantine(manager.id, one, staff.id, { ...pauseInput, requestId: randomUUID() }), 409);
    const notice = (await listChatMessages(staff.id, ownPrivate)).messages.find((m) => m.systemNotice)!;
    assert.ok(notice.text.includes("other creators are unaffected")); assert.ok(!notice.canReply && !notice.canEdit && !notice.canModerate && !notice.canPin);
    await denied(() => setChatReaction(staff.id, ownPrivate, notice.id, "👍", true));
    await denied(() => setChatPin(owner.id, ownPrivate, notice.id, true, 0), 403);
    await denied(() => deleteChatMessage(manager.id, ownPrivate, notice.id, 1, "Remove notice"), 403);
    await denied(() => sendChatMessage(staff.id, ownPrivate, "Forged notice reply", randomUUID(), notice.id));
    await assert.rejects(() => prisma.chatMessage.update({ where: { id: notice.id }, data: { text: "Altered notice" } }));
    check("Exact retries create one notice/audit transition; stale or altered requests fail and system notices are read-only");

    const signedIn = await createSession({ userId: staff.id, expiresAt: new Date(Date.now() + 600000) });
    assert.ok(signedIn.token);
    const shift = (await clockIn(staff.id, { requestId: randomUUID() })).currentShift!;
    const started = await startBreak(staff.id, shift.id, { kind: "SHORT_ONE", requestId: randomUUID() });
    await endBreak(staff.id, shift.id, started.currentShift!.breaks[0].id);
    await clockOut(staff.id, shift.id);
    assert.ok((await getOwnClock(staff.id)).history.some((s) => s.id === shift.id));
    assert.equal((await prisma.user.findUniqueOrThrow({ where: { id: staff.id } })).status, "ACTIVE");
    check("Session creation, clock in/out, paid break and history continue during quarantine without account deactivation");

    const trialPause = await currentInput(qc.id, one, trial.id, true);
    await setChatQuarantine(qc.id, one, trial.id, trialPause);
    const oldAssignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: trial.id, modelId: one } } });
    await prisma.userModelAssignment.delete({ where: { id: oldAssignment.id } });
    assert.ok((await listChatMessages(owner.id, trialPrivate)).quarantine?.canLift, "Owner recovery is reachable in the archived private header");
    const lifted = await change(owner.id, one, trial.id, false); assert.equal(lifted.active, false);
    assert.equal(await prisma.userModelAssignment.count({ where: { userId: trial.id, modelId: one } }), 0);
    await prisma.userModelAssignment.create({ data: { userId: trial.id, modelId: one } });
    await prisma.$transaction((tx) => syncUserStandingChats(tx, trial.id));
    const newPrivate = (await getChatQuarantine(qc.id, one, trial.id)).privateChatId!; assert.notEqual(newPrivate, trialPrivate);
    await denied(() => listChatMessages(trial.id, trialPrivate));
    check("Owner recovery after unassignment never restores old assignments or standing-chat episodes");

    const view = await prisma.permission.findUniqueOrThrow({ where: { key: "chat.channels.all" } });
    const chatterRole = roles.get("CHATTER")!;
    const grant = await prisma.chatPersonGrant.findMany({ where: { channelId: channel } });
    assert.equal(grant.length, 0);
    await prisma.chatRoleGrant.update({ where: { channelId_roleId: { channelId: channel, roleId: chatterRole.id } }, data: { canView: false, canPost: false } });
    await change(manager.id, one, staff.id, false);
    await denied(() => listChatMessages(staff.id, channel));
    assert.ok(view); // Existing permission catalog remains intact.
    await prisma.chatRoleGrant.update({ where: { channelId_roleId: { channelId: channel, roleId: chatterRole.id } }, data: { canView: true, canPost: true } });
    await listChatMessages(staff.id, channel);
    check("Lifting recomputes current channel grants instead of restoring saved access");

    await change(qc.id, one, trial.id, true);
    await prisma.userRole.create({ data: { userId: trial.id, roleId: roles.get("QC")!.id } });
    await denied(() => getChatQuarantine(qc.id, one, trial.id));
    await denied(() => listChatMessages(trial.id, ownPrivate));
    assert.ok((await getChatQuarantine(owner.id, one, trial.id)).canLift);
    await change(owner.id, one, trial.id, false);
    await prisma.userRole.deleteMany({ where: { userId: trial.id, roleId: roles.get("QC")!.id } });
    check("Promotion removes a QC's target authority; Owner can recover an existing pause without granting new pause powers");

    const before = await currentInput(manager.id, one, staff.id, true);
    await prisma.$executeRawUnsafe(`CREATE FUNCTION "${triggerName}"() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.action = 'chat.quarantine.pause' THEN RAISE EXCEPTION 'Deliberate local audit failure'; END IF; RETURN NEW; END; $$`);
    await prisma.$executeRawUnsafe(`CREATE TRIGGER "${triggerName}" BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION "${triggerName}"()`); triggerInstalled = true;
    await assert.rejects(() => setChatQuarantine(manager.id, one, staff.id, before));
    assert.equal((await getChatQuarantine(manager.id, one, staff.id)).active, false);
    assert.equal(await prisma.chatMessage.count({ where: { systemEventKey: `quarantine-${before.requestId}` } }), 0);
    await prisma.$executeRawUnsafe(`DROP TRIGGER "${triggerName}" ON "AuditEvent"`); triggerInstalled = false;
    check("Audit failure rolls back restriction and private notice atomically");

    const headers = async (id: string) => ({ Cookie: `xyz_session=${(await createSession({ userId: id, expiresAt: new Date(Date.now() + 600000) })).token}`, "Content-Type": "application/json" });
    const root = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat`, path = `/areas/${one}/quarantines/${staff.id}`;
    assert.equal((await fetch(root + path)).status, 401);
    const managerHeaders = await headers(manager.id), staffHeaders = await headers(staff.id);
    const response = await fetch(root + path, { headers: managerHeaders }); assert.equal(response.status, 200); assert.equal(response.headers.get("Cache-Control"), "no-store");
    assert.equal((await fetch(root + path, { headers: staffHeaders })).status, 404);
    const payload = await currentInput(manager.id, one, staff.id, true);
    assert.equal((await fetch(root + path, { method: "PUT", headers: managerHeaders, body: JSON.stringify({ ...payload, allCreators: true }) })).status, 400);
    assert.equal((await fetch(root + path, { method: "PUT", headers: managerHeaders, body: JSON.stringify({ ...payload, reason: " " }) })).status, 400);
    assert.equal((await fetch(root + path, { method: "PUT", headers: managerHeaders, body: JSON.stringify(payload) })).status, 200);
    assert.equal((await fetch(`${root}/channels/${channel}/messages`, { headers: staffHeaders })).status, 404);
    assert.equal((await fetch(`${root}/channels/${ownPrivate}/messages`, { headers: staffHeaders })).status, 200);
    assert.equal((await fetch(`${root}/channels/${other}/messages`, { headers: staffHeaders })).status, 200);
    await change(manager.id, one, staff.id, false);
    check("Authenticated no-store HTTP, strict creator-local input and actual session access checks");

    const concurrentInput = await currentInput(manager.id, one, staff.id, true);
    const concurrent = await Promise.allSettled([setChatQuarantine(manager.id, one, staff.id, concurrentInput), setChatQuarantine(manager.id, one, staff.id, { ...concurrentInput, requestId: randomUUID() })]);
    assert.equal(concurrent.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(concurrent.filter((r) => r.status === "rejected" && r.reason instanceof ChatError && r.reason.status === 409).length, 1);
    await change(manager.id, one, staff.id, false);
    check("Concurrent different requests serialize; one state transition wins and the other must refresh");

    let entered!: () => void, release!: () => void;
    const enteredPromise = new Promise<void>((resolve) => { entered = resolve; });
    const releasePromise = new Promise<void>((resolve) => { release = resolve; });
    const heldRead = prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'chat-access:' + staff.id}, 0))`;
      entered(); await releasePromise;
    });
    await enteredPromise;
    const serializedInput = await currentInput(manager.id, one, staff.id, true);
    let completed = false;
    const waitingPause = setChatQuarantine(manager.id, one, staff.id, serializedInput).then((result) => { completed = true; return result; });
    try { await new Promise((resolve) => setTimeout(resolve, 120)); assert.equal(completed, false); }
    finally { release(); }
    await heldRead; await waitingPause;
    await denied(() => searchChatMessages(staff.id, prefix, channel));
    await change(manager.id, one, staff.id, false);
    check("A pause waits for in-flight Chat access; after commit a new search cannot retain the old audience");

    await prisma.chatArea.update({ where: { modelId: one }, data: { archivedAt: new Date() } });
    const archived = await getChatQuarantine(owner.id, one, staff.id); assert.equal(archived.canPause, false);
    await denied(() => setChatQuarantine(owner.id, one, staff.id, { active: true, version: archived.version, assignmentId: archived.assignmentId, reason: "Cannot pause archive", requestId: randomUUID() }), 403);
    await prisma.chatArea.update({ where: { modelId: one }, data: { archivedAt: null } });
    const staleActorInput = await currentInput(manager.id, one, staff.id, true);
    const managerAssignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: manager.id, modelId: one } } });
    await prisma.userModelAssignment.delete({ where: { id: managerAssignment.id } });
    await denied(() => setChatQuarantine(manager.id, one, staff.id, staleActorInput));
    await prisma.userModelAssignment.create({ data: { userId: manager.id, modelId: one } });
    check("Archived areas and a reviewer's lost assignment cannot use a stale confirmation to create a pause");

    const permission = await prisma.permission.findUniqueOrThrow({ where: { key: "chat.quarantine.trials" } });
    await prisma.rolePermission.deleteMany({ where: { roleId: roles.get("QC")!.id, permissionId: permission.id } });
    assert.equal(await prisma.$transaction((tx) => installChatQuarantineDefaults(tx)), false);
    await denied(() => getChatQuarantine(qc.id, one, trial.id));
    await prisma.rolePermission.create({ data: { roleId: roles.get("QC")!.id, permissionId: permission.id } });
    assert.deepEqual({ incidents: await prisma.incident.count(), strikes: await prisma.strike.count() }, baseline);
    check("Repeat provisioning preserves removed permissions; unrelated incidents and strikes remain unchanged");

    await change(qc.id, one, trial.id, true);
    const retainedState = await prisma.chatQuarantine.findUniqueOrThrow({ where: { modelId_userId: { modelId: one, userId: trial.id } } });
    await prisma.user.delete({ where: { id: trial.id } });
    const retained = await prisma.chatQuarantine.findUniqueOrThrow({ where: { id: retainedState.id } });
    assert.equal(retained.userId, null); assert.equal(retained.personName, trial.name);
    assert.ok((await listChatMessages(owner.id, newPrivate)).messages.some((m) => m.systemNotice));
    check("Deleting an account retains pause attribution and archived private notices without a live user relation");
    console.log(`\n${passed} Chat quarantine integration groups passed.`);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    if (triggerInstalled) await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS "${triggerName}" ON "AuditEvent"`);
    await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS "${triggerName}"()`);
    await prisma.chatQuarantine.deleteMany({ where: { modelId: { in: models } } });
    await prisma.clockAlert.deleteMany({ where: { shift: { userId: { in: users } } } });
    await prisma.clockBreak.deleteMany({ where: { shift: { userId: { in: users } } } }); await prisma.clockShift.deleteMany({ where: { userId: { in: users } } });
    await prisma.chatMessage.deleteMany({ where: { OR: [{ channel: { modelId: { in: models } } }, { conversation: { modelId: { in: models } } }] } });
    await prisma.chatStandingConversation.deleteMany({ where: { modelId: { in: models } } });
    await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } }); await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.userModelAssignment.deleteMany({ where: { modelId: { in: models } } }); await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
