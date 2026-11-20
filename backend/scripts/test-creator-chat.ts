import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { ChatError, chatGrantOptions, editChatMessage, installCreatorChatDefaults, listChatAreas, listChatMembers, listChatMessages, provisionCreatorChat, sendChatMessage, setChatGrant } from "../src/services/creator-chat.js";
import { createSession } from "../src/services/session.js";
import { loadSession } from "../src/middleware/session-auth.js";
import chatRoutes from "../src/routes/chat.js";
import { getAccessContext } from "../src/services/access-control.js";
import { installStandingChatDefaults } from "../src/services/standing-chat.js";
import { createManagedModel } from "../src/services/model-management.js";
import { ensureCreatorAccount } from "../src/services/creator-account.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.ok(["127.0.0.1", "localhost", "[::1]"].includes(url.hostname), "Chat integration tests require an isolated local database.");
  process.env.BLOCK2_CHAT_ENABLED = "true";
  const prefix = `chat-test-${Date.now()}-${process.pid}`;
  const users: string[] = [], models: string[] = [], customRoles: string[] = [];
  let passed = 0;
  const check = (name: string) => { passed++; console.log(`✓ ${name}`); };
  const expect = async (fn: () => Promise<unknown>, status: number) => assert.rejects(fn, (e: unknown) => e instanceof ChatError && e.status === status);
  await prisma.$transaction((tx) => installCreatorChatDefaults(tx));
  await prisma.$transaction((tx) => installStandingChatDefaults(tx));
  const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r]));
  const makeUser = async (name: string, keys: string[]) => {
    const user = await prisma.user.create({ data: { name: `${prefix} ${name}`, email: `${prefix}-${name}@example.test`, status: "ACTIVE",
      roleMemberships: { create: keys.map((key) => ({ roleId: roles.get(key)!.id })) } } });
    users.push(user.id); return user;
  };
  const assign = (userId: string, modelId: string) => prisma.userModelAssignment.create({ data: { userId, modelId } });
  const channels = (userId: string, modelId: string) => listChatAreas(userId).then((a) => a.find((area) => area.modelId === modelId)?.channels.filter((c) => !c.isPrivate) ?? []);
  const baseline = { incidents: await prisma.incident.count(), strikes: await prisma.strike.count() };
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/chat", chatRoutes);
  const server = app.listen(0, "127.0.0.1");
  try {
    await once(server, "listening");
    const owner = await makeUser("owner", ["OWNER"]);
    const ops = await makeUser("ops", ["OPS_MANAGER"]);
    const manager = await makeUser("manager", ["MANAGER"]);
    const qc = await makeUser("qc", ["QC"]);
    const chatter = await makeUser("chatter", ["CHATTER"]);
    const trial = await makeUser("trial", ["TRIAL_CHATTER"]);
    const developer = await makeUser("developer", ["DEV"]);
    const creator = await makeUser("creator", ["MODEL"]);
    const accountant = await makeUser("accountant", ["ACCOUNTANT"]);
    const ownerAccess = await getAccessContext(owner.id);
    for (const label of ["Mei", "Other"]) {
      const model = await createManagedModel(`${prefix} ${label}`, ownerAccess); models.push(model.id);
    }
    const [mei, other] = models;
    const all = await prisma.chatChannel.findMany({ where: { modelId: mei }, orderBy: { sortOrder: "asc" } });
    assert.equal(all.length, 13);
    const general = all.find((c) => c.key === "general")!, feedback = all.find((c) => c.key === "trial-feedback")!, top = all.find((c) => c.key === "top-tier")!;
    check("Creating a creator automatically provisions exactly thirteen ordinary channels");
    assert.equal(await prisma.$transaction((tx) => provisionCreatorChat(tx, mei)), 0);
    assert.equal(await prisma.$transaction((tx) => installCreatorChatDefaults(tx)), false);
    check("Provisioning and default installation are repeatable without duplicate channels");
    for (const user of [manager, qc, chatter, trial, accountant]) await assign(user.id, mei);
    await assign(chatter.id, other);
    assert.equal((await channels(chatter.id, mei)).length, 9);
    assert.equal((await channels(trial.id, mei)).length, 3);
    assert.equal((await channels(qc.id, mei)).length, 13);
    assert.equal((await channels(manager.id, mei)).length, 13);
    check("Chatter starts with nine channels, Trial with three, and QC/Manager with thirteen");
    assert.equal((await channels(chatter.id, other)).length, 9);
    assert.equal((await channels(manager.id, other)).length, 0);
    assert.equal((await channels(owner.id, other)).length, 13);
    assert.equal((await channels(ops.id, other)).length, 13);
    check("Multiple creator assignments work without broadening a Manager's other creator access");
    assert.ok((await listChatAreas(creator.id)).every((a) => a.channels.every((c) => c.isPrivate)));
    assert.ok((await listChatAreas(accountant.id)).every((a) => a.channels.every((c) => c.isPrivate)));
    check("Creator and Accountant defaults cannot expose ordinary operations channels");
    assert.ok((await channels(developer.id, mei)).every((c) => !c.canPost));
    await expect(() => sendChatMessage(developer.id, general.id, "No posting", "developer-message-1"), 403);
    check("Developer can read every ordinary channel but cannot post by default");
    await expect(() => listChatMessages(chatter.id, feedback.id), 404);
    await setChatGrant(owner.id, feedback.id, { personId: chatter.id, canView: true, canPost: true });
    await expect(() => listChatMessages(chatter.id, feedback.id), 404);
    await prisma.userRole.create({ data: { userId: chatter.id, roleId: roles.get("QC")!.id } });
    assert.equal((await channels(chatter.id, mei)).length, 13);
    await prisma.userRole.deleteMany({ where: { userId: chatter.id, roleId: roles.get("QC")!.id } });
    await expect(() => listChatMessages(chatter.id, feedback.id), 404);
    check("Trial feedback stays hidden from Chatter-only access; adding/removing QC takes effect immediately");
    const custom = await prisma.role.create({ data: { name: `${prefix} custom`, dataScope: "ALL", rank: 2 } }); customRoles.push(custom.id);
    const customUser = await makeUser("custom", []);
    await prisma.userRole.create({ data: { userId: customUser.id, roleId: custom.id } });
    await assign(customUser.id, mei);
    await expect(() => listChatAreas(customUser.id), 403);
    await prisma.rolePermission.createMany({ data: (await prisma.permission.findMany({ where: { key: { in: ["chat.access", "chat.ordinary.access", "chat.messages.send"] } } })).map((p) => ({ roleId: custom.id, permissionId: p.id })) });
    assert.equal((await channels(customUser.id, mei)).length, 0);
    await setChatGrant(owner.id, general.id, { roleId: custom.id, canView: false, canPost: true });
    assert.equal((await channels(customUser.id, mei)).length, 1);
    await expect(() => setChatGrant(customUser.id, general.id, { personId: trial.id, canView: true, canPost: true }), 403);
    check("Custom role rank/data scope grants nothing: explicit page and channel permissions control access");
    await setChatGrant(owner.id, top.id, { personId: chatter.id, canView: true, canPost: false });
    assert.equal((await channels(chatter.id, mei)).find((c) => c.id === top.id)?.canPost, false);
    await setChatGrant(owner.id, general.id, { personId: chatter.id, canView: false, canPost: false });
    assert.equal((await channels(chatter.id, mei)).find((c) => c.id === general.id)?.canPost, true);
    check("Read-only named grants work and an empty grant cannot cancel a generous role grant");
    await expect(() => setChatGrant(owner.id, top.id, { personId: owner.id, canView: true, canPost: true }), 403);
    await expect(() => setChatGrant(owner.id, top.id, { personId: creator.id, canView: true, canPost: true }), 404);
    const options = await chatGrantOptions(owner.id, top.id);
    assert.ok(!options.people.some((p) => p.id === creator.id || p.id === owner.id));
    check("Managers cannot add themselves or people outside the creator's current assignments");
    const otherOwner = await makeUser("other-owner", ["OWNER", "CHATTER"]);
    const ownerAssignment = await assign(otherOwner.id, mei);
    // Legacy rows must not make Owner access editable or reduce built-in oversight.
    const ownerRoleGrant = await prisma.chatRoleGrant.upsert({ where: { channelId_roleId: { channelId: top.id, roleId: roles.get("OWNER")!.id } },
      create: { channelId: top.id, roleId: roles.get("OWNER")!.id, canView: false, canPost: false }, update: { canView: false, canPost: false } });
    const ownerPersonGrant = await prisma.chatPersonGrant.create({ data: { channelId: top.id, assignmentId: ownerAssignment.id, canView: false, canPost: false } });
    const ownerGrantAuditCount = await prisma.auditEvent.count({ where: { action: "chat.channel.grant", targetId: top.id } });
    for (const actor of [owner, manager]) {
      const choices = await chatGrantOptions(actor.id, top.id);
      assert.ok(!choices.roles.some((r) => r.id === roles.get("OWNER")!.id));
      assert.ok(!choices.people.some((p) => p.id === otherOwner.id));
      // The rank-2 custom role is editable by Owners but sits above a Manager (rank 3).
      assert.equal(choices.roles.some((r) => r.id === custom.id), actor === owner, "Custom roles follow the rank chain");
      assert.ok(choices.people.some((p) => p.id === chatter.id), "Ordinary assigned members remain editable");
      for (const allow of [false, true]) {
        await expect(() => setChatGrant(actor.id, top.id, { roleId: roles.get("OWNER")!.id, canView: allow, canPost: allow }), 403);
        await expect(() => setChatGrant(actor.id, top.id, { personId: otherOwner.id, canView: allow, canPost: allow }), 403);
      }
    }
    assert.deepEqual(await prisma.chatRoleGrant.findUniqueOrThrow({ where: { channelId_roleId: { channelId: top.id, roleId: roles.get("OWNER")!.id } } }), ownerRoleGrant);
    assert.deepEqual(await prisma.chatPersonGrant.findUniqueOrThrow({ where: { channelId_assignmentId: { channelId: top.id, assignmentId: ownerAssignment.id } } }), ownerPersonGrant);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.channel.grant", targetId: top.id } }), ownerGrantAuditCount);
    assert.equal((await channels(otherOwner.id, mei)).find((c) => c.id === top.id)?.canPost, true);
    const ownerSession = await createSession({ userId: owner.id, expiresAt: new Date(Date.now() + 60_000) });
    const grantEndpoint = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/chat/channels/${top.id}/grants`;
    const ownerHeaders = { Cookie: `xyz_session=${ownerSession.token}`, "Content-Type": "application/json" };
    const choicesResponse = await fetch(grantEndpoint, { headers: ownerHeaders }); assert.equal(choicesResponse.status, 200);
    const httpChoices = await choicesResponse.json() as { roles: { id: string }[]; people: { id: string }[] };
    assert.ok(!httpChoices.roles.some((r) => r.id === roles.get("OWNER")!.id));
    assert.ok(!httpChoices.people.some((p) => p.id === otherOwner.id));
    for (const target of [{ roleId: roles.get("OWNER")!.id }, { personId: otherOwner.id }]) {
      assert.equal((await fetch(grantEndpoint, { method: "PUT", headers: ownerHeaders, body: JSON.stringify({ ...target, canView: true, canPost: true }) })).status, 403);
    }
    check("Owner role and multi-role owners are absent from editable options; direct service/HTTP grants cannot change their automatic access");
    const roleChoices = await chatGrantOptions(owner.id, top.id);
    const roleChoice = (id: string) => roleChoices.roles.find((r) => r.id === id)!;
    assert.deepEqual(roleChoice(roles.get("OPS_MANAGER")!.id).siteWideAccess, { canView: true, canPost: true });
    assert.deepEqual(roleChoice(roles.get("DEV")!.id).siteWideAccess, { canView: true, canPost: false });
    assert.deepEqual(roleChoice(custom.id).siteWideAccess, { canView: false, canPost: false });
    assert.equal(roleChoice(roles.get("OPS_MANAGER")!.id).grant, null);
    await setChatGrant(owner.id, top.id, { roleId: roles.get("OPS_MANAGER")!.id, canView: false, canPost: false });
    const opsChoice = (await chatGrantOptions(owner.id, top.id)).roles.find((r) => r.id === roles.get("OPS_MANAGER")!.id)!;
    assert.equal(opsChoice.grant?.canView, false); assert.equal(opsChoice.siteWideAccess.canPost, true);
    assert.equal((await listChatMessages(ops.id, top.id)).canPost, true);
    assert.equal((await channels(ops.id, other)).length, 13);
    const refreshedChoices = await (await fetch(grantEndpoint, { headers: ownerHeaders })).json() as { roles: { id: string; siteWideAccess: { canView: boolean; canPost: boolean } }[] };
    assert.equal(refreshedChoices.roles.find((r) => r.id === roles.get("OPS_MANAGER")!.id)!.siteWideAccess.canPost, true);
    check("Channel options report site-wide Post/See access independently of saved grants and preserve Ops access across creator areas");
    // Chain of command: outside Owners, grants are limited to roles strictly below
    // the editor's rank (never protected roles or a role they hold) and to people
    // whose every role is below the editor.
    const junior = await prisma.role.create({ data: { name: `${prefix} junior`, dataScope: "SELF", rank: 7 } }); customRoles.push(junior.id);
    const peerManager = await makeUser("peer-manager", ["MANAGER"]); await assign(peerManager.id, mei);
    const managerChatter = await makeUser("manager-chatter", ["MANAGER", "CHATTER"]); await assign(managerChatter.id, mei);
    const roleIds = (choices: { roles: { id: string }[] }) => new Set(choices.roles.map((r) => r.id));
    const managerChoices = await chatGrantOptions(manager.id, top.id);
    for (const key of ["QC", "CHATTER", "TRIAL_CHATTER"]) assert.ok(roleIds(managerChoices).has(roles.get(key)!.id), `${key} is below Manager`);
    assert.ok(roleIds(managerChoices).has(junior.id), "A custom role ranked below Manager is editable");
    for (const key of ["MANAGER", "OPS_MANAGER", "DEV", "ACCOUNTANT", "MODEL", "GENERAL_STAFF"]) assert.ok(!roleIds(managerChoices).has(roles.get(key)!.id), `${key} is not editable by a Manager`);
    assert.ok(!managerChoices.people.some((p) => p.id === peerManager.id || p.id === managerChatter.id || p.id === accountant.id), "Peers and protected roles are hidden");
    assert.ok(managerChoices.people.some((p) => p.id === trial.id), "Lower-ranked members stay editable");
    const opsChoices = await chatGrantOptions(ops.id, top.id);
    assert.ok(roleIds(opsChoices).has(roles.get("MANAGER")!.id) && !roleIds(opsChoices).has(roles.get("OPS_MANAGER")!.id) && !roleIds(opsChoices).has(custom.id));
    assert.ok(opsChoices.people.some((p) => p.id === peerManager.id) && !opsChoices.people.some((p) => p.id === accountant.id || p.id === customUser.id));
    assert.ok(!roleIds(await chatGrantOptions(managerChatter.id, top.id)).has(roles.get("CHATTER")!.id), "A role the editor holds is never editable");
    const hierarchyAuditCount = await prisma.auditEvent.count({ where: { action: "chat.channel.grant", targetId: top.id } });
    const managerRoleGrant = await prisma.chatRoleGrant.findUnique({ where: { channelId_roleId: { channelId: top.id, roleId: roles.get("MANAGER")!.id } } });
    for (const roleKey of ["MANAGER", "OPS_MANAGER", "DEV"]) await expect(() => setChatGrant(manager.id, top.id, { roleId: roles.get(roleKey)!.id, canView: true, canPost: false }), 403);
    await expect(() => setChatGrant(manager.id, top.id, { roleId: custom.id, canView: true, canPost: true }), 403);
    await expect(() => setChatGrant(managerChatter.id, top.id, { roleId: roles.get("CHATTER")!.id, canView: true, canPost: true }), 403);
    for (const person of [peerManager, managerChatter, accountant]) await expect(() => setChatGrant(manager.id, top.id, { personId: person.id, canView: true, canPost: true }), 403);
    await expect(() => setChatGrant(ops.id, top.id, { roleId: roles.get("OPS_MANAGER")!.id, canView: true, canPost: true }), 403);
    assert.deepEqual(await prisma.chatRoleGrant.findUnique({ where: { channelId_roleId: { channelId: top.id, roleId: roles.get("MANAGER")!.id } } }), managerRoleGrant);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.channel.grant", targetId: top.id } }), hierarchyAuditCount);
    const managerSession = await createSession({ userId: manager.id, expiresAt: new Date(Date.now() + 60_000) });
    const managerHeaders = { Cookie: `xyz_session=${managerSession.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(grantEndpoint, { method: "PUT", headers: managerHeaders, body: JSON.stringify({ roleId: roles.get("MANAGER")!.id, canView: true, canPost: false }) })).status, 403);
    await setChatGrant(manager.id, top.id, { roleId: roles.get("QC")!.id, canView: true, canPost: true });
    await setChatGrant(manager.id, top.id, { roleId: junior.id, canView: false, canPost: false });
    await setChatGrant(manager.id, top.id, { personId: trial.id, canView: true, canPost: false });
    await setChatGrant(ops.id, top.id, { roleId: roles.get("MANAGER")!.id, canView: true, canPost: true });
    check("Channel grants follow the chain of command: only roles and members ranked below the editor, never peers, protected roles or held roles");
    const sent = await sendChatMessage(chatter.id, general.id, "Original full message", "message-reference-1");
    const retry = await sendChatMessage(chatter.id, general.id, "Original full message", "message-reference-1");
    assert.equal(sent.id, retry.id);
    assert.equal(await prisma.auditEvent.count({ where: { action: "chat.message.send", targetId: sent.id } }), 1);
    await expect(() => sendChatMessage(chatter.id, general.id, "Different content", "message-reference-1"), 409);
    check("Retried sends create one message and exactly one transactional audit event");
    await expect(() => editChatMessage(qc.id, general.id, sent.id, "Another author", 1), 403);
    const edits = await Promise.allSettled([
      editChatMessage(chatter.id, general.id, sent.id, "Edited full message", 1),
      editChatMessage(chatter.id, general.id, sent.id, "Concurrent edit", 1),
    ]);
    assert.equal(edits.filter((r) => r.status === "fulfilled").length, 1);
    const event = await prisma.auditEvent.findFirstOrThrow({ where: { action: "chat.message.edit", targetId: sent.id } });
    assert.equal((event.metadata as { before: string }).before, "Original full message");
    assert.equal(typeof (event.metadata as { after: string }).after, "string");
    check("Only the author edits; concurrent edits cannot overwrite each other; full revisions are audited");
    const assignment = await prisma.userModelAssignment.findUniqueOrThrow({ where: { userId_modelId: { userId: chatter.id, modelId: mei } } });
    await prisma.userModelAssignment.delete({ where: { id: assignment.id } });
    await expect(() => listChatMessages(chatter.id, general.id), 404);
    assert.equal(await prisma.chatPersonGrant.count({ where: { assignmentId: assignment.id } }), 0);
    await assign(chatter.id, mei);
    assert.ok(!(await channels(chatter.id, mei)).some((c) => c.id === top.id));
    check("Unassignment immediately blocks history and removes named grants; returning staff do not regain old named access");
    const members = await listChatMembers(trial.id, feedback.id);
    assert.ok(!members.some((m) => m.id === chatter.id));
    assert.ok(members.some((m) => m.id === developer.id && !m.canPost));
    assert.ok(members.every((m) => Object.keys(m).every((key) =>
      ["id", "name", "role", "avatarUpdatedAt", "canView", "canPost", "quarantine"].includes(key))));
    assert.ok(members.every((m) => typeof m.role === "string" && m.role.length > 0));
    assert.ok(members.every((m) => m.avatarUpdatedAt === null || m.avatarUpdatedAt instanceof Date));
    assert.ok(members.every((m) => m.quarantine === null));
    check("Member lists expose only authorized participants, role and avatar version; no email directory");
    const preservedGrant = await prisma.chatRoleGrant.findUniqueOrThrow({ where: { channelId_roleId: { channelId: general.id, roleId: roles.get("CHATTER")!.id } } });
    await prisma.chatChannel.update({ where: { id: general.id }, data: { name: "Custom General name" } });
    await prisma.chatRoleGrant.update({ where: { channelId_roleId: { channelId: general.id, roleId: preservedGrant.roleId } }, data: { canPost: false } });
    await prisma.$transaction((tx) => provisionCreatorChat(tx, mei));
    assert.equal((await prisma.chatChannel.findUniqueOrThrow({ where: { id: general.id } })).name, "Custom General name");
    assert.equal((await channels(chatter.id, mei)).find((c) => c.id === general.id)?.canPost, false);
    await prisma.chatRoleGrant.update({ where: { channelId_roleId: { channelId: general.id, roleId: preservedGrant.roleId } }, data: { canPost: true } });
    check("Repeated provisioning preserves channel names and management's changed posting rules");
    await prisma.chatArea.update({ where: { modelId: mei }, data: { archivedAt: new Date() } });
    assert.equal((await channels(ops.id, mei)).length, 0);
    assert.equal((await channels(owner.id, mei)).length, 13);
    assert.equal((await channels(developer.id, mei)).length, 13);
    await expect(() => sendChatMessage(owner.id, general.id, "Frozen", "archive-reference-1"), 403);
    await prisma.chatArea.update({ where: { modelId: mei }, data: { archivedAt: null } });
    check("Archived areas are frozen; default archive reading is limited to Owner and Developer");
    const linked = await prisma.$transaction((tx) => ensureCreatorAccount(tx, creator, [{ systemKey: "MODEL" }], null, ownerAccess));
    models.push(linked!.id);
    assert.equal(await prisma.chatChannel.count({ where: { modelId: linked!.id } }), 13);
    check("Creator-account linking also provisions channels in the same transaction");
    // Exercise HTTP authentication, feature gating, hidden IDs and validation.
    const port = (server.address() as AddressInfo).port;
    const endpoint = `http://127.0.0.1:${port}/api/chat`;
    assert.equal((await fetch(`${endpoint}/areas`)).status, 401);
    const session = await createSession({ userId: chatter.id, expiresAt: new Date(Date.now() + 60_000) });
    const headers = { Cookie: `xyz_session=${session.token}`, "Content-Type": "application/json" };
    assert.equal((await fetch(`${endpoint}/channels/${feedback.id}/messages`, { headers })).status, 404);
    assert.equal((await fetch(`${endpoint}/channels/does-not-exist/messages`, { headers })).status, 404);
    assert.equal((await fetch(`${endpoint}/channels/${general.id}/messages`, { method: "POST", headers, body: JSON.stringify({ text: "", clientNonce: "empty-message-1" }) })).status, 400);
    process.env.BLOCK2_CHAT_ENABLED = "false";
    assert.equal((await fetch(`${endpoint}/areas`, { headers })).status, 404);
    process.env.BLOCK2_CHAT_ENABLED = "true";
    check("HTTP routes require a live session, validate input, hide inaccessible IDs, and honour the disabled feature switch");
    await prisma.user.update({ where: { id: chatter.id }, data: { status: "DEACTIVATED" } });
    await expect(() => listChatAreas(chatter.id), 401);
    assert.equal((await fetch(`${endpoint}/areas`, { headers })).status, 401);
    check("Deactivation immediately blocks service and authenticated HTTP access");
    // Stable pagination when all timestamps are identical, plus cursor isolation.
    await prisma.chatMessage.createMany({ data: Array.from({ length: 55 }, (_, i) => ({ channelId: general.id, authorUserId: qc.id, authorName: qc.name,
      clientNonce: `pagination-${i}`, text: `Page ${i}`, createdAt: new Date("2026-10-22T12:00:00Z") })) });
    const page1 = await listChatMessages(qc.id, general.id);
    const page2 = await listChatMessages(qc.id, general.id, page1.nextBefore!);
    assert.equal(new Set([...page1.messages, ...page2.messages].map((m) => m.id)).size, 56);
    await expect(() => listChatMessages(qc.id, feedback.id, sent.id), 400);
    check("Pagination handles tied timestamps without gaps and rejects another channel's cursor");
    await prisma.user.delete({ where: { id: qc.id } });
    const historical = await prisma.chatMessage.findFirstOrThrow({ where: { clientNonce: "pagination-0", channelId: general.id } });
    assert.equal(historical.authorUserId, null); assert.equal(historical.authorName, qc.name);
    assert.equal(await prisma.auditEvent.count({ where: { targetId: sent.id } }), 2);
    check("Removing an account preserves message authorship snapshots and full audit history");
    assert.deepEqual({ incidents: await prisma.incident.count(), strikes: await prisma.strike.count() }, baseline);
    check("Existing QA incidents and strikes are untouched");
    console.log(`\n${passed} creator-chat integration checks passed.`);
  } finally {
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.chatMessage.deleteMany({ where: { channel: { modelId: { in: models } } } });
    await prisma.chatStandingConversation.deleteMany({ where: { modelId: { in: models } } });
    await prisma.chatChannel.deleteMany({ where: { modelId: { in: models } } });
    await prisma.chatArea.deleteMany({ where: { modelId: { in: models } } });
    await prisma.userModelAssignment.deleteMany({ where: { modelId: { in: models } } });
    await prisma.agencyModel.deleteMany({ where: { id: { in: models } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
    await prisma.role.deleteMany({ where: { id: { in: customRoles } } });
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
