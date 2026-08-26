import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./authSchema";

describe("registerSchema", () => {
  const valid = { name: "Ada Lovelace", email: "ada@example.com", password: "supersecret1" };

  it("accepts a valid registration", () => {
    expect(registerSchema.safeParse(valid).success).toBe(true);
  });

  it("lowercases and trims the email", () => {
    const result = registerSchema.safeParse({ ...valid, email: "  Ada@Example.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("ada@example.com");
  });

  it("rejects a missing name", () => {
    const { name: _drop, ...rest } = valid;
    expect(registerSchema.safeParse(rest).success).toBe(false);
  });

  it("rejects an empty name", () => {
    expect(registerSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects a malformed email", () => {
    expect(registerSchema.safeParse({ ...valid, email: "not-an-email" }).success).toBe(false);
  });

  it("rejects a password shorter than the minimum", () => {
    expect(registerSchema.safeParse({ ...valid, password: "short1" }).success).toBe(false);
  });

  it("rejects a password longer than the maximum", () => {
    expect(registerSchema.safeParse({ ...valid, password: "x".repeat(500) }).success).toBe(false);
  });
});

describe("loginSchema", () => {
  it("accepts a valid login", () => {
    expect(loginSchema.safeParse({ email: "ada@example.com", password: "anything" }).success).toBe(true);
  });

  it("rejects a malformed email", () => {
    expect(loginSchema.safeParse({ email: "not-an-email", password: "anything" }).success).toBe(false);
  });

  it("rejects an empty password", () => {
    expect(loginSchema.safeParse({ email: "ada@example.com", password: "" }).success).toBe(false);
  });

  it("does not enforce the registration minimum length on login (avoids leaking policy via a different error)", () => {
    // A 1-character password is a wrong-credentials case, not a validation
    // error — login shouldn't reveal the registration password policy.
    expect(loginSchema.safeParse({ email: "ada@example.com", password: "x" }).success).toBe(true);
  });
});
