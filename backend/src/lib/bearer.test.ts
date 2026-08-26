import { describe, expect, it } from "vitest";
import { extractBearerToken } from "./bearer";

describe("extractBearerToken", () => {
  it("extracts the token from a well-formed Bearer header", () => {
    expect(extractBearerToken("Bearer abc123")).toBe("abc123");
  });

  it("is case-insensitive on the scheme", () => {
    expect(extractBearerToken("bearer abc123")).toBe("abc123");
  });

  it("returns null when the header is missing", () => {
    expect(extractBearerToken(null)).toBeNull();
  });

  it("returns null when the header doesn't use the Bearer scheme", () => {
    expect(extractBearerToken("Basic abc123")).toBeNull();
  });

  it("returns null for an empty token", () => {
    expect(extractBearerToken("Bearer ")).toBeNull();
  });
});
