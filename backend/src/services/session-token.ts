import {
  createHash,
  randomBytes,
} from "node:crypto";

const SESSION_TOKEN_BYTES = 32;

/*
 * Generates the token that will eventually
 * be sent to the browser in the session cookie.
 *
 * The raw token must NEVER be stored in the database.
 */
export function generateSessionToken(): string {
  return randomBytes(
    SESSION_TOKEN_BYTES
  ).toString("base64url");
}

/*
 * Only the SHA-256 hash of the session token
 * is stored in PostgreSQL.
 */
export function hashSessionToken(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}