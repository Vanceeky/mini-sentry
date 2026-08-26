import { createHash } from "node:crypto";

/**
 * Shared by anything that stores a high-entropy random token (project API
 * keys, session tokens) rather than the raw value — no salt needed, since
 * these aren't low-entropy user-chosen secrets. Passwords use a different,
 * salted, slow hash — see password.ts.
 */
export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex");
}
