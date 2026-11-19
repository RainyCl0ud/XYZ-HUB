import assert from "node:assert/strict";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { loadSession } from "../src/middleware/session-auth.js";
import { createSession } from "../src/services/session.js";
import clock from "../src/routes/clock.js";

async function main() {
  const db = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(db.hostname, "127.0.0.1"); assert.equal(db.port, "55494"); assert.equal(db.pathname, "/block2_ux_20261119");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!process.env.RAILWAY_PROJECT_ID);
  process.env.BLOCK2_CLOCK_ENABLED = "true";
  const users: string[] = [];
  const roles = new Map((await prisma.role.findMany()).map(role => [role.systemKey, role.id]));
  async function person(key: string) {
    const user = await prisma.user.create({ data: { name: `Live ${key}`, email: `live-${randomUUID()}@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get(key)! } } } });
    users.push(user.id);
    const session = await createSession({ userId: user.id, expiresAt: new Date(Date.now() + 60_000) });
    return { Cookie: `xyz_session=${session.token}`, "Content-Type": "application/json" };
  }
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/clock", clock);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api/clock`;
  const stream = new AbortController();
  try {
    const owner = await person("OWNER"), staff = await person("CHATTER");
    assert.equal((await fetch(`${base}/overview/live`)).status, 401);
    assert.equal((await fetch(`${base}/overview/live`, { headers: staff })).status, 403);
    console.log("PASS 1: Live attendance requires a current sign-in and explicit overview permission.");
    const response = await fetch(`${base}/overview/live`, { headers: owner, signal: stream.signal });
    assert.equal(response.status, 200); assert.match(response.headers.get("content-type")!, /text\/event-stream/);
    const reader = response.body!.getReader();
    assert.match(new TextDecoder().decode((await reader.read()).value), /event: changed/);
    const before = await fetch(`${base}/owner/overview`, { headers: owner }).then(r => r.json());
    assert.ok(before.offShiftStaff.some((person: { roleNames: string[] }) => person.roleNames.includes("Chatter")));
    const signal = reader.read();
    const result = await fetch(`${base}/in`, { headers: staff, method: "POST", body: JSON.stringify({ requestId: randomUUID() }) });
    assert.equal(result.status, 200);
    let timer: ReturnType<typeof setTimeout>;
    const next = await Promise.race([signal, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error("No immediate attendance update")), 2000); })]).finally(() => clearTimeout(timer!));
    const payload = new TextDecoder().decode(next.value);
    assert.equal(payload, "event: changed\ndata: {}\n\n");
    const after = await fetch(`${base}/owner/overview`, { headers: owner }).then(r => r.json());
    assert.equal(after.counts.clockedInStaff, before.counts.clockedInStaff + 1);
    console.log("PASS 2: A committed clock-in immediately signals another signed-in browser without exposing employee data on the stream; the scoped refresh returns the new roster.");
    stream.abort();
  } finally {
    stream.abort(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    await prisma.clockShift.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
