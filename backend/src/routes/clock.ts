import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { requireAuth, type AuthenticatedRequest } from "../middleware/access.js";
import { createRateLimit } from "../middleware/rate-limit.js";
import { ClockError, clockIn, clockOut, endBreak, getOwnClock, isClockEnabled, startBreak } from "../services/clock.js";
import { listClockAlerts, markClockAlertRead } from "../services/clock-alerts.js";
import { cancelClockCorrection, correctionDecisionSchema, correctionRequestSchema, getClockCorrection, listClockCorrections, requestClockCorrection, reviewClockCorrection } from "../services/clock-corrections.js";
const router = Router();
router.use((_req, res, next) => isClockEnabled() ? next() : res.sendStatus(404));
router.use(requireAuth);
router.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
const limit = createRateLimit({ windowMs: 60_000, max: 30, keyPrefix: "clock-write", getIdentity: (req) => (req as AuthenticatedRequest).userId! });
router.use((req, res, next) => req.method === "GET" ? next() : limit(req, res, next));
const requestId = z.string().uuid();
const start = z.object({ requestId }).strict();
const pause = z.object({ requestId, kind: z.enum(["SHORT_ONE", "SHORT_TWO", "MEAL"]) }).strict();
const empty = z.object({}).strict();
const id = (req: Request, key: string) => String(req.params[key] ?? "");
const run = (fn: (req: Request, res: Response, userId: string) => Promise<unknown>) => async (req: Request, res: Response, next: NextFunction) => {
  try { await fn(req, res, (req as AuthenticatedRequest).userId!); }
  catch (error) {
    if (error instanceof ClockError) return res.status(error.status).json({ error: "CLOCK_ERROR", message: error.message });
    if (error instanceof z.ZodError) return res.status(400).json({ error: "INVALID_CLOCK_INPUT", message: "Check the submitted attendance details. Use valid times and include a reason for corrections." });
    next(error);
  }
};
router.get("/corrections", run(async (req, res, userId) => {
  const query = z.object({ scope: z.enum(["mine", "review"]).optional(), filter: z.enum(["pending", "all"]).optional(), before: z.string().min(1).max(100).optional() }).strict().parse(req.query);
  res.json(await listClockCorrections(userId, query.scope, query.filter, query.before));
}));
router.get("/corrections/:correctionId", run(async (req, res, userId) => {
  const correctionId = z.string().min(1).max(100).parse(id(req, "correctionId"));
  res.json(await getClockCorrection(userId, correctionId));
}));
router.post("/corrections", run(async (req, res, userId) => {
  res.status(201).json(await requestClockCorrection(userId, correctionRequestSchema.parse(req.body)));
}));
router.post("/corrections/:correctionId/review", run(async (req, res, userId) => {
  const input = correctionDecisionSchema.parse(req.body);
  res.json(await reviewClockCorrection(userId, id(req, "correctionId"), input.decision, input.note));
}));
router.post("/corrections/:correctionId/cancel", run(async (req, res, userId) => {
  empty.parse(req.body); res.json(await cancelClockCorrection(userId, id(req, "correctionId")));
}));
router.get("/alerts", run(async (req, res, userId) => {
  const query = z.object({ filter: z.enum(["unread", "all"]).optional(), before: z.string().min(1).max(100).optional() }).strict().parse(req.query);
  res.json(await listClockAlerts(userId, query.filter, query.before));
}));
router.post("/alerts/:alertId/read", run(async (req, res, userId) => {
  empty.parse(req.body); res.json(await markClockAlertRead(userId, id(req, "alertId")));
}));
router.get("/me", run(async (req, res, userId) => {
  const before = req.query.before;
  if (Object.keys(req.query).some((key) => key !== "before") || (before !== undefined && (typeof before !== "string" || before.length > 100))) throw new ClockError(400, "Invalid attendance history request.");
  res.json(await getOwnClock(userId, before));
}));
router.post("/in", run(async (req, res, userId) => res.json(await clockIn(userId, start.parse(req.body)))));
router.post("/shifts/:shiftId/out", run(async (req, res, userId) => { empty.parse(req.body); res.json(await clockOut(userId, id(req, "shiftId"))); }));
router.post("/shifts/:shiftId/breaks", run(async (req, res, userId) => res.json(await startBreak(userId, id(req, "shiftId"), pause.parse(req.body)))));
router.post("/shifts/:shiftId/breaks/:breakId/end", run(async (req, res, userId) => { empty.parse(req.body); res.json(await endBreak(userId, id(req, "shiftId"), id(req, "breakId"))); }));
export default router;
