import {
  randomBytes,
  scrypt as scryptCallback,
  timingSafeEqual,
} from "node:crypto";

import {
  promisify,
} from "node:util";

const scrypt =
  promisify(scryptCallback);

const KEY_LENGTH = 64;

const HASH_VERSION =
  "scrypt-v1";

/*
 * Passwords are NEVER stored directly.
 *
 * Stored format:
 *
 * scrypt-v1$salt$derivedHash
 */
export async function hashPassword(
  password: string
): Promise<string> {
  const salt =
    randomBytes(16);

  const derivedKey =
    await scrypt(
      password,
      salt,
      KEY_LENGTH
    ) as Buffer;

  return [
    HASH_VERSION,
    salt.toString("base64"),
    derivedKey.toString("base64"),
  ].join("$");
}

export async function verifyPassword(
  password: string,
  storedHash: string
): Promise<boolean> {
  const parts =
    storedHash.split("$");

  if (parts.length !== 3) {
    return false;
  }

  const [
    version,
    saltBase64,
    hashBase64,
  ] = parts;

  if (
    version !== HASH_VERSION ||
    !saltBase64 ||
    !hashBase64
  ) {
    return false;
  }

  try {
    const salt =
      Buffer.from(
        saltBase64,
        "base64"
      );

    const storedKey =
      Buffer.from(
        hashBase64,
        "base64"
      );

    if (
      storedKey.length !==
      KEY_LENGTH
    ) {
      return false;
    }

    const derivedKey =
      await scrypt(
        password,
        salt,
        KEY_LENGTH
      ) as Buffer;

    return timingSafeEqual(
      storedKey,
      derivedKey
    );
  } catch {
    return false;
  }
}