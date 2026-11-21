import "dotenv/config";
import assert from "node:assert/strict";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import express from "express";
import cookieParser from "cookie-parser";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/services/password.js";
import {
  base32Decode, base32Encode, confirmAuthenticatorSetup, decryptSecret, encryptSecret, matchTotp, startAuthenticatorSetup, stepAt, totpAt, AuthenticatorError,
} from "../src/services/authenticator.js";
import { getAccessContext } from "../src/services/access-control.js";
import { resetPersonTwoFactor } from "../src/services/people-two-factor.js";
import { presentAuditEvents } from "../src/services/audit-presentation.js";
import { loadSession } from "../src/middleware/session-auth.js";
import authRoutes from "../src/routes/auth.js";

async function main() {
  const url = new URL(process.env.DATABASE_URL ?? "");
  assert.equal(url.hostname, "127.0.0.1"); assert.equal(url.port, "55484"); assert.equal(url.pathname, "/block2_authenticator_20261121");
  assert.equal(process.env.NODE_ENV, "test"); assert.ok(!Object.keys(process.env).some((key) => key.startsWith("RAILWAY_")), "Local tests must not inherit Railway metadata.");
  Object.assign(process.env, { TWO_FACTOR_DELIVERY_MODE: "console", TWO_FACTOR_CODE_SECRET: "fictional-local-test-secret-not-used-anywhere" });
  let passed = 0; const pass = (s: string) => console.log(`PASS ${++passed}: ${s}`);
  // Capture console-mode emailed codes without printing them.
  const realLog = console.log; let emailed: string[] = [];
  console.log = (...args: unknown[]) => { const text = args.join(" "); const m = /^Code: (\d{6})$/.exec(text); if (m) emailed.push(m[1]); else if (!/2FA|====|^Email:|^Expires:|^$/.test(text)) realLog(...args); };
  const prefix = `authenticator-${Date.now()}-${process.pid}`, users: string[] = [];
  const app = express(); app.use(express.json(), cookieParser(), loadSession); app.use("/api/auth", authRoutes);
  const server = app.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/auth`;
  const post = (path: string, body: unknown, cookie?: string) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", ...(cookie ? { Cookie: cookie } : {}) }, body: JSON.stringify(body) });
  try {
    // RFC 6238 SHA-1 test vectors (last six digits of the eight-digit values).
    const rfc = Buffer.from("12345678901234567890");
    for (const [time, code] of [[59, "287082"], [1111111109, "081804"], [1111111111, "050471"], [1234567890, "005924"], [2000000000, "279037"], [20000000000, "353130"]] as const) {
      assert.equal(totpAt(rfc, stepAt(time * 1000)), code, `RFC 6238 vector at ${time}`);
    }
    assert.equal(base32Encode(rfc), "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ"); assert.deepEqual(base32Decode("GEZD GNBV-GY3T QOJQ GEZD GNBV GY3T QOJQ"), rfc);
    const now = Date.now();
    assert.equal(matchTotp(rfc, totpAt(rfc, stepAt(now) - 1), now), stepAt(now) - 1, "One step of clock drift is accepted");
    assert.equal(matchTotp(rfc, totpAt(rfc, stepAt(now) - 3), now), null, "Older codes are rejected");
    const sealed = encryptSecret(rfc); assert.deepEqual(decryptSecret(sealed), rfc); assert.ok(!sealed.includes(base32Encode(rfc)));
    const tampered = sealed.slice(0, -2) + (sealed.endsWith("A") ? "B" : "A") + sealed.slice(-1);
    assert.throws(() => decryptSecret(tampered), "Tampering is detected");
    pass("Codes match the RFC 6238 test vectors, allow one step of drift, and secrets are encrypted with tamper detection");

    // Setup
    const password = "Fictional-Passw0rd-For-Tests";
    const person = await prisma.user.create({ data: { name: "Sam Example", email: `${prefix}-sam@example.test`, status: "ACTIVE", passwordHash: await hashPassword(password) } }); users.push(person.id);
    await assert.rejects(() => startAuthenticatorSetup(person.id, "wrong password"), (e: unknown) => e instanceof AuthenticatorError && e.status === 403);
    const setup = await startAuthenticatorSetup(person.id, password);
    assert.ok(setup.qrSvg.startsWith("<svg") && setup.otpauthUrl.startsWith("otpauth://totp/XYZ%20Hub%3A") && setup.otpauthUrl.includes("issuer=XYZ%20Hub"));
    const secret = base32Decode(setup.key);
    assert.equal(secret.length, 20);
    const stored = await prisma.userTwoFactorMethod.findFirstOrThrow({ where: { userId: person.id, type: "AUTHENTICATOR" } });
    assert.equal(stored.isEnabled, false); assert.ok(!stored.secretEncrypted!.includes(setup.key.replace(/ /g, "")), "Secret is never stored in plain text");
    let login = await post("/login", { email: person.email, password }); assert.equal((await login.json() as { method: string }).method, "EMAIL", "A setup that isn't confirmed changes nothing");
    await assert.rejects(() => confirmAuthenticatorSetup(person.id, "000000"), (e: unknown) => e instanceof AuthenticatorError && e.status === 400);
    const { recoveryCodes } = await confirmAuthenticatorSetup(person.id, totpAt(secret, stepAt(Date.now())));
    assert.equal(recoveryCodes.length, 10); assert.ok(recoveryCodes.every((c) => /^[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/.test(c)));
    const hashes = await prisma.twoFactorRecoveryCode.findMany({ where: { userId: person.id } });
    assert.equal(hashes.length, 10); assert.ok(hashes.every((h) => !recoveryCodes.some((c) => h.codeHash.includes(c.replace("-", "")))));
    await assert.rejects(() => startAuthenticatorSetup(person.id, password), (e: unknown) => e instanceof AuthenticatorError && e.status === 409);
    pass("Setup needs the password, stays off until a current code confirms it, and issues ten hashed one-time recovery codes");

    // Sign-in with the app
    emailed = [];
    login = await post("/login", { email: person.email, password });
    let body = await login.json() as { method: string; challengeId: string; emailAvailable?: boolean };
    assert.equal(body.method, "AUTHENTICATOR"); assert.equal(body.emailAvailable, true); assert.equal(emailed.length, 0, "No email is sent for app users");
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: "123456" })).status, 401);
    const replay = totpAt(secret, stepAt(Date.now()));
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: replay })).status, 401, "The code used to confirm setup can't be reused");
    await prisma.userTwoFactorMethod.updateMany({ where: { userId: person.id, type: "AUTHENTICATOR" }, data: { lastUsedStep: stepAt(Date.now()) - 5 } });
    const verified = await post("/verify-2fa", { challengeId: body.challengeId, code: totpAt(secret, stepAt(Date.now())) });
    assert.equal(verified.status, 200); const cookie = (verified.headers.get("set-cookie") ?? "").split(";")[0]; assert.ok(cookie.includes("="));
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: totpAt(secret, stepAt(Date.now())) })).status, 401, "Each code is accepted once");
    pass("App users get no email, sign in with a current code, and a code is never accepted twice");

    // Recovery codes, the emailed backup and lockout
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: recoveryCodes[0].toLowerCase() })).status, 200, "A recovery code signs in (any case)");
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: recoveryCodes[0] })).status, 401, "Each recovery code works once");
    const used = await prisma.auditEvent.findFirstOrThrow({ where: { action: "auth.recovery_code_used", actorUserId: person.id } });
    assert.equal((used.metadata as { recoveryCodesLeft: number }).recoveryCodesLeft, 9);
    assert.equal((await presentAuditEvents([used]))[0].summary, "Sam Example signed in with a recovery code (9 left).");
    emailed = [];
    const instead = await post("/two-factor/email-instead", { challengeId: body.challengeId }); assert.equal(instead.status, 200);
    const emailedChallenge = await instead.json() as { method: string; challengeId: string };
    assert.equal(emailedChallenge.method, "EMAIL"); assert.equal(emailed.length, 1);
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: recoveryCodes[1] })).status, 401, "The replaced app challenge is closed");
    assert.equal((await post("/two-factor/email-instead", { challengeId: emailedChallenge.challengeId })).status, 401, "Only an app challenge can switch to email");
    assert.equal((await post("/verify-2fa", { challengeId: emailedChallenge.challengeId, code: recoveryCodes[1] })).status, 401, "Recovery codes don't work for emailed challenges");
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    emailed = [];
    const second = await (await post("/two-factor/email-instead", { challengeId: body.challengeId })).json() as { challengeId: string };
    assert.equal((await post("/verify-2fa", { challengeId: second.challengeId, code: emailed[0] })).status, 200, "The emailed backup signs in");
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    const statuses: number[] = [];
    for (let i = 0; i < 5; i++) statuses.push((await post("/verify-2fa", { challengeId: body.challengeId, code: "000000" })).status);
    assert.deepEqual(statuses, [401, 401, 401, 401, 429]);
    assert.equal((await post("/two-factor/email-instead", { challengeId: body.challengeId })).status, 401, "A locked challenge can't switch to email");
    pass("Recovery codes work once and are audited; an emailed code is always available instead; five wrong codes lock the attempt");

    // Account endpoints
    assert.equal((await fetch(base + "/two-factor")).status, 401);
    const statusResponse = await fetch(base + "/two-factor", { headers: { Cookie: cookie } });
    assert.equal(statusResponse.headers.get("cache-control"), "no-store");
    const status = await statusResponse.json() as { authenticator: { enabled: boolean }; recoveryCodesLeft: number };
    assert.equal(status.authenticator.enabled, true); assert.equal(status.recoveryCodesLeft, 9);
    assert.equal((await post("/two-factor/recovery-codes", { password: "wrong" }, cookie)).status, 403);
    const fresh = await (await post("/two-factor/recovery-codes", { password }, cookie)).json() as { recoveryCodes: string[] };
    assert.equal(fresh.recoveryCodes.length, 10);
    login = await post("/login", { email: person.email, password }); body = await login.json() as typeof body;
    assert.equal((await post("/verify-2fa", { challengeId: body.challengeId, code: recoveryCodes[2] })).status, 401, "Old recovery codes stop working");
    assert.equal((await post("/two-factor/authenticator/setup", { password }, cookie)).status, 409);
    assert.equal((await post("/two-factor/authenticator/confirm", { code: "12" }, cookie)).status, 400);
    assert.equal((await post("/two-factor/authenticator/disable", { password: "wrong" }, cookie)).status, 403);
    assert.equal((await post("/two-factor/authenticator/disable", { password, extra: true }, cookie)).status, 400);
    assert.equal((await post("/two-factor/authenticator/disable", { password }, cookie)).status, 200);
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId: person.id } }), 0);
    login = await post("/login", { email: person.email, password }); assert.equal((await login.json() as { method: string }).method, "EMAIL");
    const actions = (await prisma.auditEvent.findMany({ where: { actorUserId: person.id, action: { startsWith: "auth." } }, orderBy: { occurredAt: "asc" } })).map((e) => e.action);
    for (const action of ["auth.authenticator_enabled", "auth.recovery_codes_regenerated", "auth.authenticator_disabled"]) assert.ok(actions.includes(action), action);
    pass("Signed-in settings need the password for every change, refuse bad input, and turning off returns sign-in to emailed codes");

    // Owner reset clears the app and its recovery codes
    const again = await startAuthenticatorSetup(person.id, password);
    await prisma.userTwoFactorMethod.updateMany({ where: { userId: person.id, type: "AUTHENTICATOR" }, data: { lastUsedStep: null } });
    await confirmAuthenticatorSetup(person.id, totpAt(base32Decode(again.key), stepAt(Date.now())));
    const roles = new Map((await prisma.role.findMany({ where: { systemKey: { not: null } } })).map((r) => [r.systemKey!, r.id]));
    const owner = await prisma.user.create({ data: { name: "Owner Example", email: `${prefix}-owner@example.test`, status: "ACTIVE", roleMemberships: { create: { roleId: roles.get("OWNER")! } } } }); users.push(owner.id);
    await resetPersonTwoFactor(person.id, await getAccessContext(owner.id));
    assert.equal(await prisma.userTwoFactorMethod.count({ where: { userId: person.id, type: "AUTHENTICATOR" } }), 0);
    assert.equal(await prisma.twoFactorRecoveryCode.count({ where: { userId: person.id } }), 0);
    pass("An Owner's two-step reset removes the authenticator app and its recovery codes");

    realLog(`${passed} authenticator sign-in integration groups passed. No real email sent.`);
  } finally {
    console.log = realLog;
    server.closeAllConnections(); await new Promise<void>((resolve) => server.close(() => resolve()));
    await prisma.session.deleteMany({ where: { userId: { in: users } } });
    await prisma.twoFactorChallenge.deleteMany({ where: { userId: { in: users } } });
    await prisma.user.deleteMany({ where: { id: { in: users } } });
  }
}
main().catch((e) => { console.error(e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
