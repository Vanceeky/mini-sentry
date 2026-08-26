import { describe, expect, it, vi } from "vitest";
import { extractBearerToken, hashApiKey } from "./apiKey";

describe("hashApiKey", () => {
  it("is deterministic for the same input", () => {
    expect(hashApiKey("mnst_test_123")).toBe(hashApiKey("mnst_test_123"));
  });

  it("produces different hashes for different inputs", () => {
    expect(hashApiKey("mnst_test_123")).not.toBe(hashApiKey("mnst_test_456"));
  });

  it("never returns the raw key", () => {
    expect(hashApiKey("mnst_test_123")).not.toBe("mnst_test_123");
  });
});

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

describe("findProjectByApiKey", () => {
  it("looks up a project by the hashed key and returns id/name only", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue({ id: "proj_1", name: "Test Project" });
    vi.doMock("./db", () => ({ prisma: { project: { findUnique } } }));

    const { findProjectByApiKey, hashApiKey: hash } = await import("./apiKey");
    const project = await findProjectByApiKey("mnst_test_123");

    expect(findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: hash("mnst_test_123") },
      select: { id: true, name: true },
    });
    expect(project).toEqual({ id: "proj_1", name: "Test Project" });

    vi.doUnmock("./db");
  });

  it("returns null when no project matches", async () => {
    vi.resetModules();
    vi.doMock("./db", () => ({ prisma: { project: { findUnique: vi.fn().mockResolvedValue(null) } } }));

    const { findProjectByApiKey } = await import("./apiKey");
    expect(await findProjectByApiKey("unknown")).toBeNull();

    vi.doUnmock("./db");
  });
});
