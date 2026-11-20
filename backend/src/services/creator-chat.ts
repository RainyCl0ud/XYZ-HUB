import { CHAT_EMOJI_SUPPORTED } from "./chat-emoji-library.js";
import { Prisma } from "@prisma/client";
import { createHash, randomUUID } from "node:crypto";
import { open, type FileHandle } from "node:fs/promises";
import { join } from "node:path";
import { prisma } from "../lib/prisma.js";
import { CHAT_ROLE_DEFAULTS, CHAT_PERMISSION_DEFINITIONS } from "../permissions/chat-permissions.js";
import { syncCreatorStandingChat, syncUserStandingChats } from "./standing-chat.js";
import { canPreviewChatImage, chatAttachmentDirectory } from "./chat-attachment-policy.js";
import { chatChannelArchiveEnabled, chatChannelCleanupEnabled, chatChannelExportEnabled } from "./chat-archive-policy.js";
import { getHighestRank, OWNER_ONLY_ROLE_KEYS } from "./access-control.js";

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
  creatorProfile: { select: { id: true, isActive: true } },
  chatQuarantines: { where: { active: true } },
  roleMemberships: { where: { role: { archivedAt: null } }, include: { role: { include: { rolePermissions: { include: { permission: true } } } } } },
} satisfies Prisma.UserInclude;
type ViewerUser = Prisma.UserGetPayload<{ include: typeof viewerInclude }>;
function makeViewer(user: ViewerUser) {
  const permissions = new Set(user.roleMemberships.flatMap(({ role }) => role.rolePermissions.map(({ permission }) => permission.key)));
  const isOwner = user.roleMemberships.some(({ role }) => role.systemKey === "OWNER");
  const isDeveloper = user.roleMemberships.some(({ role }) => role.systemKey === "DEV");
  // General Staff privacy is an Owner-only system boundary, matching the
  // existing Owner-only access controls. Stale/custom grants cannot widen it.
  permissions.delete("chat.private.general.review");
  if (isOwner) permissions.add("chat.private.general.review");
  // Block 2 section 6: a Model can see only her own protected creator
  // conversation. Saved ordinary/oversight grants never bypass this boundary.
  const isModel = user.roleMemberships.some(({ role }) => role.systemKey === "MODEL");
  const ownCreatorId = isModel && user.creatorProfile?.isActive ? user.creatorProfile.id : null;
  return { user, permissions, isOwner, isDeveloper, isModel, ownCreatorId, roleIds: new Set(user.roleMemberships.map(({ role }) => role.id)) };
}
type Viewer = ReturnType<typeof makeViewer>;
// Channel grants follow the management chain of command. Owners keep full
// control (except over Owner access, which is automatic). Everyone else may
// only change access for roles ranked strictly below their own highest rank,
// never for protected system roles, never for a role they hold themselves,
// and named grants only for people whose every role is ranked below theirs.
type GrantRole = { id: string; systemKey: string | null; rank: number | null };
function roleRankedBelowViewer(viewer: Viewer, role: GrantRole) {
  if (role.systemKey && OWNER_ONLY_ROLE_KEYS.has(role.systemKey)) return false;
  const viewerRank = getHighestRank(viewer.user.roleMemberships.map(({ role: held }) => held));
  return viewerRank !== null && role.rank !== null && role.rank > viewerRank;
}
function canGrantToRole(viewer: Viewer, role: GrantRole) {
  if (role.systemKey === "OWNER") return false;
  if (viewer.isOwner) return true;
  return !viewer.roleIds.has(role.id) && roleRankedBelowViewer(viewer, role);
}
function canGrantToPerson(viewer: Viewer, roles: readonly GrantRole[]) {
  if (roles.some((role) => role.systemKey === "OWNER")) return false;
  if (viewer.isOwner) return true;
  return roles.length > 0 && roles.every((role) => roleRankedBelowViewer(viewer, role));
}
// The Model one-chat rule is a hard privacy boundary, not a default that
// can be widened via Role Settings, direct channel IDs or named grants.
function inOrdinaryArea(viewer: Viewer, modelId: string) {
  return !viewer.isModel
    && !viewer.user.chatQuarantines.some((q) => q.modelId === modelId)
    && viewer.permissions.has("chat.access")
    && viewer.permissions.has("chat.ordinary.access")
    && (viewer.permissions.has("chat.areas.all")
      || viewer.user.modelAssignments.some((a) => a.modelId === modelId));
}
// Shared current-access decisions for announcement delivery. These helpers
// never grant membership or revive an archived assignment episode.
export { viewerInclude, makeViewer, loadViewer, channelInclude, channelAccess, standingInclude, standingAccess };
async function loadViewer(tx: Prisma.TransactionClient, userId: string) {
  // Pausing takes this same person's exclusive lock. In-flight reads/writes
  // finish first; after the pause commits every new Chat request rechecks it.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'chat-access:' + userId}, 0))`;
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
  const inArea = inOrdinaryArea(viewer, channel.modelId);
  const archived = !!channel.cleanedUpAt || !!channel.archivedAt || !!channel.area.archivedAt;
  // A Chatter restriction beats named or custom-role grants. A QC/Manager (or
  // equivalent explicitly configured reviewer) wins when that person has both.
  const restricted = channel.key === "trial-feedback" && p.has("chat.trial_feedback.restricted") && !p.has("chat.trial_feedback.review");
  const grants = [
    ...channel.roleGrants.filter((g) => viewer.roleIds.has(g.roleId)),
    ...channel.personGrants.filter((g) => g.assignmentId === assignment?.id),
  ];
  const canView = inArea && !restricted && (!archived || p.has("chat.archives.view"))
    && (!channel.archivedAt || viewer.isOwner || viewer.isDeveloper)
    && (!channel.cleanedUpAt || viewer.isOwner) &&
    (p.has("chat.channels.all") || grants.some((g) => g.canView || g.canPost));
  const canPost = canView && !archived && p.has("chat.messages.send") &&
    (p.has("chat.channels.post_all") || grants.some((g) => g.canPost));
  return { canView, canPost, canManage: canView && !archived && p.has("chat.channels.manage"), archived };
}
async function openChannel(tx: Prisma.TransactionClient, userId: string, channelId: string, writing = false) {
  const viewer = await loadViewer(tx, userId);
  // An archive waits for in-flight edits and sends. New writers check access
  // after the archive commits, including uploads that started before it.
  if (writing) await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${"chat-channel:" + channelId}, 0))`;
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
  // A pause keeps only this person's own current staff-management chat in the
  // affected area. Their reviewer access to other staff/creator chats pauses too.
  const paused = viewer.user.chatQuarantines.some((q) => q.modelId === conversation.modelId);
  const pauseAllows = !paused || (conversation.kind === "STAFF" && isSubject && !archived);
  // Even extra saved oversight permissions cannot expose another person's
  // protected chat to a Model or produce an unintended second conversation.
  const modelPrivateOnly = !viewer.isModel || (
    conversation.kind === "CREATOR" && conversation.modelId === viewer.ownCreatorId && isSubject
  );
  const canView = modelPrivateOnly && pauseAllows && p.has("chat.access") && (archived ? oversight && p.has("chat.archives.view") : oversight || isSubject || reviewer);
  return { canView, canPost: canView && !archived && p.has("chat.messages.send"), canManage: false, archived };
}
function audit(tx: Prisma.TransactionClient, viewer: Viewer, action: string, targetId: string, metadata: Prisma.InputJsonObject) {
  return tx.auditEvent.create({ data: {
    action, success: true, statusCode: 200, actorUserId: viewer.user.id, actorLabel: viewer.user.name,
    targetType: "chat", targetId, metadata,
  } });
}

function canArchiveChannel(viewer: Viewer, channel: Channel, canManage: boolean) {
  return canManage && channel.key !== "updates" && chatChannelArchiveEnabled()
    && viewer.user.roleMemberships.some(({ role }) => ["OWNER", "OPS_MANAGER", "MANAGER"].includes(role.systemKey ?? ""));
}

async function completedChannelDownload(
  tx: Prisma.TransactionClient,
  userId: string,
  channelId: string,
  archivedAt: Date,
  downloadId?: string,
) {
  const event = await tx.auditEvent.findFirst({
    where: {
      id: downloadId, action: "chat.channel.export.download", targetType: "chat", targetId: channelId,
      actorUserId: userId, success: true, statusCode: 200, occurredAt: { gte: archivedAt },
    },
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    select: { id: true, metadata: true },
  });
  const metadata = event?.metadata;
  const fileName = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata.fileName : null;
  return event && typeof fileName === "string" && fileName.endsWith(".zip") ? { id: event.id, fileName } : null;
}

export async function archiveChatChannel(userId: string, channelId: string, expectedName: string) {
  if (!chatChannelArchiveEnabled()) throw new ChatError(404, "Channel archiving is unavailable.");
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"chat-channel:" + channelId}, 0))`;
    const channel = await tx.chatChannel.findUnique({ where: { id: channelId }, include: channelInclude });
    if (!channel || channel.cleanedUpAt) throw new ChatError(404, "Channel not found.");
    const access = channelAccess(viewer, { ...channel, archivedAt: null });
    if (!access.canView) throw new ChatError(404, "Channel not found.");
    if (!canArchiveChannel(viewer, channel, access.canManage)) throw new ChatError(403, "You cannot archive this channel.");
    if (channel.archivedAt && !channelAccess(viewer, channel).canView && !await tx.auditEvent.findFirst({
      where: { action: "chat.channel.archive", targetType: "chat", targetId: channelId, actorUserId: userId },
      select: { id: true },
    })) throw new ChatError(404, "Channel not found.");
    if (channel.name !== expectedName) throw new ChatError(409, "The channel name changed. Reopen Settings before archiving.");
    if (channel.archivedAt) return { archived: true };
    await tx.chatChannel.update({ where: { id: channelId }, data: { archivedAt: new Date() } });
    await audit(tx, viewer, "chat.channel.archive", channelId, { modelId: channel.modelId, channelName: channel.name });
    return { archived: true };
  });
}

export async function cleanUpChatChannel(userId: string, channelId: string, expectedName: string, downloadId: string) {
  if (!chatChannelCleanupEnabled()) throw new ChatError(404, "Channel cleanup is unavailable.");
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    if (!viewer.isOwner) throw new ChatError(403, "Only Owners can clean up archived channels.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${"chat-channel:" + channelId}, 0))`;
    const channel = await tx.chatChannel.findUnique({ where: { id: channelId }, include: channelInclude });
    if (!channel || !channelAccess(viewer, channel).canView) throw new ChatError(404, "Channel not found.");
    if (channel.key === "updates") throw new ChatError(403, "Updates is protected for staff announcements.");
    if (!channel.archivedAt) throw new ChatError(409, "Archive the channel before cleaning it up.");
    if (channel.name !== expectedName) throw new ChatError(409, "The channel name changed. Reopen the confirmation.");
    const download = await completedChannelDownload(tx, userId, channelId, channel.archivedAt, downloadId);
    if (!download) throw new ChatError(409, "Download and save this channel’s ZIP before cleaning it up.");
    if (channel.cleanedUpAt) return { cleanedUp: true };
    await tx.chatChannel.update({ where: { id: channelId }, data: { cleanedUpAt: new Date() } });
    await audit(tx, viewer, "chat.channel.cleanup", channelId, {
      modelId: channel.modelId, channelName: channel.name, downloadId: download.id, fileName: download.fileName,
    });
    return { cleanedUp: true };
  });
}
export async function listRetainedChatChannels(userId: string, before?: string) {
  return prisma.$transaction(async tx => {
    const viewer = await loadViewer(tx, userId);
    if (!viewer.isOwner) throw new ChatError(403, "Only Owners can open retained channels.");
    const rows = await tx.chatChannel.findMany({
      where: { cleanedUpAt: { not: null }, ...(before ? { id: { lt: before } } : {}) },
      select: { id: true, name: true, cleanedUpAt: true, area: { select: { model: { select: { name: true } } } } },
      orderBy: { id: "desc" }, take: 21,
    });
    return { channels: rows.slice(0, 20).map(row => ({ id: row.id, name: row.name, workspace: row.area.model.name, cleanedUpAt: row.cleanedUpAt })),
      nextBefore: rows.length > 20 ? rows[19].id : null };
  });
}
export const CHAT_REACTIONS = ["👍", "❤️", "😂", "🎉", "👀", "✅", "😊", "😍", "😮", "😢", "😎", "🤔", "👏", "🙌", "🔥", "💯", "🙏", "🚀", "🤝", "😭", "💀", "⭐", "✨", "👎"] as const;
const messageInclude = {
  attachment: true,
  mentions: { select: { userId: true, start: true, end: true }, orderBy: { start: "asc" } },
  replyTo: { select: { id: true, authorName: true, text: true, version: true, createdAt: true, deletedAt: true } },
  reactions: { select: { emoji: true, userId: true } },
} satisfies Prisma.ChatMessageInclude;
type MessageRow = Prisma.ChatMessageGetPayload<{ include: typeof messageInclude }>;
function visibleMessages(viewer: Viewer): Prisma.ChatMessageWhereInput {
  // Owners retain audit access. Everyone else must be an intended recipient,
  // even when they can open a shared Updates channel or oversee a private chat.
  return viewer.isOwner ? {} : { deletedAt: null, AND: [{ OR: [
    { announcementKey: null },
    { authorUserId: viewer.user.id },
    { announcementPost: { is: { announcement: { deliveries: { some: { userId: viewer.user.id } } } } } },
  ] }] };
}
function messageDto(message: MessageRow, viewer: Viewer, canPost: boolean, archived: boolean) {
  if (message.deletedAt && !viewer.isOwner) throw new ChatError(404, "Message not found.");
  const active = !message.deletedAt && !message.systemEventKey && !message.announcementKey;
  const parent = message.replyTo && (!message.replyTo.deletedAt || viewer.isOwner) ? message.replyTo : null;
  return {
    id: message.id, authorUserId: message.authorUserId, authorName: message.authorName,
    mentions: message.mentions.map(m => ({ ...m, mine: m.userId === viewer.user.id })),
    text: message.text, version: message.version, createdAt: message.createdAt, updatedAt: message.updatedAt,
    ...(message.attachment ? { attachment: {
      fileName: message.attachment.fileName, byteSize: message.attachment.byteSize, available: !!chatAttachmentDirectory(),
      canPreview: canPreviewChatImage(message.attachment.fileName, message.attachment.byteSize),
      ...(message.attachment.voiceDurationMs === null ? {} : { voiceDurationMs: message.attachment.voiceDurationMs }),
    } } : {}),
    systemNotice: !!message.systemEventKey || !!message.announcementKey,
    announcement: !!message.announcementKey,
    replyTo: parent ? { id: parent.id, authorName: parent.authorName, text: parent.text || "File attachment", version: parent.version, createdAt: parent.createdAt, deleted: !!parent.deletedAt } : null,
    replyUnavailable: !!message.replyTo && !parent,
    deleted: message.deletedAt ? { at: message.deletedAt, by: message.deletedByName, reason: message.deletionReason } : null,
    canModerate: active && !archived && viewer.permissions.has("chat.messages.moderate"),
    canViewHistory: viewer.isOwner && !message.systemEventKey && !message.announcementKey,
    pinnedAt: message.pinnedAt, pinnedByName: message.pinnedByName, pinVersion: message.pinVersion,
    canReply: active && canPost,
    canPin: active && canPost && viewer.permissions.has("chat.messages.pin"),
    reactions: [...new Set(message.reactions.map(r => r.emoji))].sort().flatMap((emoji) => {
      const entries = message.reactions.filter((r) => r.emoji === emoji);
      return entries.length ? [{ emoji, count: entries.length, mine: entries.some((r) => r.userId === viewer.user.id) }] : [];
    }),
    canEdit: active && !message.attachment && canPost && message.authorUserId === viewer.user.id && viewer.permissions.has("chat.messages.edit_own"),
  };
}

export async function accessibleChatAreas(tx: Prisma.TransactionClient, viewer: Viewer, retainedChannelId?: string) {
    const userId = viewer.user.id;
    const areas = await tx.chatArea.findMany({
      where: viewer.isModel ? { modelId: { in: [] } } : viewer.permissions.has("chat.areas.all") ? {} : {
        modelId: { in: viewer.user.modelAssignments.map((a) => a.modelId) },
      },
      include: { model: { select: { name: true } }, channels: {
        where: retainedChannelId && viewer.isOwner ? { OR: [{ cleanedUpAt: null }, { id: retainedChannelId }] } : { cleanedUpAt: null },
        include: channelInclude, orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
      } },
      orderBy: { model: { name: "asc" } },
    });
    const result = areas.map((area) => {
      const channels = area.channels.flatMap((channel) => {
        const access = channelAccess(viewer, channel);
        return access.canView ? [{ id: channel.id, name: channel.name, isPrivate: false, isOwnPrivate: false, retained: !!channel.cleanedUpAt, ...access, canArchive: canArchiveChannel(viewer, channel, access.canManage) }] : [];
      });
      const pausedForYou = viewer.user.chatQuarantines.some((q) => q.modelId === area.modelId);
      const inArea = inOrdinaryArea(viewer, area.modelId);
      return { modelId: area.modelId, name: area.model.name, archived: !!area.archivedAt, pausedForYou, canManage: inArea && !area.archivedAt && viewer.permissions.has("chat.channels.manage"), channels };
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
      if (!area) { area = { modelId: areaId, name: conversation.model?.name ?? "Private workspace", archived: !!conversation.model?.chatArea?.archivedAt, pausedForYou: viewer.user.chatQuarantines.some((q) => q.modelId === areaId), canManage: false, channels: [] }; result.push(area); }
      // Use the actual protected-conversation purpose instead of generic "Private" labels.
      // Distinct staff, accounting, and general chats must never look interchangeable.
      const purpose = conversation.kind === "STAFF" ? "Staff chat"
        : conversation.kind === "ACCOUNTANT" ? "Accounting chat"
        : conversation.kind === "GENERAL_STAFF" ? "General chat" : "Creator chat";
      const name = conversation.kind === "CREATOR"
        ? `${conversation.model?.name ?? conversation.subjectName} · ${purpose}`
        : conversation.subjectUserId === userId
          ? `Your ${purpose.toLowerCase()}`
          : `${conversation.subjectUser?.name ?? conversation.subjectName} · ${purpose}`;
      area.channels.push({ id: conversation.id, name, isPrivate: true, isOwnPrivate: conversation.subjectUserId === userId, retained: false, ...access, canArchive: false });
    }
    return result.filter((area) => area.channels.length || area.canManage);
}
export async function listChatAreas(userId: string, retainedChannelId?: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    const areas = await accessibleChatAreas(tx, viewer, retainedChannelId);
    const counts = await unreadCounts(tx, viewer, areas);
    return areas.map((area) => ({ ...area, unreadCount: area.channels.reduce((sum, c) => sum + (counts.get(c.id)?.count ?? 0), 0),
      channels: area.channels.map((c) => ({ ...c, unreadCount: counts.get(c.id)?.count ?? 0 })) }));
  });
}

export async function unreadWhere(tx: Prisma.TransactionClient, viewer: Viewer): Promise<Prisma.ChatMessageWhereInput> {
  const start = await tx.chatSetup.findUniqueOrThrow({ where: { id: "chat-unread-v1" } });
  return { ...visibleMessages(viewer), AND: [{ OR: [
      { announcementKey: null },
      { announcementPost: { is: { announcement: { deliveries: { some: { userId: viewer.user.id } } } } } },
    ] }], deletedAt: null, createdAt: { gte: start.createdAt },
    OR: [{ authorUserId: null }, { authorUserId: { not: viewer.user.id } }],
    reads: { none: { userId: viewer.user.id } } };
}
async function unreadCounts(tx: Prisma.TransactionClient, viewer: Viewer, areas: Awaited<ReturnType<typeof accessibleChatAreas>>, mentionsOnly = false) {
  const active = areas.flatMap((a) => a.channels.filter((c) => !c.archived));
  const base: Prisma.ChatMessageWhereInput = { AND: [await unreadWhere(tx, viewer), ...(mentionsOnly ? [{ mentions: { some: { userId: viewer.user.id } } }] : [])] };
  const [channels, conversations] = await Promise.all([
    tx.chatMessage.groupBy({ by: ["channelId"], where: { AND: [base, { channelId: { in: active.filter((c) => !c.isPrivate).map((c) => c.id) } }] }, _count: { id: true }, _min: { createdAt: true } }),
    tx.chatMessage.groupBy({ by: ["conversationId"], where: { AND: [base, { conversationId: { in: active.filter((c) => c.isPrivate).map((c) => c.id) } }] }, _count: { id: true }, _min: { createdAt: true } }),
  ]);
  const counts = new Map<string, { count: number; oldestAt: Date }>();
  for (const row of [...channels.map((c) => ({ ...c, id: c.channelId })), ...conversations.map((c) => ({ ...c, id: c.conversationId }))]) {
    if (row.id && row._min.createdAt) counts.set(row.id, { count: row._count.id, oldestAt: row._min.createdAt });
  }
  return counts;
}
export async function listChatUnread(userId: string) {
  return prisma.$transaction(async (tx) => {
    const viewer = await loadViewer(tx, userId);
    const areas = await accessibleChatAreas(tx, viewer);
    const counts = await unreadCounts(tx, viewer, areas);
    const mentions = await unreadCounts(tx, viewer, areas, true);
    const conversations = [...counts].map(([channelId, c]) => ({ channelId, unreadCount: c.count, oldestUnreadAt: c.oldestAt }));
    return { totalUnread: conversations.reduce((sum, c) => sum + c.unreadCount, 0), totalUnreadMentions: [...mentions.values()].reduce((sum, c) => sum + c.count, 0), conversations };
  });
}

/** Only unread mentions in currently accessible active conversations are returned. */
export async function listChatMentions(userId: string, before?: string) {
  return prisma.$transaction(async tx => {
    const viewer = await loadViewer(tx, userId);
    const areas = await accessibleChatAreas(tx, viewer);
    const channels = areas.flatMap(a => a.channels.filter(c => !c.archived).map(c => ({ ...c, areaName: a.name })));
    const where: Prisma.ChatMessageWhereInput = { AND: [await unreadWhere(tx, viewer), { mentions: { some: { userId } } },
      { OR: [{ channelId: { in: channels.filter(c => !c.isPrivate).map(c => c.id) } }, { conversationId: { in: channels.filter(c => c.isPrivate).map(c => c.id) } }] }] };
    const anchor = before ? await tx.chatMessage.findFirst({ where: { AND: [where, { id: before }] }, select: { id: true, createdAt: true } }) : null;
    if (before && !anchor) throw new ChatError(409, "Your mentions changed. Reopen the list to refresh it.");
    const rows = await tx.chatMessage.findMany({ where: { AND: [where, ...(anchor ? [{ OR: [
      { createdAt: { lt: anchor.createdAt } }, { createdAt: anchor.createdAt, id: { lt: anchor.id } },
    ] }] : [])] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 31, include: messageInclude });
    return { mentions: rows.slice(0, 30).map(m => {
      const channelId = m.channelId ?? m.conversationId!;
      const channel = channels.find(c => c.id === channelId)!;
      return { channelId, conversationName: channel.areaName + " / " + channel.name, message: messageDto(m, viewer, channel.canPost, false) };
    }), nextBefore: rows.length > 30 ? rows[29].id : null };
  });
}

export type ChatMentionInput = { userId: string; start: number; end: number };
async function validateMentions(tx: Prisma.TransactionClient, text: string, mentions: ChatMentionInput[], channel: Channel | null, conversation: StandingConversation | null) {
  if (!Array.isArray(mentions) || mentions.length > 50) throw new ChatError(400, "Use up to 50 mentions per message.");
  if (!mentions.length) return [];
  const sorted = [...mentions].sort((a,b) => a.start - b.start);
  const people = await tx.user.findMany({ where: { id: { in: [...new Set(sorted.map(m => m.userId))] } }, include: viewerInclude });
  const byId = new Map(people.map(user => [user.id, user]));
  let end = 0;
  for (const mention of sorted) {
    if (!Number.isInteger(mention.start) || !Number.isInteger(mention.end) || mention.start < end || mention.end > text.length || mention.end <= mention.start || !mention.userId) throw new ChatError(400, "Choose mentions from the conversation member list.");
    const user = byId.get(mention.userId);
    const access = user && user.status === "ACTIVE" ? (channel ? channelAccess(makeViewer(user), channel) : standingAccess(makeViewer(user), conversation!)) : null;
    if (!user || !access?.canView || text.slice(mention.start, mention.end) !== "@" + user.name) throw new ChatError(400, "A mentioned person is no longer available here. Remove that mention and choose a current member.");
    end = mention.end;
  }
  return sorted;
}

/** GET/search/pin/background polling never marks a read. The browser can only
 * acknowledge this person's visible messages, with current access rechecked. */
export async function markChatMessagesRead(userId: string, channelId: string, input: { messageIds?: string[]; throughMessageId?: string }) {
  const ids = input.messageIds;
  if (!!ids === !!input.throughMessageId || (ids && (!ids.length || ids.length > 100 || ids.some((id) => !id || id.length > 100)))) throw new ChatError(400, "Choose visible messages or a conversation read point.");
  return prisma.$transaction(async (tx) => {
    const { viewer, scope, channel, access } = await openChannel(tx, userId, channelId, true);
    if (access.archived) throw new ChatError(403, "Archived conversations have no unread messages.");
    if (ids) {
      const unique = [...new Set(ids)];
      const visible = await tx.chatMessage.findMany({ where: { ...scope, ...visibleMessages(viewer), deletedAt: null, id: { in: unique } }, select: { id: true } });
      if (visible.length !== unique.length) throw new ChatError(404, "Message not found in this conversation. Refresh before trying again.");
      await tx.chatMessageRead.createMany({ data: visible.map((m) => ({ messageId: m.id, userId })), skipDuplicates: true });
    } else {
      const anchor = await tx.chatMessage.findFirst({ where: { ...scope, ...visibleMessages(viewer), id: input.throughMessageId!, deletedAt: null }, select: { id: true, createdAt: true } });
      if (!anchor) throw new ChatError(404, "Read point not found. Refresh the conversation.");
      // A single INSERT SELECT sees only committed messages. An older-started
      // transaction committing later remains unread, even before this anchor.
      const target = channel ? Prisma.sql`m."channelId" = ${channelId}` : Prisma.sql`m."conversationId" = ${channelId}`;
      const start = await tx.chatSetup.findUniqueOrThrow({ where: { id: "chat-unread-v1" } });
      // Prisma's legacy message column stores UTC without a timezone. Bind ISO
      // text and cast explicitly, avoiding the database session's local offset.
      const startTime = start.createdAt.toISOString(), anchorTime = anchor.createdAt.toISOString();
      await tx.$executeRaw`INSERT INTO "ChatMessageRead" ("messageId", "userId", "readAt")
        SELECT m."id", ${userId}, clock_timestamp() AT TIME ZONE 'UTC' FROM "ChatMessage" m WHERE ${target} AND m."deletedAt" IS NULL
        AND (m."announcementKey" IS NULL OR m."authorUserId" = ${userId} OR EXISTS (
          SELECT 1 FROM "ChatAnnouncementPost" p JOIN "ChatAnnouncementDelivery" d ON d."announcementId" = p."announcementId"
          WHERE p."messageId" = m."id" AND d."userId" = ${userId}
        ))
        AND m."createdAt" >= ${startTime}::timestamp AND (m."authorUserId" IS NULL OR m."authorUserId" <> ${userId})
        AND (m."createdAt" < ${anchorTime}::timestamp OR (m."createdAt" = ${anchorTime}::timestamp AND m."id" <= ${anchor.id}))
        ON CONFLICT ("messageId", "userId") DO NOTHING`;
    }
    const count = await tx.chatMessage.count({ where: { AND: [scope, await unreadWhere(tx, viewer)] } });
    return { unreadCount: count };
  });
}

/** Recheck current Chat visibility for a live connection without exposing
 * any message contents or accepting an archived/foreign channel ID. */
export async function assertChatChannelReadable(userId: string, channelId: string): Promise<void> {
  await prisma.$transaction(async (tx) => { await openChannel(tx, userId, channelId); });
}

export async function listChatMessages(userId: string, channelId: string, before?: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    const cursor = before ? await tx.chatMessage.findFirst({ where: { id: before, ...scope, ...visibleMessages(viewer) }, select: { id: true, createdAt: true } }) : null;
    if (before && !cursor) throw new ChatError(400, "The message cursor is invalid.");
    const rows = await tx.chatMessage.findMany({ where: {
      ...scope,
      ...visibleMessages(viewer),
      ...(cursor ? { OR: [{ createdAt: { lt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { lt: cursor.id } }] } : {}),
    }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: 51, include: messageInclude });
    const hasMore = rows.length > 50;
    const messages = rows.slice(0, 50).reverse().map((m) => messageDto(m, viewer, access.canPost, access.archived));
    const unreadMessageIds = access.archived ? [] : (await tx.chatMessage.findMany({ where: {
      AND: [await unreadWhere(tx, viewer), { id: { in: messages.map((m) => m.id) } }],
    }, select: { id: true } })).map((m) => m.id);
    const control = conversation?.kind === "STAFF" && conversation.modelId && conversation.subjectUser
      ? quarantineControl(viewer, makeViewer(conversation.subjectUser), conversation.modelId) : null;
    const quarantine = control && (!access.archived || (control.active && control.canLift)) ? control : null;
    const cleanup = viewer.isOwner && channel?.archivedAt && !channel.cleanedUpAt && channel.key !== "updates" && chatChannelCleanupEnabled()
      ? { download: await completedChannelDownload(tx, userId, channel.id, channel.archivedAt) }
      : undefined;
    return { messages, unreadMessageIds, quarantine, canPost: access.canPost, canViewDeleted: viewer.isOwner, canPin: access.canPost && viewer.permissions.has("chat.messages.pin"), hasMore, nextBefore: hasMore ? messages[0].id : null,
      ...(channel && access.archived && viewer.isOwner && chatChannelExportEnabled() ? { canExportArchive: true } : {}),
      ...(cleanup ? { cleanup } : {}),
    };
  });
}

/** Locate a reply target in a bounded, chronological window. Reuse the
 * exact same viewer/channel and deleted-message filtering as normal reads;
 * unauthorised/removed messages never create a searchable navigation oracle. */
export async function getChatMessageContext(userId: string, channelId: string, messageId: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope } = await openChannel(tx, userId, channelId);
    const audience = { ...scope, ...visibleMessages(viewer) };
    const target = await tx.chatMessage.findFirst({
      where: { ...audience, id: messageId }, include: messageInclude,
    });
    if (!target) throw new ChatError(404, "Message not found.");
    const older = await tx.chatMessage.findMany({
      where: { ...audience, OR: [
        { createdAt: { lt: target.createdAt } },
        { createdAt: target.createdAt, id: { lt: target.id } },
      ] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: 26, include: messageInclude,
    });
    const newer = await tx.chatMessage.findMany({
      where: { ...audience, OR: [
        { createdAt: { gt: target.createdAt } },
        { createdAt: target.createdAt, id: { gt: target.id } },
      ] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      take: 26, include: messageInclude,
    });
    const messages = [...older.slice(0, 25).reverse(), target, ...newer.slice(0, 25)]
      .map((m) => messageDto(m, viewer, access.canPost, access.archived));
    return {
      messages,
      hasMore: older.length > 25,
      nextBefore: older.length > 25 ? messages[0].id : null,
      hasNewer: newer.length > 25,
    };
  });
}

type NewAttachment = { id: string; fileName: string; byteSize: number; sha256: string; voiceDurationMs: number | null };

async function postChatMessage(userId: string, channelId: string, text: string, clientNonce: string, replyToId?: string, attachment?: NewAttachment, mentions: ChatMentionInput[] = []) {
  const normalized = text.trim();
  if ((!normalized && !attachment) || normalized.length > 8000 || !/^[\w-]{8,80}$/.test(clientNonce)) throw new ChatError(400, "Use 1–8,000 characters and a valid message reference.");
  if (attachment && !chatAttachmentDirectory()) throw new ChatError(404, "Attachments are unavailable.");
  return prisma.$transaction(async (tx) => {
    const { viewer, access, channel, conversation } = await openChannel(tx, userId, channelId, true);
    if (!access.canPost) throw new ChatError(403, "This channel is read-only for you.");
    const target = channel ? { channelId } : { conversationId: channelId };
    const checkedMentions = await validateMentions(tx, normalized, mentions, channel, conversation);
    if (replyToId) {
      await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${replyToId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR SHARE`;
      if (!await tx.chatMessage.findFirst({ where: { id: replyToId, ...target, deletedAt: null, systemEventKey: null, announcementKey: null }, select: { id: true } })) throw new ChatError(404, "Reply message not found in this conversation.");
    }
    const [created] = await tx.chatMessage.createManyAndReturn({ data: { ...target, authorUserId: userId, authorName: viewer.user.name, text: normalized, clientNonce, replyToId: replyToId ?? null }, skipDuplicates: true, select: { id: true } });
    if (created && checkedMentions.length) await tx.chatMessageMention.createMany({ data: checkedMentions.map(m => ({ ...m, messageId: created.id })) });
    if (created && attachment) await tx.chatAttachment.create({ data: { ...attachment, messageId: created.id } });
    const message = await tx.chatMessage.findFirstOrThrow({ where: { ...target, authorUserId: userId, clientNonce }, include: messageInclude });
    if (message.deletedAt) throw new ChatError(409, "This message reference is no longer available. Send a new message instead.");
    if (JSON.stringify(message.mentions) !== JSON.stringify(checkedMentions.map(({ userId, start, end }) => ({ userId, start, end }))) || message.text !== normalized || message.replyToId !== (replyToId ?? null)) throw new ChatError(409, "This message reference was already used. Refresh before sending again.");
    const stored = message.attachment;
    const sameAttachment = attachment
      ? stored?.sha256 === attachment.sha256 && stored.fileName === attachment.fileName
        && stored.byteSize === attachment.byteSize && stored.voiceDurationMs === attachment.voiceDurationMs
      : !stored;
    if (!sameAttachment) {
      throw new ChatError(409, "This message reference was already used. Choose the file again.");
    }
    if (created) await audit(tx, viewer, "chat.message.send", message.id, { channelId, channelName: channel?.name ?? `${conversation?.subjectName} · Private`, text: message.text, replyToId: message.replyToId, mentions: checkedMentions,
      ...(attachment ? { fileName: attachment.fileName, byteSize: attachment.byteSize } : {}),
    });
    return { message: messageDto(message, viewer, access.canPost, access.archived), attachmentStored: !!created && !!attachment };
  });
}

export async function sendChatMessage(userId: string, channelId: string, text: string, clientNonce: string, replyToId?: string, mentions: ChatMentionInput[] = []) {
  return (await postChatMessage(userId, channelId, text, clientNonce, replyToId, undefined, mentions)).message;
}

export async function assertChatAttachmentPosting(userId: string, channelId: string) {
  await prisma.$transaction(async (tx) => {
    const { access } = await openChannel(tx, userId, channelId);
    if (!access.canPost) throw new ChatError(403, "This channel is read-only for you.");
  });
}

export function sendChatAttachmentMessage(userId: string, channelId: string, nonce: string, attachment: NewAttachment) {
  return postChatMessage(userId, channelId, "", nonce, undefined, attachment);
}

export async function openChatAttachment(userId: string, channelId: string, messageId: string, directory: string, purpose: "download" | "preview" | "voice") {
  let handle: FileHandle | undefined;
  try {
    return await prisma.$transaction(async (tx) => {
      const { viewer, scope } = await openChannel(tx, userId, channelId);
      const message = await tx.chatMessage.findFirst({
        where: { ...scope, id: messageId, ...visibleMessages(viewer) },
        select: { attachment: true },
      });
      if (!message?.attachment) throw new ChatError(404, "Attachment not found.");
      const { id, fileName, byteSize, voiceDurationMs } = message.attachment;
      if (purpose === "preview" && !canPreviewChatImage(fileName, byteSize)) {
        throw new ChatError(404, "No preview is available for this file.");
      }
      if (purpose === "voice" && voiceDurationMs === null) throw new ChatError(404, "Voice message not found.");
      try {
        handle = await open(join(directory, id), "r");
        const info = await handle.stat();
        if (!info.isFile() || info.size !== byteSize) throw new Error("Invalid stored file");
      } catch {
        throw new ChatError(503, "This file is temporarily unavailable.");
      }
      if (purpose !== "preview") {
        await audit(tx, viewer, purpose === "voice" ? "chat.attachment.play" : "chat.attachment.download", messageId, { channelId, fileName, byteSize });
      }
      return { handle, fileName, byteSize };
    });
  } catch (error) {
    await handle?.close().catch(() => {});
    throw error;
  }
}

export async function editChatMessage(userId: string, channelId: string, messageId: string, text: string, version: number, mentions: ChatMentionInput[] = []) {
  const normalized = text.trim();
  if (!normalized || normalized.length > 8000 || !Number.isInteger(version) || version < 1) throw new ChatError(400, "Use 1–8,000 characters and a valid message version.");
  return prisma.$transaction(async (tx) => {
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId, true);
    if (!access.canPost || !viewer.permissions.has("chat.messages.edit_own")) throw new ChatError(403, "You cannot edit messages here.");
    const previous = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null }, include: { attachment: { select: { id: true } }, mentions: { select: { userId: true, start: true, end: true } } } });
    if (!previous) throw new ChatError(404, "Message not found.");
    if (previous.systemEventKey || previous.announcementKey) throw new ChatError(403, "Chat notices cannot be edited.");
    if (previous.attachment) throw new ChatError(403, "File messages cannot be edited.");
    if (previous.authorUserId !== userId) throw new ChatError(403, "You can only edit your own messages.");
    if (previous.version !== version) throw new ChatError(409, "This message changed. Refresh before editing again.");
    const checkedMentions = await validateMentions(tx, normalized, mentions, channel, conversation);
    const updated = await tx.chatMessage.updateMany({ where: { id: messageId, version, ...scope, deletedAt: null }, data: { text: normalized, version: { increment: 1 } } });
    if (!updated.count) throw new ChatError(409, "This message changed. Refresh before editing again.");
    await tx.chatMessageMention.deleteMany({ where: { messageId } });
    if (checkedMentions.length) await tx.chatMessageMention.createMany({ data: checkedMentions.map(m => ({ ...m, messageId })) });
    await audit(tx, viewer, "chat.message.edit", messageId, { channelId, channelName: channel?.name ?? `${conversation?.subjectName} · Private`, before: previous.text, after: normalized, beforeMentions: previous.mentions, mentions: checkedMentions, version: version + 1 });
    return messageDto(await tx.chatMessage.findUniqueOrThrow({ where: { id: messageId }, include: messageInclude }), viewer, true, access.archived);
  });
}

export async function listChatMembers(userId: string, channelId: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, conversation, access: conversationAccess } = await openChannel(tx, userId, channelId);
    const modelId = channel?.modelId ?? conversation?.modelId;
    const people = await tx.user.findMany({ where: { status: "ACTIVE", OR: [
      ...(modelId ? [{ modelAssignments: { some: { modelId } } }] : []),
      ...(conversation?.subjectUserId ? [{ id: conversation.subjectUserId }] : []),
      { roleMemberships: { some: { role: { archivedAt: null, rolePermissions: { some: { permission: { key: "chat.areas.all" } } } } } } },
      { roleMemberships: { some: { role: { archivedAt: null, rolePermissions: { some: { permission: { key: { in: ["chat.private.all", "chat.private.general.review"] } } } } } } } },
      { roleMemberships: { some: { role: { systemKey: "OWNER", archivedAt: null } } } },
    ] }, include: viewerInclude, orderBy: [{ name: "asc" }, { id: "asc" }] });
    return people.flatMap((user) => {
      const subject = makeViewer(user);
      const access = channel ? channelAccess(subject, channel) : standingAccess(subject, conversation!);
      const quarantine = modelId && !conversationAccess.archived ? quarantineControl(viewer, subject, modelId) : null;
      // Only an authorized reviewer sees paused targets who no longer belong
      // to this ordinary channel. There is no team-wide quarantine notice.
      const primaryRole = user.roleMemberships.map(({ role }) => role)
        .sort((a, b) => (a.rank ?? Number.MAX_SAFE_INTEGER) - (b.rank ?? Number.MAX_SAFE_INTEGER))[0];
      return access.canView || quarantine?.active ? [{
        id: user.id, name: user.name, role: primaryRole?.name ?? "Member",
        avatarUpdatedAt: user.avatarUpdatedAt, canView: access.canView, canPost: access.canPost, quarantine,
      }] : [];
    });
  });
}

/** Serve a member's profile image only while both accounts retain access to
 * the same conversation. Avoid fetching every member for each avatar request. */
export async function getChatMemberAvatar(userId: string, channelId: string, memberId: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, conversation, access: conversationAccess } = await openChannel(tx, userId, channelId);
    const user = await tx.user.findUnique({ where: { id: memberId }, include: viewerInclude });
    if (!user || user.status !== "ACTIVE") throw new ChatError(404, "Profile picture not found.");
    const member = makeViewer(user);
    const access = channel ? channelAccess(member, channel) : standingAccess(member, conversation!);
    const modelId = channel?.modelId ?? conversation?.modelId;
    const quarantine = modelId && !conversationAccess.archived ? quarantineControl(viewer, member, modelId) : null;
    if (!access.canView && !quarantine?.active) throw new ChatError(404, "Profile picture not found.");
    if (!user.avatarUpdatedAt || !user.avatarImage || !user.avatarMimeType)
      throw new ChatError(404, "Profile picture not found.");
    return { avatarImage: user.avatarImage, avatarMimeType: user.avatarMimeType };
  });
}

export async function setChatGrant(userId: string, channelId: string, input: { roleId?: string; personId?: string; canView: boolean; canPost: boolean }) {
  if (!!input.roleId === !!input.personId) throw new ChatError(400, "Choose one role or person.");
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, access } = await openChannel(tx, userId, channelId, true);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats have fixed membership; ordinary channels require channel management access.");
    const data = { canView: input.canView || input.canPost, canPost: input.canPost };
    let beforeGrant: { canView: boolean; canPost: boolean } | null = null;
    let recipientName = "";
    if (input.roleId) {
      const role = await tx.role.findFirst({ where: { id: input.roleId, archivedAt: null } });
      if (!role) throw new ChatError(404, "Role not found.");
      if (role.systemKey === "OWNER") throw new ChatError(403, "Owner access is automatic and cannot be changed through channel grants.");
      if (!canGrantToRole(viewer, role)) throw new ChatError(403, "You can only change channel access for roles ranked below your own.");
      beforeGrant = await tx.chatRoleGrant.findUnique({ where: { channelId_roleId: { channelId, roleId: role.id } } });
      recipientName = role.name;
      await tx.chatRoleGrant.upsert({ where: { channelId_roleId: { channelId, roleId: role.id } }, create: { channelId, roleId: role.id, ...data }, update: data });
    } else {
      if (input.personId === userId) throw new ChatError(403, "You cannot add yourself to a channel.");
      const assignment = await tx.userModelAssignment.findFirst({ where: { userId: input.personId, modelId: channel.modelId, user: { status: "ACTIVE" } }, include: { user: { select: { name: true, roleMemberships: { where: { role: { archivedAt: null } }, select: { role: { select: { id: true, systemKey: true, rank: true } } } } } } } });
      if (!assignment) throw new ChatError(404, "That person is not currently assigned to this creator.");
      if (assignment.user.roleMemberships.some(({ role }) => role.systemKey === "OWNER")) throw new ChatError(403, "Owner access is automatic and cannot be changed through channel grants.");
      if (!canGrantToPerson(viewer, assignment.user.roleMemberships.map(({ role }) => role))) throw new ChatError(403, "You can only change channel access for people whose roles are all ranked below yours.");
      beforeGrant = await tx.chatPersonGrant.findUnique({ where: { channelId_assignmentId: { channelId, assignmentId: assignment.id } } });
      recipientName = assignment.user.name;
      await tx.chatPersonGrant.upsert({ where: { channelId_assignmentId: { channelId, assignmentId: assignment.id } }, create: { channelId, assignmentId: assignment.id, ...data }, update: data });
    }
    await audit(tx, viewer, "chat.channel.grant", channelId, { ...input, channelName: channel.name, recipientName, beforeGrant: beforeGrant ? { canView: beforeGrant.canView, canPost: beforeGrant.canPost } : null, afterGrant: data });
  });
}

export async function chatGrantOptions(userId: string, channelId: string) {
  return prisma.$transaction(async (tx) => {
    const { viewer, channel, access } = await openChannel(tx, userId, channelId);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats have fixed membership; ordinary channels require channel management access.");
    const [allRoles, allAssignments] = await Promise.all([
      // Owners have built-in oversight, never an editable role or member grant.
      // Include custom roles whose systemKey is null as well as other system roles.
      tx.role.findMany({ where: { archivedAt: null, OR: [{ systemKey: null }, { systemKey: { not: "OWNER" } }] }, select: { id: true, name: true, systemKey: true, rank: true, rolePermissions: { select: { permission: { select: { key: true } } } } }, orderBy: { name: "asc" } }),
      tx.userModelAssignment.findMany({ where: { modelId: channel.modelId, user: { status: "ACTIVE", id: { not: userId }, roleMemberships: { none: { role: { systemKey: "OWNER", archivedAt: null } } } } }, select: { id: true, user: { include: viewerInclude } }, orderBy: { user: { name: "asc" } } }),
    ]);
    // Offer only what setChatGrant will accept for this manager.
    const roles = allRoles.filter((role) => canGrantToRole(viewer, role));
    const assignments = allAssignments.filter((a) => canGrantToPerson(viewer, a.user.roleMemberships.map(({ role }) => role)));
    return {
      roles: roles.map((role) => {
        const keys = new Set(role.rolePermissions.map(({ permission }) => permission.key));
        const canView = keys.has("chat.channels.all");
        return { id: role.id, name: role.name, grant: channel.roleGrants.find((g) => g.roleId === role.id) ?? null,
          siteWideAccess: { canView, canPost: canView && keys.has("chat.channels.post_all") && keys.has("chat.messages.send") } };
      }),
      // The Member selector edits only a named grant. Show the inherited
      // access separately so "no named grant" is never mistaken for a denial.
      people: assignments.map((a) => {
        const roleAccess = channelAccess(makeViewer(a.user), { ...channel, personGrants: [] });
        return {
          id: a.user.id, name: a.user.name,
          grant: channel.personGrants.find((g) => g.assignmentId === a.id) ?? null,
          inheritedAccess: { canView: roleAccess.canView, canPost: roleAccess.canPost },
        };
      }),
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
    const duplicate = await tx.chatChannel.findFirst({ where: { modelId, cleanedUpAt: null, name: { equals: normalized, mode: "insensitive" } } });
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
    const { viewer, channel, access } = await openChannel(tx, userId, channelId, true);
    if (!channel || !access.canManage) throw new ChatError(403, "Protected chats cannot be renamed; ordinary channels require management access.");
    const duplicate = await tx.chatChannel.findFirst({ where: { modelId: channel.modelId, id: { not: channelId }, cleanedUpAt: null, name: { equals: normalized, mode: "insensitive" } } });
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
  if (!CHAT_EMOJI_SUPPORTED.has(emoji) || typeof active !== "boolean") throw new ChatError(400, "Choose one of the supported reactions.");
  return prisma.$transaction(async (tx) => {
    // The message lock serializes add/remove and pin decisions; counters and
    // transactional audit describe the state actually committed.
    await openChannel(tx, userId, channelId, true);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost) throw new ChatError(403, "This conversation is read-only for you.");
    if (!await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null, systemEventKey: null, announcementKey: null }, select: { id: true } })) throw new ChatError(404, "Message not found.");
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
    await openChannel(tx, userId, channelId, true);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (!access.canPost || !viewer.permissions.has("chat.messages.pin")) throw new ChatError(403, "Your access does not allow managing pins here.");
    const message = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope, deletedAt: null }, include: messageInclude });
    if (!message) throw new ChatError(404, "Message not found.");
    if (message.systemEventKey || message.announcementKey) throw new ChatError(403, "Chat notices cannot be pinned.");
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
    const areas = await accessibleChatAreas(tx, viewer, channelId);
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
  }, { timeout: 10_000 });
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
    await openChannel(tx, userId, channelId, true);
    await tx.$queryRaw`SELECT "id" FROM "ChatMessage" WHERE "id" = ${messageId} AND ("channelId" = ${channelId} OR "conversationId" = ${channelId}) FOR UPDATE`;
    const { viewer, access, scope, channel, conversation } = await openChannel(tx, userId, channelId);
    if (access.archived || !viewer.permissions.has("chat.messages.moderate")) throw new ChatError(403, "Your access does not allow deleting messages here.");
    const previous = await tx.chatMessage.findFirst({ where: { id: messageId, ...scope }, include: messageInclude });
    if (!previous) throw new ChatError(404, "Message not found.");
    if (previous.systemEventKey || previous.announcementKey) throw new ChatError(403, "Chat notices cannot be deleted.");
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

const QUARANTINE_DEFAULTS: Record<string, string[]> = {
  "chat.quarantine.trials": ["QC"],
  "chat.quarantine.staff": ["MANAGER"],
  "chat.quarantine.all": ["OWNER", "OPS_MANAGER"],
};

function quarantineAuthority(viewer: Viewer, subject: Viewer, modelId: string) {
  const p = viewer.permissions;
  const roles = subject.user.roleMemberships.map(({ role }) => role);
  const staff = roles.some((r) => r.systemKey === "CHATTER" || r.systemKey === "TRIAL_CHATTER");
  const protectedRole = roles.some((r) => ["OWNER", "OPS_MANAGER", "MANAGER", "QC", "DEV", "MODEL", "ACCOUNTANT", "GENERAL_STAFF"].includes(r.systemKey ?? "") ||
    (r.rank !== null && r.rank < 5) || r.rolePermissions.some(({ permission }) => permission.key.startsWith("chat.quarantine.")));
  const targetAssigned = subject.user.modelAssignments.some((a) => a.modelId === modelId);
  const actorAssigned = viewer.user.modelAssignments.some((a) => a.modelId === modelId);
  const actorPaused = viewer.user.chatQuarantines.some((q) => q.modelId === modelId);
  const eligible = staff && !protectedRole && subject.permissions.has("chat.access") && subject.user.status === "ACTIVE";
  const self = viewer.user.id === subject.user.id;
  const trialsOnly = !roles.some((r) => r.systemKey === "CHATTER");
  const authorized = !self && !actorPaused && eligible && targetAssigned &&
    (p.has("chat.quarantine.all") || (actorAssigned && (p.has("chat.quarantine.staff") || (trialsOnly && p.has("chat.quarantine.trials")))));
  // Owner recovery may clear an existing pause after unassignment, promotion or
  // deactivation. This does not grant the ability to create a pause on that role.
  return { authorized, recover: !self && !actorPaused && viewer.isOwner };
}

function quarantineControl(viewer: Viewer, subject: Viewer, modelId: string) {
  const state = subject.user.chatQuarantines.find((q) => q.modelId === modelId);
  const authority = quarantineAuthority(viewer, subject, modelId);
  if (!authority.authorized && !(state && authority.recover)) return null;
  return { modelId, userId: subject.user.id, personName: subject.user.name, active: !!state,
    canPause: !state && authority.authorized, canLift: !!state && (authority.authorized || authority.recover) };
}

async function quarantineReview(tx: Prisma.TransactionClient, userId: string, modelId: string, subjectId: string) {
  const viewer = await loadViewer(tx, userId);
  const area = await tx.chatArea.findUnique({ where: { modelId }, include: { model: true } });
  const person = await tx.user.findUnique({ where: { id: subjectId }, include: viewerInclude });
  if (!area || !person) throw new ChatError(404, "Chat access review not found.");
  const subject = makeViewer(person);
  const control = quarantineControl(viewer, subject, modelId);
  if (!control) throw new ChatError(404, "Chat access review not found.");
  const state = await tx.chatQuarantine.findUnique({ where: { modelId_userId: { modelId, userId: subjectId } } });
  const assignment = person.modelAssignments.find((a) => a.modelId === modelId);
  const privateChat = assignment ? await tx.chatStandingConversation.findFirst({ where: {
    modelId, subjectUserId: subjectId, assignmentId: assignment.id, kind: "STAFF", archivedAt: null,
  }, orderBy: { createdAt: "desc" } }) : null;
  const areaActive = area.model.isActive && !area.archivedAt;
  return { viewer, subject, state, result: { ...control, creatorName: area.model.name,
    canPause: control.canPause && areaActive && subject.permissions.has("chat.private.staff"), canLift: control.canLift,
    version: state?.version ?? 0, assignmentId: assignment?.id ?? null,
    privateChatId: privateChat?.id ?? null, reason: state?.reason ?? null,
    changedAt: state?.changedAt ?? null, changedByName: state?.changedByName ?? null } };
}

export async function getChatQuarantine(userId: string, modelId: string, subjectId: string) {
  return prisma.$transaction(async (tx) => (await quarantineReview(tx, userId, modelId, subjectId)).result);
}

export async function setChatQuarantine(userId: string, modelId: string, subjectId: string, input: {
  active: boolean; version: number; assignmentId: string | null; reason: string; requestId: string;
}) {
  const reason = input.reason.trim();
  if (!reason || reason.length > 1000 || !Number.isInteger(input.version) || input.version < 0 ||
    typeof input.active !== "boolean" || !/^[0-9a-f-]{36}$/i.test(input.requestId)) throw new ChatError(400, "Review the person and give a reason of 1–1,000 characters.");
  const hash = createHash("sha256").update(JSON.stringify([userId, modelId, subjectId, input.active, input.version, input.assignmentId, reason])).digest("hex");
  return prisma.$transaction(async (tx) => {
    // Stable person locks serialize both opposite actions and Chat requests.
    for (const id of [...new Set([userId, subjectId])].sort())
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'chat-access:' + id}, 0))`;
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" IN (${userId}, ${subjectId}) ORDER BY "id" FOR SHARE`;
    const review = await quarantineReview(tx, userId, modelId, subjectId);
    const { viewer, subject, state, result } = review;
    if (state?.lastRequestId === input.requestId) {
      if (state.lastRequestHash !== hash) throw new ChatError(409, "This request reference was already used. Check the current status.");
      return result;
    }
    if (result.version !== input.version || result.assignmentId !== input.assignmentId || result.active === input.active)
      throw new ChatError(409, "The person’s chat access changed. Check their current status before confirming again.");
    if (!(input.active ? result.canPause : result.canLift)) throw new ChatError(403, "Your current access does not allow this change.");
    if (input.assignmentId) {
      const assignment = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "UserModelAssignment" WHERE "id" = ${input.assignmentId} AND "userId" = ${subjectId} AND "modelId" = ${modelId} FOR SHARE`;
      if (!assignment.length) throw new ChatError(409, "The creator assignment changed. Check the current status again.");
    }
    if (!viewer.permissions.has("chat.quarantine.all") && !viewer.isOwner) {
      const assignmentId = viewer.user.modelAssignments.find((a) => a.modelId === modelId)?.id;
      const current = assignmentId ? await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "UserModelAssignment" WHERE "id" = ${assignmentId} AND "userId" = ${userId} FOR SHARE` : [];
      if (!current.length) throw new ChatError(409, "Your creator assignment changed. Check the current status again.");
    }
    if (input.active && !subject.permissions.has("chat.private.staff")) throw new ChatError(409, "A staff–management private chat is required before pausing chats.");
    if (input.active && !result.privateChatId) {
      await syncUserStandingChats(tx, subjectId);
      const current = await quarantineReview(tx, userId, modelId, subjectId);
      result.privateChatId = current.result.privateChatId;
      if (!result.privateChatId) throw new ChatError(409, "Their private management chat is not available. No chats were paused.");
    }
    const values = { active: input.active, personName: subject.user.name, reason, changedAt: new Date(),
      changedById: userId, changedByName: viewer.user.name, lastRequestId: input.requestId, lastRequestHash: hash };
    const updated = await tx.chatQuarantine.upsert({ where: { modelId_userId: { modelId, userId: subjectId } },
      create: { modelId, userId: subjectId, ...values, version: 1 }, update: { ...values, version: { increment: 1 } } });
    const notice = input.active
      ? `Your other chats for ${result.creatorName} are paused. This private management chat stays open. Login, Clock & Hours and your other creators are unaffected.`
      : `Your chat pause for ${result.creatorName} has been lifted. Available chats now follow your current assignments and permissions.`;
    let noticeId: string | null = null;
    if (result.privateChatId) {
      const message = await tx.chatMessage.create({ data: { conversationId: result.privateChatId, authorName: "Chat access notice",
        clientNonce: `quarantine-${input.requestId}`, systemEventKey: `quarantine-${input.requestId}`, text: notice } });
      noticeId = message.id;
    }
    await audit(tx, viewer, input.active ? "chat.quarantine.pause" : "chat.quarantine.lift", updated.id, {
      modelId, creatorName: result.creatorName, subjectId, personName: subject.user.name,
      assignmentId: result.assignmentId, reason, active: input.active, version: updated.version,
      conversationId: result.privateChatId, noticeId, scope: "CREATOR_ONLY",
    });
    return { ...result, active: updated.active, version: updated.version, reason: updated.reason,
      changedAt: updated.changedAt, changedByName: updated.changedByName,
      canPause: !updated.active && quarantineAuthority(viewer, subject, modelId).authorized,
      canLift: updated.active && (quarantineAuthority(viewer, subject, modelId).authorized || viewer.isOwner) };
  }, { timeout: 10_000 }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2003", "P2034"].includes(error.code))
      throw new ChatError(409, "Chat access changed during this request. Check the current status before trying again.");
    throw error;
  });
}

export async function installChatQuarantineDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942124)`;
  if (await tx.chatSetup.findUnique({ where: { id: "chat-quarantine-v1" } })) return false;
  for (const [key, roleKeys] of Object.entries(QUARANTINE_DEFAULTS)) {
    const definition = CHAT_PERMISSION_DEFINITIONS.find((p) => p.key === key)!;
    const { requires: _requires, ...data } = definition;
    const permission = await tx.permission.upsert({ where: { key }, create: data, update: {} });
    const roles = await tx.role.findMany({ where: { systemKey: { in: roleKeys }, archivedAt: null } });
    await tx.rolePermission.createMany({ data: roles.map((role) => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  }
  await tx.chatSetup.create({ data: { id: "chat-quarantine-v1" } });
  await tx.auditEvent.create({ data: { action: "chat.quarantine.defaults.install", success: true, statusCode: 200, targetType: "chat", metadata: { version: 1 } } });
  return true;
}
