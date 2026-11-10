import { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import { assertChatStagingTarget } from "./chat-staging-target.js";

const batchSize = 100;
const intervalMs = 15_000;

function auditDestination() {
  try {
    const source = new URL(process.env.DATABASE_URL ?? "");
    const destination = new URL(process.env.HUB_PROTECTED_AUDIT_DATABASE_URL ?? "");
    if ((source.hostname === destination.hostname && (source.port || "5432") === (destination.port || "5432")) ||
        source.searchParams.has("host") || destination.username !== "xyz_hub_audit_writer" ||
        !["postgres:", "postgresql:"].includes(destination.protocol) || destination.searchParams.has("host")) return null;
    destination.searchParams.set("sslmode", "require");
    destination.searchParams.set("sslaccept", "strict");
    destination.searchParams.set("connection_limit", "1");
    destination.searchParams.set("connect_timeout", "5");
    destination.searchParams.set("socket_timeout", "8");
    return new PrismaClient({ datasourceUrl: destination.toString() });
  } catch {
    return null;
  }
}

async function copyPendingAuditEvents(destination: PrismaClient) {
  const events = await prisma.auditEvent.findMany({
    where: { protectedAt: null },
    orderBy: [{ occurredAt: "asc" }, { id: "asc" }],
    omit: { protectedAt: true },
    take: batchSize,
  });
  if (!events.length) return;

  await destination.$transaction(async (tx) => {
    const [{ appendOnly }] = await tx.$queryRaw<{ appendOnly: boolean }[]>`
      SELECT current_user = 'xyz_hub_audit_writer'
        AND NOT has_schema_privilege('hub_protected_audit', 'CREATE')
        AND NOT has_any_column_privilege('hub_protected_audit.events', 'SELECT,UPDATE')
        AND NOT has_table_privilege('hub_protected_audit.events', 'DELETE,TRUNCATE,TRIGGER')
        AS "appendOnly"`;
    if (!appendOnly) throw new Error("Protected audit writer has excessive privileges.");

    const values = events.map(event =>
      Prisma.sql`(${event.id}, ${event.occurredAt.toISOString()}::timestamptz, ${JSON.stringify(event)}::jsonb)`);
    await tx.$executeRaw`
      INSERT INTO hub_protected_audit.events (id, occurred_at, event)
      VALUES ${Prisma.join(values)}
      ON CONFLICT DO NOTHING`;
  }, { timeout: 10_000 });

  // Keep the same IDs across retries, including a restart after the remote commit.
  await prisma.auditEvent.updateMany({
    where: { id: { in: events.map(event => event.id) }, protectedAt: null },
    data: { protectedAt: new Date() },
  });
}

export function startProtectedAuditWorker() {
  if (process.env.BLOCK2_PROTECTED_AUDIT_ENABLED !== "true") return;
  try {
    if (process.env.RAILWAY_PROJECT_ID || process.env.RAILWAY_ENVIRONMENT_ID || process.env.NODE_ENV === "production") {
      assertChatStagingTarget(process.env);
    } else if (process.env.NODE_ENV !== "test") {
      return;
    }
  } catch {
    console.warn("Protected audit copying is restricted to the approved staging environment.");
    return;
  }
  const destination = auditDestination();
  if (!destination || !["database", "postgres", "postgresql"].includes(process.env.AUDIT_STORE_MODE?.trim().toLowerCase() ?? "")) {
    console.warn("Protected audit copying requires database audit mode and a separate audit writer.");
    return;
  }

  let running = false;
  let unavailable = false;
  const copy = async () => {
    if (running) return;
    running = true;
    try {
      await copyPendingAuditEvents(destination);
      if (unavailable) console.info("Protected audit copying resumed.");
      unavailable = false;
    } catch {
      if (!unavailable) console.error("Protected audit copying failed. Pending records will retry.");
      unavailable = true;
    } finally {
      running = false;
    }
  };
  void copy();
  setInterval(copy, intervalMs).unref();
}
