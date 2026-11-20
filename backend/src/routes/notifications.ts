import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/access.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { isClockEnabled } from "../services/clock.js";
import { isCreatorChatEnabled } from "../services/creator-chat.js";
import { NOTIFICATION_KEY, NotificationError, listNotifications, markAllNotificationsRead, markNotificationRead, notificationSummary } from "../services/hub-notifications.js";

const router = Router();
// The bell exists only where Block 2 Chat or Clock is switched on.
router.use((_req, res, next) => isCreatorChatEnabled() || isClockEnabled() ? next() : res.sendStatus(404));
router.use(requireAuth);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const writeLimit = createRateLimit({ windowMs: 60_000, max: 60, keyPrefix: "notification-write", getIdentity: (req) => (req as AuthenticatedRequest).userId! });
router.use((req, res, next) => req.method === "GET" ? next() : writeLimit(req, res, next));

const listQuery = z.object({ filter: z.enum(["all", "unread"]).default("all"), before: z.string().min(1).max(200).optional() }).strict();
const readBody = z.object({ key: z.string().regex(NOTIFICATION_KEY) }).strict();
const empty = z.object({}).strict();
const run = (fn: (req: Request, res: Response, userId: string) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res, (req as AuthenticatedRequest).userId!); }
  catch (error) {
    if (error instanceof NotificationError) return res.status(error.status).json({ error: "NOTIFICATION_ERROR", message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_NOTIFICATION_INPUT", message: "Choose a notification from your list." });
    next(error);
  }
};

router.get("/", run(async (req, res, userId) => {
  const query = listQuery.parse(req.query);
  res.json(await listNotifications(userId, query.filter, query.before));
}));
router.get("/summary", run(async (_req, res, userId) => { res.json(await notificationSummary(userId)); }));
router.post("/read", run(async (req, res, userId) => { res.json(await markNotificationRead(userId, readBody.parse(req.body ?? {}).key)); }));
router.post("/read-all", run(async (req, res, userId) => { empty.parse(req.body ?? {}); res.json(await markAllNotificationsRead(userId)); }));

export default router;
