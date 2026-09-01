import { afterEach, describe, expect, it, vi } from "vitest";

async function freshAccess(prismaMock: { project?: Record<string, ReturnType<typeof vi.fn>>; projectMember?: Record<string, ReturnType<typeof vi.fn>> }) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: prismaMock }));
  return import("./access");
}

describe("resolveProjectAccess", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the query to ownerId OR project membership — never just projectId", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { resolveProjectAccess } = await freshAccess({ project: { findFirst } });

    await resolveProjectAccess("user_1", "proj_1");
    expect(findFirst.mock.calls[0][0].where).toEqual({
      id: "proj_1",
      OR: [{ ownerId: "user_1" }, { members: { some: { userId: "user_1" } } }],
    });
  });

  it("returns null when nothing matches (IDOR-safe)", async () => {
    const { resolveProjectAccess } = await freshAccess({ project: { findFirst: vi.fn().mockResolvedValue(null) } });
    expect(await resolveProjectAccess("user_1", "not-accessible")).toBeNull();
  });
});

describe("findProjectMembership", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("looks up by the compound projectId_userId unique key", async () => {
    const findUnique = vi.fn().mockResolvedValue({ userId: "user_1" });
    const { findProjectMembership } = await freshAccess({ projectMember: { findUnique } });

    const result = await findProjectMembership("proj_1", "user_1");
    expect(findUnique.mock.calls[0][0].where).toEqual({ projectId_userId: { projectId: "proj_1", userId: "user_1" } });
    expect(result).toEqual({ userId: "user_1" });
  });

  it("returns null when the user isn't a member", async () => {
    const { findProjectMembership } = await freshAccess({ projectMember: { findUnique: vi.fn().mockResolvedValue(null) } });
    expect(await findProjectMembership("proj_1", "user_2")).toBeNull();
  });
});
