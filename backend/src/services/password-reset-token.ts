import {
  createHash,
  randomBytes,
} from "node:crypto";

const PASSWORD_RESET_TOKEN_BYTES =
  32;

export function generatePasswordResetToken(): string {
  return randomBytes(
    PASSWORD_RESET_TOKEN_BYTES
  ).toString("base64url");
}

export function hashPasswordResetToken(
  token: string
): string {
  return createHash("sha256")
    .update(token)
    .digest("hex");
}