import { Prisma, type ChatStandingKind } from "@prisma/client";
import { CHAT_PERMISSION_DEFINITIONS, STANDING_CHAT_ROLE_DEFAULTS } from "../permissions/chat-permissions.js";

const subjectInclude = {
  modelAssignments: true,
  roleMemberships: { where: { role: { archivedAt: null } }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
} satisfies Prisma.UserInclude;
const keysOf = (user: Prisma.UserGetPayload<{ include: typeof subjectInclude }>) => new Set(user.roleMemberships.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => permission.key)));

export async function installStandingChatDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942118)`;
  if (await tx.chatSetup.findUnique({ where: { id: "standing-chat-v1" } })) return false;
  const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: Object.keys(STANDING_CHAT_ROLE_DEFAULTS) } } });
  const wanted = new Set(Object.values(STANDING_CHAT_ROLE_DEFAULTS).flat());
  for (const definition of CHAT_PERMISSION_DEFINITIONS.filter((d) => wanted.has(d.key))) {
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
    const eligible = roles.filter((r) => STANDING_CHAT_ROLE_DEFAULTS[r.systemKey!]?.includes(data.key));
    await tx.rolePermission.createMany({ data: eligible.map((r) => ({ roleId: r.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.chatSetup.create({ data: { id: "standing-chat-v1" } });
  await tx.auditEvent.create({ data: { action: "chat.standing.defaults.install", success: true, statusCode: 200, targetType: "chat", metadata: { version: 1 } } });
  return true;
}

async function recordLifecycle(tx: Prisma.TransactionClient, id: string, action: string, metadata: Prisma.InputJsonObject) {
  await tx.auditEvent.create({ data: { action, success: true, statusCode: 200, targetType: "chat", targetId: id, metadata } });
}
async function archive(tx: Prisma.TransactionClient, id: string, reason: string) {
  const result = await tx.chatStandingConversation.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
  if (result.count) await recordLifecycle(tx, id, "chat.private.archive", { reason });
}

export async function syncCreatorStandingChat(tx: Prisma.TransactionClient, modelId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  const model = await tx.agencyModel.findUniqueOrThrow({ where: { id: modelId }, include: { creatorUser: { include: subjectInclude } } });
  const current = await tx.chatStandingConversation.findFirst({ where: { kind: "CREATOR", modelId, archivedAt: null } });
  const eligible = !model.creatorUser || keysOf(model.creatorUser).has("chat.private.creator");
  if (!eligible) { if (current) await archive(tx, current.id, "Creator private-chat permission removed"); return; }
  if (current && (!current.subjectUserId || current.subjectUserId === model.creatorUserId)) {
    await tx.chatStandingConversation.update({ where: { id: current.id }, data: { subjectUserId: model.creatorUserId, subjectName: model.name } });
    return;
  }
  if (current) await archive(tx, current.id, "Creator account changed");
  const created = await tx.chatStandingConversation.create({ data: { kind: "CREATOR", modelId, subjectUserId: model.creatorUserId, subjectName: model.name } });
  await recordLifecycle(tx, created.id, "chat.private.create", { kind: "CREATOR", modelId });
}

/** Same transaction as invitations and access changes. Old assignment episodes
 * are archived, never reopened, and never inherited by a new Manager/QC. */
export async function syncUserStandingChats(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  const user = await tx.user.findUniqueOrThrow({ where: { id: userId }, include: subjectInclude });
  const permissions = keysOf(user);
  const own = await tx.chatStandingConversation.findMany({ where: { subjectUserId: userId, kind: { not: "CREATOR" }, archivedAt: null } });
  const wanted: { kind: ChatStandingKind; modelId: string | null; assignmentId: string | null }[] = [];
  if (permissions.has("chat.access")) {
    if (permissions.has("chat.private.staff")) wanted.push(...user.modelAssignments.map((a) => ({ kind: "STAFF" as const, modelId: a.modelId, assignmentId: a.id })));
    if (permissions.has("chat.private.accountant")) wanted.push({ kind: "ACCOUNTANT", modelId: null, assignmentId: null });
    if (permissions.has("chat.private.general")) wanted.push({ kind: "GENERAL_STAFF", modelId: null, assignmentId: null });
  }
  for (const conversation of own) {
    if (!wanted.some((w) => w.kind === conversation.kind && w.assignmentId === conversation.assignmentId)) {
      await archive(tx, conversation.id, "Assignment or private-chat permission ended");
    }
  }
  for (const entry of wanted) {
    if (own.some((c) => c.kind === entry.kind && c.assignmentId === entry.assignmentId)) continue;
    const created = await tx.chatStandingConversation.create({ data: { ...entry, subjectUserId: user.id, subjectName: user.name } });
    await recordLifecycle(tx, created.id, "chat.private.create", { kind: entry.kind, modelId: entry.modelId, subjectUserId: user.id });
  }
  const creator = await tx.agencyModel.findUnique({ where: { creatorUserId: user.id }, select: { id: true } });
  if (creator) await syncCreatorStandingChat(tx, creator.id);
}

export async function archiveUserStandingChats(tx: Prisma.TransactionClient, userId: string) {
  const chats = await tx.chatStandingConversation.findMany({ where: { subjectUserId: userId, archivedAt: null }, select: { id: true } });
  for (const chat of chats) await archive(tx, chat.id, "Subject account permanently deleted");
}
