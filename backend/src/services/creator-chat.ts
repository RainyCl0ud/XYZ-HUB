import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { prisma } from "../lib/prisma.js";
import { CHAT_ROLE_DEFAULTS, CHAT_PERMISSION_DEFINITIONS } from "../permissions/chat-permissions.js";
import { syncCreatorStandingChat } from "./standing-chat.js";

export const isCreatorChatEnabled = () => process.env.BLOCK2_CHAT_ENABLED === "true";
export class ChatError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}

export const STARTER_CHANNELS = [
  ["general", "General"], ["updates", "Updates"], ["trial-feedback", "Trial feedback"],
  ["feedback", "Feedback"], ["training-guide", "Training guide"], ["mm-approval", "MM approval"],
  ["endorsements", "Endorsements"], ["fan-issues", "Fan issues"],
  ["clocked-out-claims", "Clocked out claims"], ["audio-requests", "Audio requests"],
  ["top-tier", "Top-Tier"], ["fan-push-up", "Fan Push up"], ["tw-submission", "TW submission"],
] as const;

/** Safe to repeat: only newly inserted channels receive starter grants. Existing
 * names and permission customisations are never overwritten by provisioning. */
export async function provisionCreatorChat(tx: Prisma.TransactionClient, modelId: string, options: { includeStanding?: boolean } = {}) {
  await tx.chatArea.upsert({ where: { modelId }, create: { modelId }, update: {} });
  const channels = await tx.chatChannel.createManyAndReturn({
    data: STARTER_CHANNELS.map(([key, name], sortOrder) => ({ modelId, key, name, sortOrder })),
    skipDuplicates: true,
  });
  const roles = await tx.role.findMany({ where: { systemKey: { in: ["QC", "MANAGER", "CHATTER", "TRIAL_CHATTER"] }, archivedAt: null } });
  const grants = channels.flatMap((channel) => roles.filter((role) =>
    role.systemKey === "QC" || role.systemKey === "MANAGER" ||
    (role.systemKey === "CHATTER" && channel.sortOrder < 10 && channel.key !== "trial-feedback") ||
    (role.systemKey === "TRIAL_CHATTER" && channel.sortOrder < 3),
  ).map((role) => ({ channelId: channel.id, roleId: role.id, canView: true, canPost: true })));
  if (grants.length) await tx.chatRoleGrant.createMany({ data: grants, skipDuplicates: true });
  if (options.includeStanding !== false) await syncCreatorStandingChat(tx, modelId);
  return channels.length;
}

/** Explicit, one-time rollout. Regular startup/seeding must not restore defaults
 * an Owner later removes. The setup marker and defaults commit atomically. */
export async function installCreatorChatDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942117)`;
  if (await tx.chatSetup.findUnique({ where: { id: "ordinary-creator-chat-v1" } })) return false;
  for (const definition of CHAT_PERMISSION_DEFINITIONS) {
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
    const keys = Object.keys(CHAT_ROLE_DEFAULTS).filter((key) => CHAT_ROLE_DEFAULTS[key].includes(data.key));
    const roles = await tx.role.findMany({ where: { systemKey: { in: keys }, archivedAt: null } });
    await tx.rolePermission.createMany({ data: roles.map((role) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.chatSetup.create({ data: { id: "ordinary-creator-chat-v1" } });
  await tx.auditEvent.create({ data: { action: "chat.defaults.install", success: true, statusCode: 200, targetType: "chat", metadata: { version: 1 } } });
  return true;
}

const viewerInclude = {
  modelAssignments: true,
  roleMemberships: { where: { role: { archivedAt: null } }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
} satisfies Prisma.UserInclude;
type ViewerUser = Prisma.UserGetPayload<{ include: typeof viewerInclude }>;
function makeViewer(user: ViewerUser) {
  const permissions = new Set(user.roleMemberships.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => permission.key)));
  const isOwner = user.roleMemberships.some(({ role }) => role.systemKey === "OWNER");
  // General Staff privacy is an Owner-only system boundary, matching the
  // existing Owner-only access controls. Stale/custom grants cannot widen it.
  permissions.delete("chat.private.general.review");
  if (isOwner) permissions.add("chat.private.general.review");
  return { user, permissions, isOwner, roleIds: new Set(user.roleMemberships.map(({ role }) => role.id)) };
}
type Viewer = ReturnType<typeof makeViewer>;
async function loadViewer(tx: Prisma.TransactionClient, userId: string) {
  const user = await tx.user.findUnique({ where: { id: userId }, include: viewerInclude });
  if (!user || user.status !== "ACTIVE") throw new ChatError(401, "Please sign in again.");
  const viewer = makeViewer(user);
  if (!viewer.permissions.has("chat.access")) throw new ChatError(403, "Chat access is required.");
  return viewer;
}
const channelInclude = { area: { include: { model: true } }, roleGrants: true, personGrants: true } satisfies Prisma.ChatChannelInclude;
type Channel = Prisma.ChatChannelGetPayload<{ include: typeof channelInclude }>;

function channelAccess(viewer: Viewer, channel: Channel) {
  const p = viewer.permissions;
  const assignment = viewer.user.modelAssignments.find((a) => a.modelId === channel.modelId);
  const inArea = p.has("chat.access") && p.has("chat.ordinary.access") && (!!assignment || p.has("chat.areas.all"));
  const archived = !!channel.area.archivedAt;
  // A Chatter restriction beats named or custom-role grants. A QC/Manager (or
  // equivalent explicitly configured reviewer) wins when that person has both.
  const restricted = channel.key === "trial-feedback" && p.has("chat.trial_feedback.restricted") && !p.has("chat.trial_feedback.review");
  const grants = [
    ...channel.roleGrants.filter((g) => viewer.roleIds.has(g.roleId)),
    ...channel.personGrants.filter((g) => g.assignmentId === assignment?.id),
  ];
  const canView = inArea && !restricted && (!archived || p.has("chat.archives.view")) &&
    (p.has("chat.channels.all") || grants.some((g) => g.canView || g.canPost));
  const canPost = canView && !archived && p.has("chat.messages.send") &&
    (p.has("chat.channels.post_all") || grants.some((g) => g.canPost));
  return { canView, canPost, canManage: canView && !archived && p.has("chat.channels.manage"), archived };
}
async function openChannel(tx: Prisma.TransactionClient, userId: string, channelId: string) {
  const viewer = await loadViewer(tx, userId);
  const channel = await tx.chatChannel.findUnique({ where: { id: channelId }, include: channelInclude });
  const access = channel && channelAccess(viewer, channel);
  // Hidden and nonexistent channels have an identical response; IDs reveal no directory.
  if (channel) {
    if (!access?.canView) throw new ChatError(404, "Channel not found.");
    return { viewer, channel, access, scope: { channelId } as Prisma.ChatMessageWhereInput, conversation: null };
  }
  const conversation = await tx.chatStandingConversation.findUnique({ where: { id: channelId }, include: standingInclude });
  const privateAccess = conversation && standingAccess(viewer, conversation);
  if (!conversation || !privateAccess?.canView) throw new ChatError(404, "Channel not found.");
  return { viewer, channel: null, access: privateAccess, scope: { conversationId: channelId } as Prisma.ChatMessageWhereInput, conversation };
}

const standingInclude = { model: { include: { chatArea: true } }, subjectUser: { include: viewerInclude } } satisfies Prisma.ChatStandingConversationInclude;
type StandingConversation = Prisma.ChatStandingConversationGetPayload<{ include: typeof standingInclude }>;
function standingAccess(viewer: Viewer, conversation: StandingConversation) {
  const p = viewer.permissions;
  const subject = conversation.subjectUser ? makeViewer(conversation.subjectUser) : null;
  const assigned = viewer.user.modelAssignments.some((a) => a.modelId === conversation.modelId);
  const subjectPermission = conversation.kind === "STAFF" ? "chat.private.staff" : conversation.kind === "CREATOR" ? "chat.private.creator" : conversation.kind === "ACCOUNTANT" ? "chat.private.accountant" : "chat.private.general";
  const currentSubject = subject?.permissions.has("chat.access") && subject.permissions.has(subjectPermission);
  const currentAssignment = conversation.kind !== "STAFF" || !!subject?.user.modelAssignments.some((a) => a.id === conversation.assignmentId && a.modelId === conversation.modelId);
  const currentCreator = conversation.kind !== "CREATOR" || conversation.model?.creatorUserId === conversation.subjectUserId;
  const legacyCreator = conversation.kind === "CREATOR" && !conversation.subjectUserId && !conversation.model?.creatorUserId;
  const archived = !!conversation.archivedAt || !!conversation.model?.chatArea?.archivedAt || !currentAssignment || !currentCreator || (!currentSubject && !legacyCreator);
  const general = conversation.kind === "GENERAL_STAFF";
  const oversight = general ? p.has("chat.private.general.review") : p.has("chat.private.all");
  const isSubject = viewer.user.id === conversation.subjectUserId && !!currentSubject;
  const reviewer = assigned && ((conversation.kind === "STAFF" && p.has("chat.private.staff.review")) || (conversation.kind === "CREATOR" && p.has("chat.private.creator.review")));
  const canView = p.has("chat.access") && (archived ? oversight && p.has("chat.archives.view") : oversight || isSubject || reviewer);
  return { canView, canPost: canView && !archived && p.has("chat.messages.send"), canManage: false, archived };
}
function audit(tx: Prisma.TransactionClient, viewer: Viewer, action: string, targetId: string, metadata: Prisma.InputJsonObject) {
  return tx.auditEvent.create({ data: {
    action, success: true, statusCode: 200, actorUserId: viewer.user.id, actorLabel: viewer.user.name,
    targetType: "chat", targetId, metadata,
  } });
}
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅"] as const;
const messageInclude = {
  replyTo: { select: { id: true, authorName: true, text: true, version: true, createdAt: true, deletedAt: true } },
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.ChatMessageInclude;
type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;
function visibleMessages(viewer: Viewer): Prisma.ChatMessageWhereInput { return viewer.isOwner ? {} : { deletedAt: null }; }
function messageDto(message: MessageRow, viewer: Viewer, canPost: boolean, archived: boolean) {
  if (message.deletedAt && !viewer.isOwner) throw new ChatError(404, "Message not found.");
  const active = !message.deletedAt;
  const parent = message.replyTo && (!message.replyTo.deletedAt || viewer.isOwner) ? message.replyTo : null;
  return {
    id: message.id, authorUserId: message.authorUserId, authorName: message.authorName,
    text: message.text, version: message.version, createdAt: message.createdAt, updatedAt: message.updatedAt,
    replyTo: parent ? { id: parent.id, authorName: parent.authorName, text: parent.text, version: parent.version, createdAt: parent.createdAt, deleted: !!parent.deletedAt } : null,
    replyUnavailable: !!message.replyTo && !parent,
    deleted: message.deletedAt ? { at: message.deletedAt, by: message.deletedByName, reason: message.deletionReason } : null,
    canModerate: active && !archived && viewer.permissions.has("chat.messages.moderate"),
    canViewHistory: viewer.isOwner,
    pinnedAt: message.pinnedAt, pinnedByName: message.pinnedByName, pinVersion: message.pinVersion,
    canReply: active && canPost,
    canPin: active && canPost && viewer.permissions.has("chat.messages.pin"),
    reactions: CHAT_REACTIONS.flatMap((emoji) => {
      const entries = message.reactions.filter((r) => r.emoji === emoji);
      return entries.length ? [{ emoji, count: entries.length, mine: entries.some((r) => r.userId === viewer.user.id) }] : [];
    }),
    canEdit: active && canPost && message.authorUserId === viewer.user.id && viewer.permissions.has("chat.messages.edit_own"),
  };
}

async function accessibleChatAreas(tx: Prisma.TransactionClient, viewer: Viewer) {
    const userId = viewer.user.id;
    const areas = await tx.chatArea.findMany({
      where: viewer.permissions.has("chat.areas.all") ? {} : { modelId: { in: viewer.user.modelAssignments.map((a) => a.modelId) } },
      include: { model: { select: { name: true } }, channels: { include: channelInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }] } },
      orderBy: { model: { name: "asc" } },
    });
    const result = areas.map((area) => {
      const channels = area.channels.flatMap((channel) => {
        const access = channelAccess(viewer, channel);
        return access.canView ? [{ id: channel.id, name: channel.name, isPrivate: false, ...access }] : [];
      });
      const inArea = viewer.permissions.has("chat.ordinary.access") && (viewer.permissions.has("chat.areas.all") || viewer.user.modelAssignments.some((a) => a.modelId === area.modelId));
      return { modelId: area.modelId, name: area.model.name, archived: !!area.archivedAt, canManage: inArea && !area.archivedAt && viewer.permissions.has("chat.channels.manage"), channels };
    });
    const standing = await tx.chatStandingConversation.findMany({ where: { OR: [
      { subjectUserId: userId }, { modelId: { in: viewer.user.modelAssignments.map((a) => a.modelId) } },
      ...(viewer.permissions.has("chat.private.all") ? [{ kind: { not: "GENERAL_STAFF" as const } }] : []),
      ...(viewer.permissions.has("chat.private.general.review") ? [{ kind: "GENERAL_STAFF" as const }] : []),
    ] }, include: standingInclude, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const conversation of standing) {
      const access = standingAccess(viewer, conversation);
      if (!access.canView) continue;
      const areaId = conversation.modelId ?? "personal";
      let area = result.find((a) => a.modelId === areaId);
      if (!area) { area = { modelId: areaId, name: conversation.model?.name ?? "Private workspace", archived: !!conversation.model?.chatArea?.archivedAt, canManage: false, channels: [] }; result.push(area); }
      const name = conversation.kind === "CREATOR" ? `${conversation.model?.name ?? conversation.subjectName} · Private` : conversation.subjectUserId === userId ? "Your private chat" : `${conversation.subjectUser?.name ?? conversation.subjectName} · Private`;
      area.channels.push({ id: conversation.id, name, isPrivate: true, ...access });
    }
    return result.filter((area) => area.channels.length || area.canManage);
}
export async function listChatAreas(userId: string) {
  return prisma.$transaction(async (tx) => accessibleChatAreas(tx, await loadViewer(tx, userId)));
}

export async function listChatMessages(userId: string, channelId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    const cursor = before ? await tx.chatMessage.findFirst({ where: { id: before, ...scope, ...visibleMessages(viewer) }, select: { id: true, createdAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The message cursor is invalid.");
    const rows = await tx.chatMessage.findMany({ where: {
      ...scope,
      ...visibleMessages(viewer),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, include: messageInclude });
    const hasMore = rows.length > 50;
    const messages = rows.slice(0, 50).reverse().map((m) => messageDto(m, viewer, access.canPost, access.archived));
    return { messages, canPost: access.canPost, canViewDeleted: viewer.isOwner, canPin: access.canPost && viewer.permissions.has("chat.messages.pin"), hasMore, nextBefore: hasMore ? messages[0].id : null };
  });
}

export async function sendChatMessage(userId: string, channelId: string, text: string, clientNonce: string, replyToId?: string) {
  const normalized = text.trim();
  if (!normalized || normalized.length > 8000 || !/^[\w-]{8,80}$/.test(clientNonce)) throw new ChatError(400, "Use 1–8,000 characters and a valid message reference.");
  return prisma.$transaction(async (tx) => {
    const { viewer, access, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost) throw new ChatError(403, "This channel is read-only for you.");
    const target = channel ? { channelId } : { conversationId: channelId };
    if (replyToId) {
      await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${replyToId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR SHARE`;
      if (!await tx.chatMessage.findFirst({ where: { id: replyToId, ...target, deletedAt: null }, select: { id: true } })) throw new ChatError(404, "Reply message not found in this conversation.");
    }
    const created = await tx.chatMessage.createMany({ data: { ...target, authorUserId: userId, authorName: viewer.user.name, text: normalized, clientNonce, replyToId: replyToId ?? null }, skipDuplicates: true });
    const message = await tx.chatMessage.findFirstOrThrow({ where: { ...target, authorUserId: userId, clientNonce }, include: messageInclude });
    if (message.deletedAt) throw new ChatError(409, "This message reference is no longer available. Send a new message instead.");
    if (message.text !== normalized || message.replyToId !== (replyToId ?? null)) throw new ChatError(409, "This message reference was already used. Refresh before sending again.");
    if (created.count) await audit(tx, viewer, "chat.message.send", message.id, { channelId, channelName: channel?.name ?? `${conversation?.subjectName} · Private`, text: message.text, replyToId: message.replyToId });
    return messageDto(message, viewer, access.canPost, access.archived);
  });
}

export async function editChatMessage(userId: string, channelId: string, messageId: string, text: string, version: number) {
  const normalized = text.trim();
  if (!normalized || normalized.length > 8000 || !Number.isInteger(version) || version < 1) throw new ChatError(400, "Use 1–8,000 characters and a valid message version.");
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost || !viewer.permissions.has("chat.messages.edit_own")) throw new ChatError(403, "You cannot edit messages here.");
    const previous = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null } });
    if (!previous) throw new ChatError(404, "Message not found.");
    if (previous.authorUserId !== userId) throw new ChatError(403, "You can only edit your own messages.");
    if (previous.version !== version) throw new ChatError(409, "This message changed. Refresh before editing again.");
    const updated = await tx.chatMessage.updateMany({ where: { id: messageId, version, ...scope, deletedAt: null }, data: { text: normalized, version: { increment: 1 } } });
    if (!updated.count) throw new ChatError(409, "This message changed. Refresh before editing again.");
    await audit(tx, viewer, "chat.message.edit", messageId, { channelId, channelName: channel?.name ?? `${conversation?.subjectName} · Private`, before: previous.text, after: normalized, version: version + 1 });
    return messageDto(await tx.chatMessage.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude }), viewer, true, access.archived);
  });
}

export async function listChatMembers(userId: string, channelId: string) {
  return prisma.$transaction(async (tx) => {
    const { channel, conversation } = await openChannel(tx, userId, channelId);
    const modelId = channel?.modelId ?? conversation?.modelId;
    const people = await tx.user.findMany({ where: { status: "ACTIVE", OR: [
      ...(modelId ? [{ modelAssignments: { some: { modelId } } }] : []),
      ...(conversation?.subjectUserId ? [{ id: conversation.subjectUserId }] : []),
      { roleMemberships: { some: { role: { archivedAt: null, rolePermissions: { some: { permission: { key: "chat.areas.all" } } } } } } },
      { roleMemberships: { some: { role: { archivedAt: null, rolePermissions: { some: { permission: { key: { in: ["chat.private.all", "chat.private.general.review"] } } } } } } } },
      { roleMemberships: { some: { role: { systemKey: "OWNER", archivedAt: null } } } },
    ] }, include: viewerInclude, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return people.flatMap((user) => {
      const access = channel ? channelAccess(makeViewer(user), channel) : standingAccess(makeViewer(user), conversation!);
      return access.canView ? [{ id: user.id, name: user.name, canPost: access.canPost }] : [];
    });
  });
}

export async function setChatGrant(userId: string, channelId: string, input: { roleId?: string; personId?: string; canView: boolean; canPost: boolean }) {
  if (!!input.roleId === !!input.personId) throw new ChatError(400, "Choose one role or person.");
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, access } = await openChannel(tx, userId, channelId);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats have fixed membership; ordinary channels require channel management access.");
    const data = { canView: input.canView || input.canPost, canPost: input.canPost };
    let beforeGrant: { canView: boolean; canPost: boolean } | null = null;
    let recipientName = "";
    if (input.roleId) {
      const role = await tx.role.findFirst({ where: { id: input.roleId, archivedAt: null } });
      if (!role) throw new ChatError(404, "Role not found.");
      beforeGrant = await tx.chatRoleGrant.findUnique({ where: { channelId_roleId: { channelId, roleId: role.id } } });
      recipientName = role.name;
      await tx.chatRoleGrant.upsert({ where: { channelId_roleId: { channelId, roleId: role.id } }, create: { channelId, roleId: role.id, ...data }, update: data });
    } else {
      if (input.personId === userId) throw new ChatError(403, "You cannot add yourself to a channel.");
      const assignment = await tx.userModelAssignment.findFirst({ where: { userId: input.personId, modelId: channel.modelId, user: { status: "ACTIVE" } }, include: { user: { select: { name: true } } } });
      if (!assignment) throw new ChatError(404, "That person is not currently assigned to this creator.");
      beforeGrant = await tx.chatPersonGrant.findUnique({ where: { channelId_assignmentId: { channelId, assignmentId: assignment.id } } });
      recipientName = assignment.user.name;
      await tx.chatPersonGrant.upsert({ where: { channelId_assignmentId: { channelId, assignmentId: assignment.id } }, create: { channelId, assignmentId: assignment.id, ...data }, update: data });
    }
    await audit(tx, viewer, "chat.channel.grant", channelId, { ...input, channelName: channel.name, recipientName, beforeGrant: beforeGrant ? { canView: beforeGrant.canView, canPost: beforeGrant.canPost } : null, afterGrant: data });
  });
}

export async function chatGrantOptions(userId: string, channelId: string) {
  return prisma.$transaction(async (tx) => {
    const { channel, access } = await openChannel(tx, userId, channelId);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats have fixed membership; ordinary channels require channel management access.");
    const [roles, assignments] = await Promise.all([
      tx.role.findMany({ where: { archivedAt: null }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      tx.userModelAssignment.findMany({ where: { modelId: channel.modelId, user: { status: "ACTIVE", id: { not: userId } } }, select: { id: true, user: { select: { id: true, name: true } } }, orderBy: { user: { name: "asc" } } }),
    ]);
    return {
      roles: roles.map((role) => ({ ...role, grant: channel.roleGrants.find((g) => g.roleId === role.id) ?? null })),
      people: assignments.map((a) => ({ ...a.user, grant: channel.personGrants.find((g) => g.assignmentId === a.id) ?? null })),
    };
  });
}

export async function createChatChannel(userId: string, modelId: string, name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 80) throw new ChatError(400, "Use a channel name between 1 and 80 characters.");
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    const inArea = viewer.permissions.has("chat.areas.all") || viewer.user.modelAssignments.some((a) => a.modelId === modelId);
    if (!inArea || !viewer.permissions.has("chat.ordinary.access")) throw new ChatError(404, "Creator chat area not found.");
    if (!viewer.permissions.has("chat.channels.manage")) throw new ChatError(403, "Channel management access is required.");
    const area = await tx.chatArea.findUnique({ where: { modelId } });
    if (!area) throw new ChatError(404, "Creator chat area not found.");
    if (area.archivedAt) throw new ChatError(403, "Archived creator areas are read-only.");
    const duplicate = await tx.chatChannel.findFirst({ where: { modelId, name: { equals: normalized, mode: "insensitive" } } });
    if (duplicate) throw new ChatError(409, "A channel with this name already exists in this creator area.");
    const last = await tx.chatChannel.aggregate({ where: { modelId }, _max: { sortOrder: true } });
    const created = await tx.chatChannel.create({ data: { modelId, key: `custom-${randomUUID()}`, name: normalized, sortOrder: (last._max.sortOrder ?? -1) + 1 } });
    await audit(tx, viewer, "chat.channel.create", created.id, { modelId, channelName: normalized, name: normalized });
    return { id: created.id, name: created.name };
  });
}

export async function renameChatChannel(userId: string, channelId: string, name: string) {
  const normalized = name.trim();
  if (!normalized || normalized.length > 80) throw new ChatError(400, "Use a channel name between 1 and 80 characters.");
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, access } = await openChannel(tx, userId, channelId);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats cannot be renamed; ordinary channels require management access.");
    const duplicate = await tx.chatChannel.findFirst({ where: { modelId: channel.modelId, id: { not: channelId }, name: { equals: normalized, mode: "insensitive" } } });
    if (duplicate) throw new ChatError(409, "A channel with this name already exists in this creator area.");
    await tx.chatChannel.update({ where: { id: channelId }, data: { name: normalized } });
    await audit(tx, viewer, "chat.channel.rename", channelId, { channelName: normalized, before: channel.name, after: normalized });
  });
}

export async function getChatMessage(userId: string, channelId: string, messageId: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    const message = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, ...visibleMessages(viewer) }, include: messageInclude });
    if (!message) throw new ChatError(404, "Message not found.");
    return messageDto(message, viewer, access.canPost, access.archived);
  });
}

/** Refresh a bounded page of previously loaded history, including edits to reply
 * previews, reactions and pins. The caller never supplies an authorization scope. */
export async function refreshChatMessages(userId: string, channelId: string, ids: string[]) {
  if (!ids.length || ids.length > 100 || ids.some((id) => !id || id.length > 100)) throw new ChatError(400, "Refresh up to 100 message references at a time.");
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    const rows = await tx.chatMessage.findMany({ where: { ...scope, ...visibleMessages(viewer), id: { in: ids } }, include: messageInclude });
    return { messages: rows.map((m) => messageDto(m, viewer, access.canPost, access.archived)) };
  });
}

export async function setChatReaction(userId: string, channelId: string, messageId: string, emoji: string, active: boolean) {
  if (!(CHAT_REACTIONS as readonly string[]).includes(emoji) || typeof active !== "boolean") throw new ChatError(400, "Choose one of the supported reactions.");
  return prisma.$transaction(async (tx) => {
    // The message lock serializes add/remove and pin decisions; counters and
    // transactional audit describe the state actually committed.
    await openChannel(tx, userId, channelId);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost) throw new ChatError(403, "This conversation is read-only for you.");
    if (!await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null }, select: { id: true } })) throw new ChatError(404, "Message not found.");
    const key = { messageId, userId, emoji };
    const changed = active
      ? await tx.chatReaction.createMany({ data: key, skipDuplicates: true })
      : await tx.chatReaction.deleteMany({ where: key });
    if (changed.count) await audit(tx, viewer, active ? "chat.reaction.add" : "chat.reaction.remove", messageId, {
      channelId, channelName: channel?.name ?? (conversation?.subjectName + " · Private"), emoji,
    });
    // No notification, email or push is scheduled for reactions.
    return messageDto(await tx.chatMessage.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude }), viewer, access.canPost, access.archived);
  });
}

export async function setChatPin(userId: string, channelId: string, messageId: string, pinned: boolean, expectedVersion: number) {
  if (typeof pinned !== "boolean" || !Number.isInteger(expectedVersion) || expectedVersion < 0) throw new ChatError(400, "Refresh the message before updating its pin.");
  return prisma.$transaction(async (tx) => {
    await openChannel(tx, userId, channelId);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost || !viewer.permissions.has("chat.messages.pin")) throw new ChatError(403, "Your access does not allow managing pins here.");
    const message = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null }, include: messageInclude });
    if (!message) throw new ChatError(404, "Message not found.");
    if (!!message.pinnedAt === pinned) return messageDto(message, viewer, access.canPost, access.archived);
    if (message.pinVersion !== expectedVersion) throw new ChatError(409, "The pin changed. Refresh before trying again.");
    const updated = await tx.chatMessage.update({ where: { id: messageId }, data: {
      pinnedAt: pinned ? new Date() : null, pinnedById: pinned ? userId : null,
      pinnedByName: pinned ? viewer.user.name : null, pinVersion: { increment: 1 },
    }, include: messageInclude });
    await audit(tx, viewer, pinned ? "chat.message.pin" : "chat.message.unpin", messageId, {
      channelId, channelName: channel?.name ?? (conversation?.subjectName + " · Private"), text: message.text,
      pinVersion: updated.pinVersion,
    });
    return messageDto(updated, viewer, access.canPost, access.archived);
  });
}

export async function listChatPins(userId: string, channelId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    const audience = { ...scope, deletedAt: null, pinnedAt: { not: null } } satisfies Prisma.ChatMessageWhereInput;
    const cursor = before ? await tx.chatMessage.findFirst({ where: { ...audience, id: before }, select: { id: true, pinnedAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The pin cursor is invalid. Refresh the pinned messages.");
    const rows = await tx.chatMessage.findMany({ where: { AND: [audience, ...(cursor ? [{ OR: [
      { pinnedAt: { lt: cursor.pinnedAt! } }, { pinnedAt: cursor.pinnedAt, id: { lt: cursor.id } },
    ] }] : [])] }, orderBy: [{ pinnedAt: "desc" }, { id: "desc" }], take: 26, include: messageInclude });
    return { messages: rows.slice(0, 25).map((m) => messageDto(m, viewer, access.canPost, access.archived)), hasMore: rows.length > 25, nextBefore: rows.length > 25 ? rows[24].id : null };
  });
}

export async function searchChatMessages(userId: string, query: string, channelId?: string, before?: string) {
  const q = query.trim();
  if (q.length < 2 || q.length > 120) throw new ChatError(400, "Search using 2–120 characters.");
  return prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL statement_timeout = '5000ms'`;
    const viewer = await loadViewer(tx, userId);
    const areas = await accessibleChatAreas(tx, viewer);
    const allowed = areas.flatMap((area) => area.channels.map((channel) => ({ ...channel, areaName: area.name })));
    const selected = channelId ? allowed.filter((c) => c.id === channelId) : allowed;
    if (channelId && !selected.length) throw new ChatError(404, "Channel not found.");
    if (!selected.length) return { results: [], hasMore: false, nextBefore: null };
    const byId = new Map(selected.map((c) => [c.id, c]));
    // Escape LIKE syntax: %, _ and backslash are literal search characters.
    const literal = q.replace(/[\\%_]/g, (character) => "\\" + character);
    const audience: Prisma.ChatMessageWhereInput = { ...visibleMessages(viewer), text: { contains: literal, mode: "insensitive" }, OR: [
      { channelId: { in: selected.filter((c) => !c.isPrivate).map((c) => c.id) } },
      { conversationId: { in: selected.filter((c) => c.isPrivate).map((c) => c.id) } },
    ] };
    const cursor = before ? await tx.chatMessage.findFirst({ where: { AND: [audience, { id: before }] }, select: { id: true, createdAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The search cursor is invalid. Search again with your current access.");
    const rows = await tx.chatMessage.findMany({ where: { AND: [audience, ...(cursor ? [{ OR: [
      { createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } },
    ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 26, include: messageInclude });
    return { results: rows.slice(0, 25).map((m) => {
      const place = byId.get(m.channelId ?? m.conversationId!)!;
      return { channelId: place.id, channelName: place.name, areaName: place.areaName, isPrivate: place.isPrivate, message: messageDto(m, viewer, place.canPost, place.archived) };
    }), hasMore: rows.length > 25, nextBefore: rows.length > 25 ? rows[24].id : null };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 10_000 });
}

export async function installChatInteractionDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942120)`;
  if (await tx.chatSetup.findUnique({ where: { id: "chat-interactions-v1" } })) return false;
  const definition = CHAT_PERMISSION_DEFINITIONS.find((p) => p.key === "chat.messages.pin")!;
  const { requires: _requires, ...data } = definition;
  const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
  const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: ["OWNER", "OPS_MANAGER", "MANAGER"] } } });
  await tx.rolePermission.createMany({ data: roles.map((r) => ({ roleId: r.id, permissionId: permission.id })), skipDuplicates: true });
  await tx.chatSetup.create({ data: { id: "chat-interactions-v1" } });
  await tx.auditEvent.create({ data: { action: "chat.interaction_defaults.install", success: true, statusCode: 200, targetType: "chat", metadata: { version: 1 } } });
  return true;
}

export async function deleteChatMessage(userId: string, channelId: string, messageId: string, version: number, reason: string) {
  const normalized = reason.trim();
  if (!normalized || normalized.length > 1000 || !Number.isInteger(version) || version < 1) throw new ChatError(400, "Give a reason of 1–1,000 characters and refresh the message before deleting it.");
  return prisma.$transaction(async (tx) => {
    await openChannel(tx, userId, channelId);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (access.archived || !viewer.permissions.has("chat.messages.moderate")) throw new ChatError(403, "Your access does not allow deleting messages here.");
    const previous = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope }, include: messageInclude });
    if (!previous) throw new ChatError(404, "Message not found.");
    // Desired-state retries return no retained content to a non-Owner, even
    // when that person is the original moderator or author.
    if (previous.deletedAt) return { id: messageId, message: viewer.isOwner ? messageDto(previous, viewer, false, access.archived) : null };
    if (previous.version !== version) throw new ChatError(409, "This message was edited. Review the latest text before deleting it.");
    const updated = await tx.chatMessage.update({ where: { id: messageId }, data: {
      deletedAt: new Date(), deletedById: userId, deletedByName: viewer.user.name, deletionReason: normalized,
      pinnedAt: null, pinnedById: null, pinnedByName: null,
      ...(previous.pinnedAt ? { pinVersion: { increment: 1 } } : {}),
    }, include: messageInclude });
    await audit(tx, viewer, "chat.message.delete", messageId, {
      channelId, channelName: channel?.name ?? `${conversation?.subjectName} · Private`,
      text: previous.text, version: previous.version, authorName: previous.authorName,
      authorUserId: previous.authorUserId, createdAt: previous.createdAt.toISOString(), replyToId: previous.replyToId,
      reason: normalized, deletedAt: updated.deletedAt!.toISOString(),
      previousPin: previous.pinnedAt ? { at: previous.pinnedAt.toISOString(), by: previous.pinnedByName, version: previous.pinVersion } : null,
      reactions: previous.reactions,
    });
    return { id: messageId, message: viewer.isOwner ? messageDto(updated, viewer, false, access.archived) : null };
  });
}

export async function listDeletedChatMessages(userId: string, channelId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained deleted messages.");
    const audience: Prisma.ChatMessageWhereInput = { ...scope, deletedAt: { not: null } };
    const cursor = before ? await tx.chatMessage.findFirst({ where: { ...audience, id: before }, select: { id: true, deletedAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The history cursor is invalid. Refresh deleted messages.");
    const rows = await tx.chatMessage.findMany({ where: { AND: [audience, ...(cursor ? [{ OR: [
      { deletedAt: { lt: cursor.deletedAt! } }, { deletedAt: cursor.deletedAt, id: { lt: cursor.id } },
    ] }] : [])] }, orderBy: [{ deletedAt: "desc" }, { id: "desc" }], take: 26, include: messageInclude });
    return { messages: rows.slice(0, 25).map((m) => messageDto(m, viewer, false, access.archived)), nextBefore: rows.length > 25 ? rows[24].id : null };
  });
}

export async function getChatMessageHistory(userId: string, channelId: string, messageId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, scope } = await openChannel(tx, userId, channelId);
    if (!viewer.isOwner) throw new ChatError(403, "Only Owners can view retained message history.");
    if (!await tx.chatMessage.findFirst({ where: { ...scope, id: messageId }, select: { id: true } })) throw new ChatError(404, "Message not found.");
    const audience = { targetType: "chat", targetId: messageId, success: true, action: { in: ["chat.message.send", "chat.message.edit", "chat.message.delete"] } } satisfies Prisma.AuditEventWhereInput;
    const cursor = before ? await tx.auditEvent.findFirst({ where: { ...audience, id: before }, select: { id: true, occurredAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The history cursor is invalid. Refresh the message history.");
    const events = await tx.auditEvent.findMany({ where: { AND: [audience, ...(cursor ? [{ OR: [
      { occurredAt: { lt: cursor.occurredAt } }, { occurredAt: cursor.occurredAt, id: { lt: cursor.id } },
    ] }] : [])] }, orderBy: [{ occurredAt: "desc" }, { id: "desc" }], take: 26 });
    return { events: events.slice(0, 25).map((event) => {
      const m = event.metadata && typeof event.metadata === "object" && !Array.isArray(event.metadata) ? event.metadata : {};
      const text = (key: string) => typeof m[key] === "string" ? m[key] as string : null;
      return { id: event.id, action: event.action, actorName: event.actorLabel ?? "Former account", occurredAt: event.occurredAt,
        beforeText: event.action === "chat.message.edit" ? text("before") : event.action === "chat.message.delete" ? text("text") : null,
        afterText: event.action === "chat.message.send" ? text("text") : event.action === "chat.message.edit" ? text("after") : null,
        reason: event.action === "chat.message.delete" ? text("reason") : null };
    }), nextBefore: events.length > 25 ? events[24].id : null };
  });
}

export async function installChatModerationDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942121)`;
  if (await tx.chatSetup.findUnique({ where: { id: "chat-moderation-v1" } })) return false;
  const definition = CHAT_PERMISSION_DEFINITIONS.find((p) => p.key === "chat.messages.moderate")!;
  const { requires: _requires, ...data } = definition;
  const permission = await tx.permission.upsert({ where: { key: data.key }, create: data, update: {} });
  const roles = await tx.role.findMany({ where: { archivedAt: null, systemKey: { in: ["OWNER", "OPS_MANAGER", "MANAGER"] } } });
  await tx.rolePermission.createMany({ data: roles.map((role) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  await tx.chatSetup.create({ data: { id: "chat-moderation-v1" } });
  await tx.auditEvent.create({ data: { action: "chat.moderation_defaults.install", success: true, statusCode: 200, targetType: "chat", metadata: { version: 1 } } });
  return true;
}
