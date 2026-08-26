import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const SCRYPT_KEY_LEN = 64;

/**
 * scrypt (Node's built-in, no extra dependency) with a random salt per
 * password — appropriate for low-entropy user-chosen secrets, unlike the
 * unsalted hashing used for high-entropy tokens (see hash.ts). Stored as
 * "<saltHex>:<derivedKeyHex>".
 */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LEN);
  return `${salt}:${derivedKey.toString("hex")}`;
}

/** Constant-time comparison — never short-circuits based on a byte mismatch. */
export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hashHex] = stored.split(":");
  if (!salt || !hashHex) return false;

  const derivedKey = scryptSync(password, salt, SCRYPT_KEY_LEN);
  const storedKey = Buffer.from(hashHex, "hex");
  if (storedKey.length !== derivedKey.length) return false;

  return timingSafeEqual(derivedKey, storedKey);
}

/**
 * A precomputed hash of a fixed, unguessable-by-users placeholder — used so
 * login always runs one scrypt computation even when no account matches the
 * given email, instead of returning early and letting response timing leak
 * whether an email is registered.
 */
export const DUMMY_PASSWORD_HASH = hashPassword("mini-sentry-timing-mitigation-placeholder");
