import { afterEach, describe, expect, it, vi } from "vitest";

async function freshProjectMembers(prismaProject: Record<string, ReturnType<typeof vi.fn>>, projectMember?: Record<string, ReturnType<typeof vi.fn>>) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { project: prismaProject, projectMember: projectMember ?? {} } }));
  return import("./projectMembers");
}

describe("listProjectMembers", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns an empty array when the project doesn't exist", async () => {
    const { listProjectMembers } = await freshProjectMembers({ findUnique: vi.fn().mockResolvedValue(null) });
    expect(await listProjectMembers("proj_1")).toEqual([]);
  });

  it("synthesizes the owner row ahead of ProjectMember rows", async () => {
    const createdAt = new Date("2026-01-01T00:00:00.000Z");
    const findUnique = vi.fn().mockResolvedValue({
      createdAt,
      owner: { id: "owner_1", name: "Ada", email: "ada@example.com" },
      members: [{ userId: "user_2", createdAt: new Date("2026-02-01T00:00:00.000Z"), user: { name: "Bob", email: "bob@example.com" } }],
    });
    const { listProjectMembers } = await freshProjectMembers({ findUnique });

    const result = await listProjectMembers("proj_1");
    expect(result).toEqual([
      { userId: "owner_1", name: "Ada", email: "ada@example.com", createdAt, isOwner: true },
      { userId: "user_2", name: "Bob", email: "bob@example.com", createdAt: new Date("2026-02-01T00:00:00.000Z"), isOwner: false },
    ]);
  });
});

describe("removeProjectMember", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns not_found when the project doesn't exist", async () => {
    const { removeProjectMember } = await freshProjectMembers({ findUnique: vi.fn().mockResolvedValue(null) });
    expect(await removeProjectMember("user_1", "proj_1", "user_2")).toBe("not_found");
  });

  it("returns cannot_remove_owner when the target is the project owner", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const { removeProjectMember } = await freshProjectMembers({ findUnique });
    expect(await removeProjectMember("owner_1", "proj_1", "owner_1")).toBe("cannot_remove_owner");
  });

  it("allows a member to remove themselves (leave)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { removeProjectMember } = await freshProjectMembers({ findUnique }, { deleteMany });

    const result = await removeProjectMember("user_2", "proj_1", "user_2");
    expect(result).toBe("removed");
    expect(deleteMany.mock.calls[0][0]).toEqual({ where: { projectId: "proj_1", userId: "user_2" } });
  });

  it("allows the owner to remove someone else", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { removeProjectMember } = await freshProjectMembers({ findUnique }, { deleteMany });

    expect(await removeProjectMember("owner_1", "proj_1", "user_2")).toBe("removed");
  });

  it("forbids a non-owner from removing someone else", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const deleteMany = vi.fn();
    const { removeProjectMember } = await freshProjectMembers({ findUnique }, { deleteMany });

    expect(await removeProjectMember("user_2", "proj_1", "user_3")).toBe("forbidden");
    expect(deleteMany).not.toHaveBeenCalled();
  });

  it("returns not_found when no membership row matches", async () => {
    const findUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const deleteMany = vi.fn().mockResolvedValue({ count: 0 });
    const { removeProjectMember } = await freshProjectMembers({ findUnique }, { deleteMany });

    expect(await removeProjectMember("owner_1", "proj_1", "not-a-member")).toBe("not_found");
  });
});
