import { describe, expect, it } from "vitest";
import { sha256Hex } from "./hash";

describe("sha256Hex", () => {
  it("is deterministic for the same input", () => {
    expect(sha256Hex("abc")).toBe(sha256Hex("abc"));
  });

  it("differs for different inputs", () => {
    expect(sha256Hex("abc")).not.toBe(sha256Hex("abd"));
  });

  it("never returns the raw input", () => {
    expect(sha256Hex("abc")).not.toBe("abc");
  });

  it("produces a 64-char lowercase hex digest", () => {
    expect(sha256Hex("abc")).toMatch(/^[0-9a-f]{64}$/);
  });
});
