import type { Prisma } from '@prisma/client';
import { accessibleChatAreas, unreadWhere, loadViewer } from './creator-chat.js';

/** Notification subscriptions are narrower than badge/oversight visibility. */
export async function notificationUnreadScope(tx: Prisma.TransactionClient, userId: string) {
  const viewer = await loadViewer(tx, userId);
  const areas = await accessibleChatAreas(tx, viewer);
  const limited = viewer.user.roleMemberships.some(({ role }) => ['OWNER', 'OPS_MANAGER', 'DEV'].includes(role.systemKey ?? ''));
  const active = areas.filter(a => !a.archived).flatMap(a => a.channels.filter(c => !c.archived));
  let ordinaryIds = active.filter(c => !c.isPrivate).map(c => c.id);
  if (limited && ordinaryIds.length) {
    const grants = await tx.chatPersonGrant.findMany({ where: { channelId: { in: ordinaryIds }, assignmentId: { in: viewer.user.modelAssignments.map(a => a.id) }, OR: [{ canView: true }, { canPost: true }] }, select: { channelId: true, channel: { select: { modelId: true } }, assignment: { select: { modelId: true } } } });
    ordinaryIds = grants.filter(g => g.assignment.modelId === g.channel.modelId).map(g => g.channelId);
  }
  const privateIds = active.filter(c => c.isPrivate).map(c => c.id);
  const where: Prisma.ChatMessageWhereInput = { AND: [await unreadWhere(tx, viewer), { OR: [
    { channelId: { in: ordinaryIds }, channel: { area: { model: { isActive: true } } } },
    { conversationId: { in: privateIds }, conversation: { OR: [{ modelId: null }, { model: { isActive: true } }] } },
  ] }] };
  return { viewer, limited, where };
}
