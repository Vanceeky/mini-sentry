import { describe, expect, it, vi } from "vitest";
import { hashApiKey } from "./apiKey";

// extractBearerToken's own tests live in bearer.test.ts (its canonical
// module) — apiKey.ts only re-exports it for backward-compatible imports.

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

describe("findProjectByApiKey", () => {
  it("looks up a project by the hashed key and returns id/name/ownerId", async () => {
    vi.resetModules();
    const findUnique = vi.fn().mockResolvedValue({ id: "proj_1", name: "Test Project", ownerId: "user_1" });
    vi.doMock("./db", () => ({ prisma: { project: { findUnique } } }));

    const { findProjectByApiKey, hashApiKey: hash } = await import("./apiKey");
    const project = await findProjectByApiKey("mnst_test_123");

    expect(findUnique).toHaveBeenCalledWith({
      where: { apiKeyHash: hash("mnst_test_123") },
      select: { id: true, name: true, ownerId: true },
    });
    expect(project).toEqual({ id: "proj_1", name: "Test Project", ownerId: "user_1" });

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
