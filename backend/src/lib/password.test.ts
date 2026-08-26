import { describe, expect, it } from "vitest";
import { DUMMY_PASSWORD_HASH, hashPassword, verifyPassword } from "./password";

describe("hashPassword / verifyPassword", () => {
  it("verifies the correct password against its own hash", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
  });

  it("rejects an incorrect password", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("uses a random salt per call, so two hashes of the same password differ", () => {
    expect(hashPassword("same password")).not.toBe(hashPassword("same password"));
  });

  it("never returns the raw password", () => {
    expect(hashPassword("my-secret-password")).not.toContain("my-secret-password");
  });

  it("returns false for a malformed stored value instead of throwing", () => {
    expect(verifyPassword("anything", "not-a-valid-stored-hash")).toBe(false);
    expect(verifyPassword("anything", "")).toBe(false);
  });

  it("DUMMY_PASSWORD_HASH is a valid, verifiable hash (used for timing mitigation)", () => {
    expect(verifyPassword("mini-sentry-timing-mitigation-placeholder", DUMMY_PASSWORD_HASH)).toBe(true);
    expect(verifyPassword("wrong", DUMMY_PASSWORD_HASH)).toBe(false);
  });
});
