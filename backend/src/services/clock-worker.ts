import { prisma } from "../lib/prisma.js";
import { clockDatabaseNow } from "./clock-policy.js";
import { reconcileClockShift } from "./clock-alerts.js";
import { CHAT_STAGING_PROJECT_ID, CHAT_STAGING_ENVIRONMENT_ID } from "./chat-staging-target.js";

export function clockWorkerTargetAllowed(environment: Readonly<Record<string, string | undefined>> = process.env) {
  if (environment.BLOCK2_CLOCK_ENABLED !== "true" || /^prod(uction)?$/i.test(environment.RAILWAY_ENVIRONMENT_NAME ?? "") || environment.RAILWAY_ENVIRONMENT_ID === "2b6bb1b6-a75a-45b1-98cf-f98e79a965a4") return false;
  if (environment.RAILWAY_PROJECT_ID || environment.RAILWAY_ENVIRONMENT_ID) return environment.RAILWAY_PROJECT_ID === CHAT_STAGING_PROJECT_ID && environment.RAILWAY_ENVIRONMENT_ID === CHAT_STAGING_ENVIRONMENT_ID;
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(environment.DATABASE_URL ?? "").hostname); } catch { return false; }
}

/** Bounded polling, database-backed due times, no in-memory scheduled jobs.
 * A restart catches up; replicas/manual requests lock the same person row.
 * SKIP LOCKED leaves a busy person for the next pass instead of blocking them. */
export async function runClockSweep() {
  if (!clockWorkerTargetAllowed()) return { processed: 0, failed: 0 };
  const candidates = await prisma.$queryRaw<{ id: string; userId: string | null }[]>`
    SELECT s."id", s."userId" FROM "ClockShift" s
    WHERE s."endedAt" IS NULL AND (
      (s."startedAt" <= clock_timestamp() - interval '14 hours' AND NOT EXISTS
        (SELECT 1 FROM "ClockAlert" a WHERE a."eventKey" = s."id" || ':OPEN_SHIFT'))
      OR EXISTS (SELECT 1 FROM "ClockBreak" b WHERE b."shiftId" = s."id" AND b."endedAt" IS NULL AND (
        b."startedAt" <= clock_timestamp() - CASE WHEN b."kind" = 'MEAL' THEN interval '60 minutes' ELSE interval '30 minutes' END
        OR (b."startedAt" <= clock_timestamp() - CASE WHEN b."kind" = 'MEAL' THEN interval '35 minutes' ELSE interval '20 minutes' END
          AND NOT EXISTS (SELECT 1 FROM "ClockAlert" a WHERE a."eventKey" = b."id" || ':BREAK_REMINDER'))
      ))) ORDER BY s."startedAt", s."id" LIMIT 100`;
  let processed = 0, failed = 0;
  for (const candidate of candidates) {
    try {
      await prisma.$transaction(async (tx) => {
        if (candidate.userId) {
          const locked = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "User" WHERE "id" = ${candidate.userId} FOR UPDATE SKIP LOCKED`;
          if (!locked.length) return;
        }
        const lockedShift = await tx.$queryRaw<{ id: string }[]>`SELECT "id" FROM "ClockShift" WHERE "id" = ${candidate.id} FOR UPDATE SKIP LOCKED`;
        if (!lockedShift.length) return;
        const shift = await tx.clockShift.findUnique({ where: { id: candidate.id }, include: { breaks: true } });
        if (!shift || shift.endedAt) return;
        await reconcileClockShift(tx, shift, await clockDatabaseNow(tx)); processed++;
      }, { timeout: 10_000 });
    } catch { failed++; } // No connection strings or person records in logs.
  }
  if (failed) console.error(`Attendance background check: ${failed} item(s) will be retried.`);
  return { processed, failed };
}
export function startClockWorker() {
  if (!clockWorkerTargetAllowed()) return () => {};
  let stopped = false, running = false;
  const tick = async () => {
    if (stopped || running) return;
    running = true;
    try { await runClockSweep(); }
    catch { console.error("Attendance background check unavailable; it will retry."); }
    finally { running = false; }
  };
  const initial = setTimeout(() => void tick(), 1000); initial.unref();
  const interval = setInterval(() => void tick(), 15_000); interval.unref();
  console.log("Staging attendance background checks enabled (15-second interval).");
  return () => { stopped = true; clearTimeout(initial); clearInterval(interval); };
}
