import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/access.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { ChatError, chatGrantOptions, editChatMessage, isCreatorChatEnabled, listChatAreas, listChatMembers, listChatMessages, sendChatMessage, setChatGrant } from "../services/creator-chat.js";
import { getChatMessage, refreshChatMessages, searchChatMessages, listChatPins, setChatPin, setChatReaction } from "../services/creator-chat.js";
import { createChatChannel, renameChatChannel } from "../services/creator-chat.js";
import { deleteChatMessage, listDeletedChatMessages, getChatMessageHistory } from "../services/creator-chat.js";
import { getChatQuarantine, setChatQuarantine } from "../services/creator-chat.js";
import { listChatUnread, markChatMessagesRead } from "../services/creator-chat.js";
import { announcementCapability, previewAnnouncement, publishAnnouncement, listAnnouncements, announcementDetails } from "../services/chat-announcements.js";
import { unreadReminderHistory } from "../services/chat-unread-reminders.js";
import { unreadRemindersEnabled } from "../services/chat-unread-reminder-policy.js";
import { browserNotificationFeed } from "../services/chat-browser-notifications.js";

const router = Router();
router.use((_req, res, next) => isCreatorChatEnabled() ? next() : res.sendStatus(404));
router.use(requireAuth);
router.use((req, res, next) => {
  res.setHeader("Cache-Control", "no-store");
  next();
});
const writeLimit = createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "chat-write", getIdentity: (req) => (req as AuthenticatedRequest).userId! });
router.use((req, res, next) => req.method === "GET" ? next() : writeLimit(req, res, next));
const textSchema = z.string().trim().min(1).max(8000);
const channelNameSchema = z.object({ name: z.string().trim().min(1).max(80) }).strict();
const sendSchema = z.object({ text: textSchema, clientNonce: z.string().regex(/^[\w-]{8,80}$/), replyToId: z.string().min(1).max(100).optional() }).strict();
const reactionSchema = z.object({ emoji: z.string().min(1).max(16), active: z.boolean() }).strict();
const pinSchema = z.object({ pinned: z.boolean(), version: z.number().int().min(0) }).strict();
const searchSchema = z.object({ q: z.string().trim().min(2).max(120), channelId: z.string().min(1).max(100).optional(), before: z.string().min(1).max(100).optional() }).strict();
const pageSchema = z.object({ before: z.string().min(1).max(100).optional() }).strict();
const editSchema = z.object({ text: textSchema, version: z.number().int().min(1) }).strict();
const deleteSchema = z.object({ version: z.number().int().min(1), reason: z.string().trim().min(1).max(1000) }).strict();
const grantSchema = z.object({ roleId: z.string().min(1).optional(), personId: z.string().min(1).optional(), canView: z.boolean(), canPost: z.boolean() }).strict();
const param = (req: Request, key: string) => String(req.params[key] ?? "");
const user = (req: Request) => (req as AuthenticatedRequest).userId!;
const run = (action: (req: Request, res: Response) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await action(req, res); }
  catch (error) {
    if (error instanceof ChatError) return res.status(error.status).json({ error: "CHAT_ERROR", message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_CHAT_INPUT", message: "Check the submitted chat details." });
    next(error);
  }
};
router.get("/areas", run(async (req, res) => res.json({ areas: await listChatAreas(user(req)), announcements: await announcementCapability(user(req)), unreadReminders: { enabled: unreadRemindersEnabled() } })));
router.get("/unread-reminders", run(async (req, res) => res.json(await unreadReminderHistory(user(req)))));
const browserAlertLimit = createRateLimit({ windowMs: 60_000, max: 120, keyPrefix: 'chat-browser-alerts', getIdentity: req => user(req) });
router.get('/browser-notifications', browserAlertLimit, run(async (req, res) => {
  const query = z.object({ after: z.string().datetime({ offset: true }).optional() }).strict().parse(req.query);
  res.json(await browserNotificationFeed(user(req), query.after));
}));
router.post('/browser-notifications/check', run(async (req, res) => {
  const input = z.object({ after: z.string().datetime({ offset: true }), ids: z.array(z.string().min(1).max(100)).min(1).max(50) }).strict().parse(req.body);
  res.json(await browserNotificationFeed(user(req), input.after, input.ids));
}));
const announcementSchema = z.object({ title: z.string().trim().min(1).max(120).regex(/^[^\r\n]+$/), text: z.string().trim().min(1).max(7800) }).strict();
router.get("/announcements", run(async (req, res) => res.json({ announcements: await listAnnouncements(user(req)) })));
router.get("/announcements/:announcementId", run(async (req, res) => res.json({ announcement: await announcementDetails(user(req), param(req, 'announcementId')) })));
router.post("/announcements/preview", run(async (req, res) => res.json(await previewAnnouncement(user(req), announcementSchema.parse(req.body)))));
router.post("/announcements", run(async (req, res) => {
  const input = announcementSchema.extend({ requestId: z.string().uuid(), previewToken: z.string().regex(/^[a-f0-9]{64}$/) }).strict().parse(req.body);
  res.status(201).json(await publishAnnouncement(user(req), input));
}));
router.get("/unread", run(async (req, res) => res.json(await listChatUnread(user(req)))));
const readSchema = z.union([
  z.object({ messageIds: z.array(z.string().min(1).max(100)).min(1).max(100) }).strict(),
  z.object({ throughMessageId: z.string().min(1).max(100) }).strict(),
]);
router.put("/channels/:channelId/read", run(async (req, res) => res.json(await markChatMessagesRead(user(req), param(req, "channelId"), readSchema.parse(req.body)))));
const quarantineSchema = z.object({ active: z.boolean(), version: z.number().int().min(0), assignmentId: z.string().min(1).max(100).nullable(), reason: z.string().trim().min(1).max(1000), requestId: z.string().uuid() }).strict();
router.get("/areas/:modelId/quarantines/:userId", run(async (req, res) => res.json(await getChatQuarantine(user(req), param(req, "modelId"), param(req, "userId")))));
router.put("/areas/:modelId/quarantines/:userId", run(async (req, res) => res.json(await setChatQuarantine(user(req), param(req, "modelId"), param(req, "userId"), quarantineSchema.parse(req.body)))));
router.post("/areas/:modelId/channels", run(async (req, res) => {
  const input = channelNameSchema.parse(req.body);
  res.status(201).json({ channel: await createChatChannel(user(req), param(req, "modelId"), input.name) });
}));
router.patch("/channels/:channelId", run(async (req, res) => {
  await renameChatChannel(user(req), param(req, "channelId"), channelNameSchema.parse(req.body).name);
  res.json({ success: true });
}));
router.get("/channels/:channelId/messages", run(async (req, res) => {
  const before = req.query.before;
  if (before !== undefined && (typeof before !== "string" || before.length > 100)) throw new ChatError(400, "The message cursor is invalid.");
  res.json(await listChatMessages(user(req), param(req, "channelId"), before));
}));
router.get("/channels/:channelId/members", run(async (req, res) => res.json({ members: await listChatMembers(user(req), param(req, "channelId")) })));
router.post("/channels/:channelId/messages", run(async (req, res) => {
  const input = sendSchema.parse(req.body);
  res.status(201).json({ message: await sendChatMessage(user(req), param(req, "channelId"), input.text, input.clientNonce, input.replyToId) });
}));
router.patch("/channels/:channelId/messages/:messageId", run(async (req, res) => {
  const input = editSchema.parse(req.body);
  res.json({ message: await editChatMessage(user(req), param(req, "channelId"), param(req, "messageId"), input.text, input.version) });
}));
router.get("/channels/:channelId/grants", run(async (req, res) => res.json(await chatGrantOptions(user(req), param(req, "channelId")))));
router.put("/channels/:channelId/grants", run(async (req, res) => {
  await setChatGrant(user(req), param(req, "channelId"), grantSchema.parse(req.body));
  res.json({ success: true });
}));
const searchLimit = createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: "chat-search", getIdentity: (req) => (req as AuthenticatedRequest).userId! });
router.get("/search", searchLimit, run(async (req, res) => {
  const input = searchSchema.parse(req.query);
  res.json(await searchChatMessages(user(req), input.q, input.channelId, input.before));
}));
router.get("/channels/:channelId/pins", run(async (req, res) => res.json(await listChatPins(user(req), param(req, "channelId"), pageSchema.parse(req.query).before))));
router.get("/channels/:channelId/messages/refresh", run(async (req, res) => {
  const input = z.object({ ids: z.string().min(1).max(10100) }).strict().parse(req.query);
  res.json(await refreshChatMessages(user(req), param(req, "channelId"), input.ids.split(",")));
}));
router.get("/channels/:channelId/messages/:messageId", run(async (req, res) => res.json({ message: await getChatMessage(user(req), param(req, "channelId"), param(req, "messageId")) })));
router.get("/channels/:channelId/deleted", run(async (req, res) => res.json(await listDeletedChatMessages(user(req), param(req, "channelId"), pageSchema.parse(req.query).before))));
router.get("/channels/:channelId/messages/:messageId/history", run(async (req, res) => res.json(await getChatMessageHistory(user(req), param(req, "channelId"), param(req, "messageId"), pageSchema.parse(req.query).before))));
router.delete("/channels/:channelId/messages/:messageId", run(async (req, res) => {
  const input = deleteSchema.parse(req.body);
  res.json(await deleteChatMessage(user(req), param(req, "channelId"), param(req, "messageId"), input.version, input.reason));
}));
router.put("/channels/:channelId/messages/:messageId/reaction", run(async (req, res) => {
  const input = reactionSchema.parse(req.body);
  res.json({ message: await setChatReaction(user(req), param(req, "channelId"), param(req, "messageId"), input.emoji, input.active) });
}));
router.put("/channels/:channelId/messages/:messageId/pin", run(async (req, res) => {
  const input = pinSchema.parse(req.body);
  res.json({ message: await setChatPin(user(req), param(req, "channelId"), param(req, "messageId"), input.pinned, input.version) });
}));
export default router;
