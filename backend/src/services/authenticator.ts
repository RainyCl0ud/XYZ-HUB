import { createCipheriv, createDecipheriv, createHmac, hkdfSync, randomBytes, randomInt, timingSafeEqual } from "node:crypto";
import { Prisma, TwoFactorMethodType } from "@prisma/client";
import QRCode from "qrcode";
import { prisma } from "../lib/prisma.js";
import { verifyPassword } from "./password.js";

/*
 * Authenticator app sign-in (TOTP, RFC 6238: SHA-1, 30-second steps, six
 * digits). Works with any standard app, free ones included: Google
 * Authenticator, Apple Passwords, Bitwarden Authenticator, Microsoft
 * Authenticator. No third-party service is involved.
 *
 * - Each person's secret is encrypted (AES-256-GCM, 16-byte tag, bound to
 *   their user ID) with a key derived from TWO_FACTOR_CODE_SECRET, so no new
 *   setting is needed. Changing that setting turns everyone's app off (they
 *   fall back to emailed codes and set the app up again).
 * - A code is accepted once: the highest used step is stored (lastUsedStep).
 * - Ten one-time recovery codes are issued at setup; only keyed HMACs (with
 *   their own derived key) are stored.
 * - Repeated wrong app codes across sign-ins switch that person to emailed
 *   codes for an hour (see APP_FAILURE_LIMIT).
 * - Turning the app on or off, or getting new recovery codes, needs the
 *   person's password. Emailed codes always remain available as a backup.
 */

export class AuthenticatorError extends Error {
  constructor(readonly status: number, readonly code: string, message: string) { super(message); this.name = "AuthenticatorError"; }
}

const STEP_SECONDS = 30;
const DIGITS = 6;
const DRIFT_STEPS = 1;
const SETUP_WINDOW_MS = 15 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const RECOVERY_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ";
const BASE32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const RECOVERY_CODE_PATTERN = /^[2-9A-HJKMNP-Z]{4}-?[2-9A-HJKMNP-Z]{4}$/i;
/** Wrong app codes allowed per person per rolling hour, across all sign-ins. */
export const APP_FAILURE_LIMIT = 10;
export const APP_FAILURE_WINDOW_MS = 60 * 60 * 1000;

type Tx = Prisma.TransactionClient;
type Client = Tx | typeof prisma;

function masterSecret() {
  const secret = process.env.TWO_FACTOR_CODE_SECRET;
  if (!secret) throw new Error("TWO_FACTOR_CODE_SECRET is not configured.");
  return secret;
}
const derivedKey = (info: string) => Buffer.from(hkdfSync("sha256", masterSecret(), "xyz-hub", info, 32));

export function base32Encode(bytes: Buffer) {
  let bits = 0, value = 0, out = "";
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += BASE32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(text: string) {
  const clean = text.replace(/[\s=-]/g, "").toUpperCase();
  let bits = 0, value = 0; const out: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index < 0) throw new Error("Invalid base32 secret.");
    value = (value << 5) | index; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

/** RFC 4226 HOTP value for one 30-second step. */
export function totpAt(secret: Buffer, step: number, digits = DIGITS) {
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const hmac = createHmac("sha1", secret).update(counter).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary = ((hmac[offset] & 0x7f) << 24) | (hmac[offset + 1] << 16) | (hmac[offset + 2] << 8) | hmac[offset + 3];
  return String(binary % 10 ** digits).padStart(digits, "0");
}
export const stepAt = (time: number) => Math.floor(time / 1000 / STEP_SECONDS);

/** Matching step within one step of clock drift, or null. Constant-time compare. */
export function matchTotp(secret: Buffer, code: string, now = Date.now()) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = stepAt(now);
  let matched: number | null = null;
  for (let step = current - DRIFT_STEPS; step <= current + DRIFT_STEPS; step++) {
    if (timingSafeEqual(Buffer.from(totpAt(secret, step)), Buffer.from(code))) matched = step;
  }
  return matched;
}

/** AES-256-GCM, 16-byte tag, bound to the owner's user ID (AAD). */
export function encryptSecret(secret: Buffer, userId: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", derivedKey("authenticator-secret-v1"), iv, { authTagLength: 16 });
  cipher.setAAD(Buffer.from(userId));
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()]);
  return ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
export function decryptSecret(stored: string, userId: string) {
  const [version, iv, tag, data] = stored.split(".");
  if (version !== "v1" || !iv || !tag || !data) throw new Error("Unsupported authenticator secret format.");
  const decipher = createDecipheriv("aes-256-gcm", derivedKey("authenticator-secret-v1"), Buffer.from(iv, "base64url"), { authTagLength: 16 });
  decipher.setAAD(Buffer.from(userId));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64url")), decipher.final()]);
}
/** Null when the secret can't be read (e.g. TWO_FACTOR_CODE_SECRET changed). */
function readSecret(stored: string | null, userId: string) {
  if (!stored) return null;
  try { return decryptSecret(stored, userId); } catch { return null; }
}

const normalizeRecovery = (code: string) => code.replace(/[\s-]/g, "").toUpperCase();
const hashRecovery = (code: string) => createHmac("sha256", derivedKey("recovery-code-v1")).update(normalizeRecovery(code)).digest("hex");
function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const chars = Array.from({ length: 8 }, () => RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)]).join("");
    return chars.slice(0, 4) + "-" + chars.slice(4);
  });
}

/** Account label shown in the app. Non-Production environments say so. */
function issuer() {
  const environment = process.env.RAILWAY_ENVIRONMENT_NAME ?? "";
  return !environment || /^prod(uction)?$/i.test(environment) ? "XYZ Hub" : `XYZ Hub ${environment}`;
}

async function loadPerson(client: Client, userId: string) {
  const person = await client.user.findUnique({ where: { id: userId }, select: { id: true, email: true, name: true, status: true, passwordHash: true } });
  if (!person || person.status !== "ACTIVE") throw new AuthenticatorError(401, "SIGN_IN_REQUIRED", "Please sign in again.");
  return person;
}
/** Checked before any transaction opens, so a slow hash never holds a connection. */
async function requirePassword(userId: string, password: string) {
  const person = await loadPerson(prisma, userId);
  if (!person.passwordHash || !(await verifyPassword(password, person.passwordHash))) throw new AuthenticatorError(403, "PASSWORD_INCORRECT", "That password is incorrect.");
  return person;
}
const findMethod = (client: Client, userId: string) => client.userTwoFactorMethod.findUnique({ where: { userId_type: { userId, type: TwoFactorMethodType.AUTHENTICATOR } } });
function audit(client: Client, person: { id: string; name: string; email: string }, action: string, metadata: Prisma.InputJsonObject = {}) {
  return client.auditEvent.create({ data: { occurredAt: new Date(), action, success: true, statusCode: 200, actorUserId: person.id, actorLabel: person.name,
    targetType: "user", targetId: person.id, metadata: { email: person.email, ...metadata } } });
}
async function replaceRecoveryCodes(tx: Tx, userId: string) {
  const codes = newRecoveryCodes();
  await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
  await tx.twoFactorRecoveryCode.createMany({ data: codes.map((code) => ({ userId, codeHash: hashRecovery(code) })) });
  return codes;
}

/** Wrong app codes this person entered in the last hour, across sign-ins. */
export async function recentAppFailures(userId: string, client: Client = prisma) {
  const sum = await client.twoFactorChallenge.aggregate({ where: { userId, methodType: TwoFactorMethodType.AUTHENTICATOR, createdAt: { gte: new Date(Date.now() - APP_FAILURE_WINDOW_MS) } }, _sum: { failedAttempts: true } });
  return sum._sum.failedAttempts ?? 0;
}

/** App sign-in is offered only for a confirmed, readable secret. */
export async function hasAuthenticator(userId: string, client: Client = prisma) {
  const row = await findMethod(client, userId);
  return !!row?.isEnabled && !!row.verifiedAt && !!readSecret(row.secretEncrypted, userId);
}

export async function authenticatorStatus(userId: string) {
  await loadPerson(prisma, userId);
  const enabled = await hasAuthenticator(userId);
  const row = enabled ? await findMethod(prisma, userId) : null;
  const recoveryCodesLeft = enabled ? await prisma.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } }) : 0;
  return { authenticator: { enabled, since: row?.verifiedAt ?? null }, recoveryCodesLeft };
}

/** Step 1: password confirmed, a new secret is stored (not yet active). */
export async function startAuthenticatorSetup(userId: string, password: string) {
  const person = await requirePassword(userId, password);
  const secret = randomBytes(20);
  await prisma.$transaction(async (tx) => {
    const existing = await findMethod(tx, userId);
    if (existing?.isEnabled && existing.verifiedAt && readSecret(existing.secretEncrypted, userId)) {
      throw new AuthenticatorError(409, "AUTHENTICATOR_ALREADY_ON", "An authenticator app is already set up. Turn it off first to switch apps.");
    }
    const data = { isEnabled: false, verifiedAt: null, secretEncrypted: encryptSecret(secret, userId), lastUsedStep: null };
    await tx.userTwoFactorMethod.upsert({ where: { userId_type: { userId, type: TwoFactorMethodType.AUTHENTICATOR } }, create: { userId, type: TwoFactorMethodType.AUTHENTICATOR, ...data }, update: data });
  }, { timeout: 15_000 });
  const key = base32Encode(secret);
  const label = encodeURIComponent(`${issuer()}:${person.email}`);
  const otpauthUrl = `otpauth://totp/${label}?secret=${key}&issuer=${encodeURIComponent(issuer())}&algorithm=SHA1&digits=${DIGITS}&period=${STEP_SECONDS}`;
  const qrSvg = await QRCode.toString(otpauthUrl, { type: "svg", errorCorrectionLevel: "M", margin: 2, color: { dark: "#000000", light: "#FFFFFF" } });
  return { key: key.match(/.{1,4}/g)!.join(" "), otpauthUrl, qrSvg, accountLabel: `${issuer()} (${person.email})` };
}

/** Step 2: a current code from the app turns it on and issues recovery codes. */
export async function confirmAuthenticatorSetup(userId: string, code: string) {
  return prisma.$transaction(async (tx) => {
    const person = await loadPerson(tx, userId);
    const pending = await findMethod(tx, userId);
    if (!pending?.secretEncrypted || (pending.isEnabled && pending.verifiedAt)) throw new AuthenticatorError(409, "SETUP_NOT_STARTED", "Start the setup again.");
    if (Date.now() - pending.updatedAt.getTime() > SETUP_WINDOW_MS) throw new AuthenticatorError(409, "SETUP_EXPIRED", "This setup expired. Start again to get a new QR code.");
    const secret = readSecret(pending.secretEncrypted, userId);
    const step = secret ? matchTotp(secret, code) : null;
    if (step === null) throw new AuthenticatorError(400, "CODE_INCORRECT", "That code doesn’t match. Check the time on your phone and try the newest code.");
    // Only one confirm can switch it on; a second concurrent one gets 409.
    const switched = await tx.userTwoFactorMethod.updateMany({ where: { id: pending.id, isEnabled: false, secretEncrypted: pending.secretEncrypted }, data: { isEnabled: true, verifiedAt: new Date(), lastUsedStep: step } });
    if (!switched.count) throw new AuthenticatorError(409, "SETUP_NOT_STARTED", "Start the setup again.");
    const recoveryCodes = await replaceRecoveryCodes(tx, userId);
    await audit(tx, person, "auth.authenticator_enabled");
    return { recoveryCodes };
  }, { timeout: 15_000 });
}

export async function regenerateRecoveryCodes(userId: string, password: string) {
  const person = await requirePassword(userId, password);
  return prisma.$transaction(async (tx) => {
    if (!(await hasAuthenticator(userId, tx))) throw new AuthenticatorError(409, "AUTHENTICATOR_OFF", "Set up an authenticator app first.");
    const recoveryCodes = await replaceRecoveryCodes(tx, userId);
    await audit(tx, person, "auth.recovery_codes_regenerated");
    return { recoveryCodes };
  }, { timeout: 15_000 });
}

export async function disableAuthenticator(userId: string, password: string) {
  const person = await requirePassword(userId, password);
  return prisma.$transaction(async (tx) => {
    const removed = await tx.userTwoFactorMethod.deleteMany({ where: { userId, type: TwoFactorMethodType.AUTHENTICATOR } });
    await tx.twoFactorRecoveryCode.deleteMany({ where: { userId } });
    if (removed.count) await audit(tx, person, "auth.authenticator_disabled");
    return { disabled: true };
  }, { timeout: 15_000 });
}

/**
 * Sign-in check for an authenticator challenge, run inside the same
 * transaction that claims the challenge: a current app code (each step
 * accepted once) or an unused recovery code (spent on use). If the claim
 * rolls back, the code is not spent.
 */
export async function useAuthenticatorCode(tx: Tx, userId: string, code: string): Promise<{ ok: false } | { ok: true; via: "app" | "recovery" }> {
  const row = await findMethod(tx, userId);
  const secret = row?.isEnabled && row.verifiedAt ? readSecret(row.secretEncrypted, userId) : null;
  if (!row || !secret) return { ok: false };
  if (/^\d{6}$/.test(code)) {
    const step = matchTotp(secret, code);
    if (step === null) return { ok: false };
    const claimed = await tx.userTwoFactorMethod.updateMany({ where: { id: row.id, OR: [{ lastUsedStep: null }, { lastUsedStep: { lt: step } }] }, data: { lastUsedStep: step } });
    return claimed.count ? { ok: true, via: "app" } : { ok: false };
  }
  if (!RECOVERY_CODE_PATTERN.test(code)) return { ok: false };
  const spent = await tx.twoFactorRecoveryCode.updateMany({ where: { userId, codeHash: hashRecovery(code), usedAt: null }, data: { usedAt: new Date() } });
  if (!spent.count) return { ok: false };
  const person = await tx.user.findUnique({ where: { id: userId }, select: { id: true, name: true, email: true } });
  if (person) await audit(tx, person, "auth.recovery_code_used", { recoveryCodesLeft: await tx.twoFactorRecoveryCode.count({ where: { userId, usedAt: null } }) });
  return { ok: true, via: "recovery" };
}
