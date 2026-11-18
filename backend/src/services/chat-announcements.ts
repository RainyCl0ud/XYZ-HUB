import { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'node:crypto';
import { prisma } from '../lib/prisma.js';
import { ChatError, viewerInclude, makeViewer, loadViewer, channelInclude, channelAccess, standingInclude, standingAccess } from './creator-chat.js';
import { CHAT_PERMISSION_DEFINITIONS } from '../permissions/chat-permissions.js';
import { announcementsEnabled, announcementEmailMode } from './chat-announcement-policy.js';
import { renderBrandedTransactionalEmail } from './transactional-email-template.js';
import type { TransactionalEmail } from './email-delivery.js';

export type AnnouncementInput = { title: string; text: string };
type Destination = { id: string; isPrivate: boolean };
const hash = (value: unknown) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
// Keep the shared viewer shape intact when resolving announcement recipients.
const personInclude = viewerInclude;
type Person = Prisma.UserGetPayload<{ include: typeof personInclude }>;
const eligibleStaff = (person: Person) => person.status === 'ACTIVE' && person.roleMemberships.length > 0 && !person.creatorProfile && !person.roleMemberships.some(({ role }) => role.systemKey === 'MODEL');
export const singleEmailAddress = (address: string) => /^[^\s<>,;@\r\n]+@[^\s<>,;@\r\n]+\.[^\s<>,;@\r\n]+$/.test(address);
const normalize = (input: AnnouncementInput) => {
  const title = input.title.trim(), text = input.text.trim();
  if (!title || title.length > 120 || /[\r\n]/.test(title) || !text || text.length > 7800) throw new ChatError(400, 'Use a title of 1–120 characters and announcement text of 1–7,800 characters.');
  return { title, text };
};
function assertEnabled() { if (!announcementsEnabled()) throw new ChatError(404, 'Announcements are not available.'); }
async function sender(tx: Prisma.TransactionClient, id: string) {
  assertEnabled();
  const viewer = await loadViewer(tx, id);
  if (!viewer.permissions.has('chat.announcements.send') || !viewer.user.roleMemberships.some(({ role }) => ['OWNER','OPS_MANAGER'].includes(role.systemKey ?? '')) || viewer.user.roleMemberships.some(({ role }) => role.systemKey === 'MODEL')) throw new ChatError(403, 'Only authorized Owners and Ops can send staff announcements.');
  return viewer;
}
export async function installChatAnnouncementDefaults(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942123)`;
  if (await tx.chatSetup.findUnique({ where: { id: 'chat-announcements-v1' } })) return false;
  const { requires: _requires, ...definition } = CHAT_PERMISSION_DEFINITIONS.find(p => p.key === 'chat.announcements.send')!;
  const permission = await tx.permission.upsert({ where: { key: definition.key }, create: definition, update: {} });
  const roles = await tx.role.findMany({ where: { systemKey: { in: ['OWNER','OPS_MANAGER'] }, archivedAt: null } });
  await tx.rolePermission.createMany({ data: roles.map(role => ({ roleId: role.id, permissionId: permission.id })), skipDuplicates: true });
  await tx.chatSetup.create({ data: { id: 'chat-announcements-v1' } });
  await tx.auditEvent.create({ data: { action: 'chat.announcement.defaults.install', success: true, statusCode: 200, targetType: 'chat', metadata: { version: 1 } } });
  return true;
}
export async function announcementCapability(userId: string) {
  if (!announcementsEnabled()) return { canAnnounce: false, emailMode: 'off' };
  try { await prisma.$transaction(tx => sender(tx, userId)); return { canAnnounce: true, emailMode: announcementEmailMode() }; }
  catch (e) { if (e instanceof ChatError && e.status === 403) return { canAnnounce: false, emailMode: 'off' }; throw e; }
}

async function audience(tx: Prisma.TransactionClient, personIds: string[]) {
  const updates = await tx.chatChannel.findMany({ where: { key: 'updates', area: { archivedAt: null, model: { isActive: true } } }, include: channelInclude, orderBy: { id: 'asc' } });
  const people = await tx.user.findMany({ where: { id: { in: personIds }, status: 'ACTIVE' }, include: personInclude, orderBy: { id: 'asc' } });
  const privateChats = await tx.chatStandingConversation.findMany({ where: { archivedAt: null, kind: { not: 'CREATOR' } }, include: standingInclude });
  const recipients: { userId: string; name: string; email: string; destinations: Destination[] }[] = [];
  const blockers: { name: string; reason: string }[] = [];
  for (const snapshot of people.filter(eligibleStaff)) {
    const person = await tx.user.findUnique({ where: { id: snapshot.id }, include: personInclude });
    if (!person || !eligibleStaff(person)) continue;
    const viewer = makeViewer(person);
    const destinations: Destination[] = updates.filter(c => channelAccess(viewer, c).canView).map(c => ({ id: c.id, isPrivate: false }));
    const own = privateChats.filter(c => c.subjectUserId === person.id && standingAccess(viewer, c).canView && !standingAccess(viewer, c).archived && (!c.model || c.model.isActive));
    const personal = own.find(c => c.kind === 'GENERAL_STAFF') ?? own.find(c => c.kind === 'ACCOUNTANT');
    const unavailable = person.modelAssignments.filter(a => updates.some(c => c.modelId === a.modelId) && !destinations.some(d => updates.some(c => c.id === d.id && c.modelId === a.modelId)));
    let missing = false;
    for (const assignment of unavailable) {
      const current = own.find(c => c.kind === 'STAFF' && c.assignmentId === assignment.id && c.modelId === assignment.modelId) ?? personal;
      if (current) { if (!destinations.some(d => d.id === current.id)) destinations.push({ id: current.id, isPrivate: true }); } else missing = true;
    }
    if (!destinations.length) {
      if (personal) destinations.push({ id: personal.id, isPrivate: true });
    }
    if (!singleEmailAddress(person.email)) blockers.push({ name: person.name, reason: 'A valid individual email address is required.' });
    if (!viewer.permissions.has('chat.access') || missing || !destinations.length) blockers.push({ name: person.name, reason: 'No current permitted Hub destination for every affected creator. Check assignments/private-chat setup before publishing.' });
    recipients.push({ userId: person.id, name: person.name, email: person.email, destinations: destinations.sort((a,b) => a.id.localeCompare(b.id)) });
  }
  return { updates, recipients, blockers };
}
async function plan(tx: Prisma.TransactionClient, userId: string, input: AnnouncementInput) {
  assertEnabled();
  const people = await tx.user.findMany({ where: { status: 'ACTIVE' }, select: { id: true } });
  // Quarantine takes actor/subject locks in this same order. Lock the whole
  // snapshot before loading the sender so a later-created sender never holds
  // their own lock while waiting for an earlier recipient's quarantine lock.
  const personIds = [...new Set([userId, ...people.map(p => p.id)])].sort();
  for (const id of personIds) await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'chat-access:' + id}, 0))`;
  const author = await sender(tx, userId);
  // Serialize with the existing private-conversation lifecycle synchronizer.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(62942119)`;
  const data = await audience(tx, personIds), normalized = normalize(input);
  if (!data.updates.length) data.blockers.push({ name: 'Updates channels', reason: 'No active creator Updates channel is available.' });
  if (!data.recipients.length) data.blockers.push({ name: 'Staff audience', reason: 'No eligible active staff are available.' });
  const token = hash({ ...normalized, userId, emailMode: announcementEmailMode(), updates: data.updates.map(c => c.id), recipients: data.recipients, blockers: data.blockers });
  return { ...data, normalized, author, token };
}
function previewDto(p: Awaited<ReturnType<typeof plan>>) {
  return { previewToken: p.token, ...p.normalized, staffCount: p.recipients.length, creatorCount: p.updates.length,
    privateCopyCount: new Set(p.recipients.flatMap(r => r.destinations.filter(d => d.isPrivate).map(d => d.id))).size,
    recipients: p.recipients.map(r => ({ name: r.name, privateCopies: r.destinations.filter(d => d.isPrivate).length })),
    blockers: p.blockers, emailMode: announcementEmailMode() };
}
export function previewAnnouncement(userId: string, input: AnnouncementInput) {
  return prisma.$transaction(async tx => previewDto(await plan(tx, userId, input)), { timeout: 30_000 });
}
async function publishTransaction<T>(work: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; attempt < 3; attempt++) {
    try { return await prisma.$transaction(work, { timeout: 30_000, isolationLevel: Prisma.TransactionIsolationLevel.Serializable }); }
    catch (e) { if (!(e instanceof Prisma.PrismaClientKnownRequestError) || !['P2034','P2002'].includes(e.code)) throw e; }
  }
  throw new ChatError(409, 'The announcement audience changed. Review a fresh preview before publishing.');
}
export async function publishAnnouncement(userId: string, input: AnnouncementInput & { requestId: string; previewToken: string }) {
  assertEnabled(); normalize(input);
  if (!/^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i.test(input.requestId)) throw new ChatError(400, 'A valid request reference is required.');
  return publishTransaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${'announcement:' + input.requestId}, 0))`;
    const normalized = normalize(input), inputHash = hash(normalized);
    const existing = await tx.chatAnnouncement.findUnique({ where: { requestId: input.requestId } });
    if (existing) {
      await sender(tx, userId);
      if (existing.authorUserId !== userId || existing.inputHash !== inputHash) throw new ChatError(409, 'This request reference is already in use.');
      return { id: existing.id, replayed: true };
    }
    const p = await plan(tx, userId, normalized);
    if (p.token !== input.previewToken) throw new ChatError(409, 'The audience or delivery settings changed. Review a fresh preview before publishing.');
    if (p.blockers.length) throw new ChatError(409, 'Resolve the audience warnings before publishing.');
    const announcement = await tx.chatAnnouncement.create({ data: { ...normalized, requestId: input.requestId, inputHash, authorUserId: userId, authorName: p.author.user.name } });
    const targets = new Map<string, Destination>(p.updates.map(c => [c.id, { id: c.id, isPrivate: false }]));
    p.recipients.forEach(r => r.destinations.filter(d => d.isPrivate).forEach(d => targets.set(d.id, d)));
    const posts = [...targets.values()].map(d => ({ ...d, messageId: randomUUID() }));
    await tx.chatMessage.createMany({ data: posts.map(d => ({ id: d.messageId, channelId: d.isPrivate ? null : d.id, conversationId: d.isPrivate ? d.id : null,
      authorUserId: userId, authorName: p.author.user.name, clientNonce: announcement.id, announcementKey: `announcement:${announcement.id}:${d.id}`, text: `${normalized.title}\n\n${normalized.text}` })) });
    await tx.chatAnnouncementPost.createMany({ data: posts.map(d => ({ announcementId: announcement.id, targetId: d.id, isPrivate: d.isPrivate, messageId: d.messageId })) });
    await tx.chatAnnouncementDelivery.createMany({ data: p.recipients.map(r => ({ announcementId: announcement.id, userId: r.userId, userKey: r.userId, personName: r.name, destinations: r.destinations })) });
    await tx.auditEvent.create({ data: { action: 'chat.announcement.publish', success: true, statusCode: 201, actorUserId: userId, actorLabel: p.author.user.name,
      targetType: 'chat', targetId: announcement.id, metadata: { title: normalized.title, text: normalized.text, recipients: p.recipients.map(r => r.userId), postCount: posts.length } } });
    return { id: announcement.id, replayed: false };
  });
}
export async function listAnnouncements(userId: string) {
  assertEnabled();
  return prisma.$transaction(async tx => {
    await sender(tx, userId);
    return tx.chatAnnouncement.findMany({ take: 20, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, title: true, authorName: true, createdAt: true, deliveries: { select: { status: true } } } });
  });
}
export async function announcementDetails(userId: string, id: string) {
  assertEnabled();
  return prisma.$transaction(async tx => {
    await sender(tx, userId);
    const result = await tx.chatAnnouncement.findUnique({ where: { id }, include: { deliveries: { select: { personName: true, status: true, previewEmail: true, lastError: true } }, _count: { select: { posts: true } } } });
    if (!result) throw new ChatError(404, 'Announcement not found.');
    return result;
  });
}

export async function currentAnnouncementDestination(tx: Prisma.TransactionClient, userId: string, raw: Prisma.JsonValue) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock_shared(hashtextextended(${'chat-access:' + userId}, 0))`;
  const person = await tx.user.findUnique({ where: { id: userId }, include: personInclude });
  if (!person || !eligibleStaff(person) || !singleEmailAddress(person.email)) return null;
  const viewer = makeViewer(person);
  if (!viewer.permissions.has('chat.access') || !Array.isArray(raw)) return null;
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.id !== 'string') continue;
    const channel = await tx.chatChannel.findUnique({ where: { id: entry.id }, include: channelInclude });
    if (channel && channel.area.model.isActive && channelAccess(viewer, channel).canView && !channelAccess(viewer, channel).archived) return { person, channelId: channel.id };
    const conversation = await tx.chatStandingConversation.findUnique({ where: { id: entry.id }, include: standingInclude });
    if (conversation && (!conversation.model || conversation.model.isActive) && standingAccess(viewer, conversation).canView && !standingAccess(viewer, conversation).archived) return { person, channelId: conversation.id };
  }
  return null;
}
export function buildAnnouncementEmail(recipient: { email: string; name: string }, announcement: AnnouncementInput & { authorName: string }, channelId: string): TransactionalEmail {
  if (!singleEmailAddress(recipient.email)) throw new ChatError(400, 'A single recipient email is required.');
  const base = new URL(process.env.FRONTEND_URL ?? '');
  if (!['https:', ...(process.env.NODE_ENV === 'test' ? ['http:'] : [])].includes(base.protocol) || base.username || base.password) throw new Error('A valid Hub URL is required.');
  const url = new URL('/chat', base); url.searchParams.set('conversation', channelId);
  return { to: recipient.email, subject: `XYZ Management announcement: ${announcement.title}`,
    text: `Hi ${recipient.name},\n\n${announcement.title}\n\n${announcement.text}\n\nPosted by ${announcement.authorName}.\n\nRead in the Hub:\n${url.href}`,
    html: renderBrandedTransactionalEmail({ eyebrow: 'Staff announcement', preheader: 'A new staff announcement is available.', title: announcement.title,
      greeting: `Hi ${recipient.name},`, intro: `Posted by ${announcement.authorName}.`, bodyText: announcement.text, action: { label: 'Read in the Hub', url: url.href } }) };
}
