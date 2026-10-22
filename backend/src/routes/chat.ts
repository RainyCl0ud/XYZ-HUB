import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/access.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { ChatError, chatGrantOptions, editChatMessage, isCreatorChatEnabled, listChatAreas, listChatMembers, listChatMessages, sendChatMessage, setChatGrant } from "../services/creator-chat.js";
import { createChatChannel, renameChatChannel } from "../services/creator-chat.js";

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
const sendSchema = z.object({ text: textSchema, clientNonce: z.string().regex(/^[\w-]{8,80}$/) }).strict();
const editSchema = z.object({ text: textSchema, version: z.number().int().min(1) }).strict();
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
router.get("/areas", run(async (req, res) => res.json({ areas: await listChatAreas(user(req)) })));
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
  res.status(201).json({ message: await sendChatMessage(user(req), param(req, "channelId"), input.text, input.clientNonce) });
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
export default router;
