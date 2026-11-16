import { Router, type Request, type Response, type NextFunction } from "express";
import { pipeline } from "node:stream/promises";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/access.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { ChatError, chatGrantOptions, editChatMessage, isCreatorChatEnabled, listChatAreas, listChatMembers, listChatMessages, sendChatMessage, setChatGrant } from "../services/creator-chat.js";
import { getChatMessage, getChatMessageContext, refreshChatMessages, searchChatMessages, listChatPins, setChatPin, setChatReaction } from "../services/creator-chat.js";
import { archiveChatChannel, cleanUpChatChannel, createChatChannel, renameChatChannel } from "../services/creator-chat.js";
import { deleteChatMessage, listDeletedChatMessages, getChatMessageHistory } from "../services/creator-chat.js";
import { getChatQuarantine, setChatQuarantine } from "../services/creator-chat.js";
import { listChatUnread, markChatMessagesRead } from "../services/creator-chat.js";
import { announcementCapability, previewAnnouncement, publishAnnouncement, listAnnouncements, announcementDetails } from "../services/chat-announcements.js";
import { unreadReminderHistory } from "../services/chat-unread-reminders.js";
import { unreadRemindersEnabled } from "../services/chat-unread-reminder-policy.js";
import { browserNotificationFeed } from "../services/chat-browser-notifications.js";
import { openChatAttachment } from "../services/creator-chat.js";
import { chatAttachmentDirectory, MAX_CHAT_ATTACHMENT_BYTES } from "../services/chat-attachment-policy.js";
import { chatAttachmentMetadata, uploadChatAttachment } from "../services/chat-attachments.js";
import { renderChatImagePreview } from "../services/chat-image-preview.js";
import { chatVoiceEnabled, MAX_CHAT_VOICE_SECONDS } from "../services/chat-voice.js";
import { downloadChatChannelExport } from "../services/chat-channel-export.js";
import { getChatMemberAvatar, assertChatChannelReadable } from "../services/creator-chat.js";
import { subscribeChatChanges, publishChatChange } from "../services/chat-live-events.js";
import { backgroundPushSettings, pushSubscriptionSchema, subscribeBackgroundPush, unsubscribeBackgroundPush } from "../services/hub-background-push.js";

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
    if (req.aborted || res.destroyed) return;
    if (error instanceof ChatError) return res.status(error.status).json({ error: "CHAT_ERROR", message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_CHAT_INPUT", message: "Check the submitted chat details." });
    next(error);
  }
};
router.get("/areas", run(async (req, res) => res.json({
  areas: await listChatAreas(user(req), z.string().min(1).max(100).optional().parse(req.query.retained)),
  announcements: await announcementCapability(user(req)),
  unreadReminders: { enabled: unreadRemindersEnabled() },
  ...(chatAttachmentDirectory() ? { attachments: {
    maxBytes: MAX_CHAT_ATTACHMENT_BYTES,
    ...(chatVoiceEnabled() ? { voiceMaxSeconds: MAX_CHAT_VOICE_SECONDS } : {}),
  } } : {}),
})));
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
const pushDeviceId = z.string().regex(/^[a-z0-9]{20,40}$/);
const sessionId = (req: Request) => {
  const id = (req as AuthenticatedRequest).sessionId;
  if (!id) throw new ChatError(401, "Please sign in again.");
  return id;
};
router.get("/background-push", run(async (req, res) => {
  const device = pushDeviceId.optional().parse(req.query.device);
  res.json(await backgroundPushSettings(sessionId(req), device));
}));
router.put("/background-push", run(async (req, res) => {
  res.json(await subscribeBackgroundPush(sessionId(req), pushSubscriptionSchema.parse(req.body)));
}));
router.delete("/background-push/:deviceId", run(async (req, res) => {
  await unsubscribeBackgroundPush(sessionId(req), pushDeviceId.parse(param(req, "deviceId")));
  res.json({ success: true });
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
  const channelId = param(req, "channelId");
  await renameChatChannel(user(req), channelId, channelNameSchema.parse(req.body).name);
  publishChatChange(channelId);
  res.json({ success: true });
}));
router.put("/channels/:channelId/archive", run(async (req, res) => {
  const { name } = channelNameSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const result = await archiveChatChannel(user(req), channelId, name);
  publishChatChange(channelId);
  res.json(result);
}));
const cleanupSchema = channelNameSchema.extend({ downloadId: z.string().min(1).max(100), confirmedSaved: z.literal(true) });
router.put("/channels/:channelId/cleanup", run(async (req, res) => {
  const { name, downloadId } = cleanupSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const result = await cleanUpChatChannel(user(req), channelId, name, downloadId);
  publishChatChange(channelId);
  res.json(result);
}));
const archiveExportLimit = createRateLimit({ windowMs: 60_000, max: 5, keyPrefix: "chat-archive-export", getIdentity: user });
router.get("/channels/:channelId/archive/export", archiveExportLimit, run(async (req, res) => {
  if (req.method !== "GET") return res.sendStatus(405);
  if (req.get("Sec-Fetch-Site") === "cross-site") throw new ChatError(404, "Channel not found.");
  const transfer = new AbortController();
  const cancel = () => { if (!res.writableFinished) transfer.abort(); };
  res.once("close", cancel);
  try {
    await downloadChatChannelExport(user(req), param(req, "channelId"), transfer.signal, async (fileName, body) => {
      res.attachment(fileName).type("application/zip").set({
        "X-Content-Type-Options": "nosniff",
        "Cross-Origin-Resource-Policy": "same-site",
        "Accept-Ranges": "none",
      });
      await pipeline(body, res, { signal: transfer.signal });
    });
  } finally {
    res.off("close", cancel);
  }
}));
// EventSource invalidates the open transcript as soon as a committed write
// occurs on this Backend replica. No message text, user names, or channel IDs
// are ever sent on the stream. Ordinary polling remains the fallback.
const liveLimit = createRateLimit({ windowMs: 60_000, max: 20, keyPrefix: "chat-live", getIdentity: user });
router.get("/channels/:channelId/live", liveLimit, run(async (req, res) => {
  if (req.get("Sec-Fetch-Site") === "cross-site") throw new ChatError(404, "Channel not found.");
  const channelId = param(req, "channelId");
  const viewerId = user(req);
  await assertChatChannelReadable(viewerId, channelId);
  let closed = false;
  let verifying = false;
  let queued = false;
  const checkAndSignal = async (changed: boolean) => {
    if (closed) return;
    if (verifying) { queued = queued || changed; return; }
    verifying = true;
    try {
      // A revoked role/assignment never receives further update signals.
      await assertChatChannelReadable(viewerId, channelId);
      if (!closed && !res.destroyed) {
        res.write(changed ? "event: changed\ndata: {}\n\n" : ": keepalive\n\n");
      }
    } catch {
      if (!closed) res.end();
    } finally {
      verifying = false;
      if (queued && !closed) { queued = false; void checkAndSignal(true); }
    }
  };
  const unsubscribe = subscribeChatChanges(channelId, () => { void checkAndSignal(true); });
  if (!unsubscribe) throw new ChatError(503, "Too many live viewers. Messages will still refresh normally.");
  res.status(200).set({
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no",
    "X-Content-Type-Options": "nosniff",
  });
  res.flushHeaders();
  res.write("retry: 1500\n\n");
  const heartbeat = setInterval(() => { void checkAndSignal(false); }, 20_000);
  // Force periodic reauthentication so a revoked session cannot stay open.
  const rotation = setTimeout(() => { if (!closed) res.end(); }, 55_000);
  const close = () => {
    if (closed) return;
    closed = true;
    clearInterval(heartbeat); clearTimeout(rotation);
    unsubscribe();
  };
  res.once("close", close);
  req.once("aborted", close);
}));
router.get("/channels/:channelId/messages", run(async (req, res) => {
  const before = req.query.before;
  if (before !== undefined && (typeof before !== "string" || before.length > 100)) throw new ChatError(400, "The message cursor is invalid.");
  res.json(await listChatMessages(user(req), param(req, "channelId"), before));
}));
router.get("/channels/:channelId/members", run(async (req, res) => res.json({ members: await listChatMembers(user(req), param(req, "channelId")) })));
const memberAvatarLimit = createRateLimit({ windowMs: 60_000, max: 120, keyPrefix: "chat-member-avatar", getIdentity: user });
router.get("/channels/:channelId/members/:memberId/avatar", memberAvatarLimit, run(async (req, res) => {
  const channelId = param(req, "channelId"), memberId = param(req, "memberId");
  // The service checks both current channel access and this member's access
  // before reading the image. Never broaden People Management permissions.
  const avatar = await getChatMemberAvatar(user(req), channelId, memberId);
  if (!avatar?.avatarImage || !avatar.avatarMimeType) throw new ChatError(404, "Profile picture not found.");
  const image = Buffer.from(avatar.avatarImage);
  res.status(200).type(avatar.avatarMimeType).set({
    "Content-Length": String(image.length),
    "Cache-Control": "no-store",
    "Cross-Origin-Resource-Policy": "same-site",
    "X-Content-Type-Options": "nosniff",
  }).send(image);
}));
router.post("/channels/:channelId/messages", run(async (req, res) => {
  const input = sendSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const message = await sendChatMessage(user(req), channelId, input.text, input.clientNonce, input.replyToId);
  publishChatChange(channelId);
  res.status(201).json({ message });
}));
router.post("/channels/:channelId/files", run(async (req, res) => {
  const directory = chatAttachmentDirectory();
  if (!directory) throw new ChatError(404, "Attachments are unavailable.");
  if (!req.is("application/octet-stream") || (req.get("Content-Encoding") ?? "identity").toLowerCase() !== "identity") {
    throw new ChatError(415, "Upload the original file.");
  }
  const voiceHeader = req.get("X-XYZ-Voice-Message");
  if (voiceHeader !== undefined && voiceHeader !== "true") throw new ChatError(400, "Invalid voice message upload.");
  const voice = voiceHeader === "true";
  if (voice && !chatVoiceEnabled()) throw new ChatError(404, "Voice recording is unavailable.");
  const metadata = chatAttachmentMetadata(
    req.get("X-XYZ-File-Name") ?? "", req.get("X-XYZ-File-Size") ?? "", req.get("X-XYZ-Chat-Nonce") ?? "",
    voice,
  );
  const length = req.get("Content-Length");
  if (length !== undefined && Number(length) !== metadata.byteSize) {
    throw new ChatError(400, "The upload size did not match the selected file.");
  }
  const channelId = param(req, "channelId");
  const message = await uploadChatAttachment(req, directory, user(req), channelId, metadata);
  publishChatChange(channelId);
  res.status(201).json({ message });
}));
const downloadLimit = createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "chat-files", getIdentity: user });
const streamAttachment = (purpose: "download" | "voice") => run(async (req, res) => {
  if (req.method !== "GET") return res.sendStatus(405);
  const directory = chatAttachmentDirectory();
  if (!directory || req.get("Sec-Fetch-Site") === "cross-site") throw new ChatError(404, "Attachment not found.");
  const { handle, fileName, byteSize } = await openChatAttachment(user(req), param(req, "channelId"), param(req, "messageId"), directory, purpose);
  try {
    if (purpose === "download") res.attachment(fileName).type("application/octet-stream");
    else res.type("audio/wav");
    res.set({
      "Content-Length": String(byteSize),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-site",
      "Accept-Ranges": "none",
    });
    await pipeline(handle.createReadStream(), res);
  } finally {
    await handle.close();
  }
});
router.get("/channels/:channelId/messages/:messageId/file", downloadLimit, streamAttachment("download"));
router.get("/channels/:channelId/messages/:messageId/voice", downloadLimit, streamAttachment("voice"));
const previewLimit = createRateLimit({ windowMs: 60_000, max: 120, keyPrefix: "chat-file-previews", getIdentity: user });
router.get("/channels/:channelId/messages/:messageId/preview", previewLimit, run(async (req, res) => {
  if (req.method !== "GET") return res.sendStatus(405);
  const directory = chatAttachmentDirectory();
  if (!directory || req.get("Sec-Fetch-Site") === "cross-site") throw new ChatError(404, "Image preview not found.");
  const { handle } = await openChatAttachment(user(req), param(req, "channelId"), param(req, "messageId"), directory, "preview");
  try {
    const thumbnail = await renderChatImagePreview(handle);
    if (!thumbnail) throw new ChatError(404, "No preview is available for this file.");
    res.type("image/webp").set({
      "Content-Length": String(thumbnail.length),
      "X-Content-Type-Options": "nosniff",
      "Cross-Origin-Resource-Policy": "same-site",
    }).end(thumbnail);
  } finally {
    await handle.close();
  }
}));
router.patch("/channels/:channelId/messages/:messageId", run(async (req, res) => {
  const input = editSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const message = await editChatMessage(user(req), channelId, param(req, "messageId"), input.text, input.version);
  publishChatChange(channelId);
  res.json({ message });
}));
router.get("/channels/:channelId/grants", run(async (req, res) => res.json(await chatGrantOptions(user(req), param(req, "channelId")))));
router.put("/channels/:channelId/grants", run(async (req, res) => {
  const channelId = param(req, "channelId");
  await setChatGrant(user(req), channelId, grantSchema.parse(req.body));
  publishChatChange(channelId);
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
router.get("/channels/:channelId/messages/:messageId/context", run(async (req, res) => {
  res.json(await getChatMessageContext(user(req), param(req, "channelId"), param(req, "messageId")));
}));
router.get("/channels/:channelId/messages/:messageId", run(async (req, res) => res.json({ message: await getChatMessage(user(req), param(req, "channelId"), param(req, "messageId")) })));
router.get("/channels/:channelId/deleted", run(async (req, res) => res.json(await listDeletedChatMessages(user(req), param(req, "channelId"), pageSchema.parse(req.query).before))));
router.get("/channels/:channelId/messages/:messageId/history", run(async (req, res) => res.json(await getChatMessageHistory(user(req), param(req, "channelId"), param(req, "messageId"), pageSchema.parse(req.query).before))));
router.delete("/channels/:channelId/messages/:messageId", run(async (req, res) => {
  const input = deleteSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const result = await deleteChatMessage(user(req), channelId, param(req, "messageId"), input.version, input.reason);
  publishChatChange(channelId);
  res.json(result);
}));
router.put("/channels/:channelId/messages/:messageId/reaction", run(async (req, res) => {
  const input = reactionSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const message = await setChatReaction(user(req), channelId, param(req, "messageId"), input.emoji, input.active);
  publishChatChange(channelId);
  res.json({ message });
}));
router.put("/channels/:channelId/messages/:messageId/pin", run(async (req, res) => {
  const input = pinSchema.parse(req.body);
  const channelId = param(req, "channelId");
  const message = await setChatPin(user(req), channelId, param(req, "messageId"), input.pinned, input.version);
  publishChatChange(channelId);
  res.json({ message });
}));
export default router;
