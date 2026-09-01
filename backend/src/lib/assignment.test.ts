import { afterEach, describe, expect, it, vi } from "vitest";

const actingUser = { id: "user_1", name: "Ada", email: "ada@example.com", role: "USER" as const };

async function freshAssignment(opts: {
  resolveProjectAccess?: ReturnType<typeof vi.fn>;
  findProjectMembership?: ReturnType<typeof vi.fn>;
  errorGroup?: Record<string, ReturnType<typeof vi.fn>>;
}) {
  vi.resetModules();
  vi.doMock("./access", () => ({
    resolveProjectAccess: opts.resolveProjectAccess ?? vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
    findProjectMembership: opts.findProjectMembership ?? vi.fn().mockResolvedValue(null),
  }));
  vi.doMock("./db", () => ({ prisma: { errorGroup: opts.errorGroup ?? {} } }));
  return import("./assignment");
}

describe("assignErrorGroup", () => {
  afterEach(() => {
    vi.doUnmock("./access");
    vi.doUnmock("./db");
  });

  it("returns project_not_found when the caller has no access", async () => {
    const { assignErrorGroup } = await freshAssignment({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "project_not_found" });
  });

  it("a non-owner member can self-assign", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: "user_1" });
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "owner_1" }),
      findProjectMembership: vi.fn().mockResolvedValue({ userId: "user_1" }),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_1");
    expect(result).toEqual({ status: "assigned", group: { id: "grp_1", message: "boom", assigneeId: "user_1" } });
  });

  it("a non-owner member can unassign themselves", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: null });
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "owner_1" }),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", null);
    expect(result.status).toBe("assigned");
  });

  it("a non-owner member is blocked from assigning to someone else", async () => {
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "owner_1" }),
    });

    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "insufficient_role" });
  });

  it("the owner can assign to any accessible member", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: "user_2" });
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
      findProjectMembership: vi.fn().mockResolvedValue({ userId: "user_2" }),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2");
    expect(result.status).toBe("assigned");
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "grp_1", projectId: "proj_1" }, data: { assigneeId: "user_2" } });
  });

  it("the owner can assign to themselves without needing a ProjectMember row", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: "user_1" });
    const findProjectMembership = vi.fn();
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
      findProjectMembership,
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_1");
    expect(result.status).toBe("assigned");
    expect(findProjectMembership).not.toHaveBeenCalled();
  });

  it("rejects assigning to a non-project-member", async () => {
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
      findProjectMembership: vi.fn().mockResolvedValue(null),
    });

    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "not_a_project_member" });
  });

  it("returns group_not_found when the group doesn't exist in the project", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
      errorGroup: { updateMany },
    });

    expect(await assignErrorGroup(actingUser, "proj_1", "missing-group", null)).toEqual({ status: "group_not_found" });
  });
});

describe("updateErrorGroupStatus", () => {
  afterEach(() => {
    vi.doUnmock("./access");
    vi.doUnmock("./db");
  });

  it("returns project_not_found when the caller has no access", async () => {
    const { updateErrorGroupStatus } = await freshAssignment({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
    expect(await updateErrorGroupStatus(actingUser, "proj_1", "grp_1", "DONE")).toBe("project_not_found");
  });

  it("any accessible member (not just the owner) can set status", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { updateErrorGroupStatus } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "owner_1" }),
      errorGroup: { updateMany },
    });

    const result = await updateErrorGroupStatus(actingUser, "proj_1", "grp_1", "IN_PROGRESS");
    expect(result).toBe("updated");
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "grp_1", projectId: "proj_1" }, data: { status: "IN_PROGRESS" } });
  });

  it("returns group_not_found when the group doesn't exist in the project", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { updateErrorGroupStatus } = await freshAssignment({ errorGroup: { updateMany } });

    expect(await updateErrorGroupStatus(actingUser, "proj_1", "missing-group", "DONE")).toBe("group_not_found");
  });
});
