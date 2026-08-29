import { afterEach, describe, expect, it, vi } from "vitest";

const actingUser = { id: "user_1", name: "Ada", email: "ada@example.com", role: "USER" as const };

async function freshAssignment(opts: {
  resolveProjectAccess?: ReturnType<typeof vi.fn>;
  findTeamMembership?: ReturnType<typeof vi.fn>;
  errorGroup?: Record<string, ReturnType<typeof vi.fn>>;
}) {
  vi.resetModules();
  vi.doMock("./access", () => ({
    resolveProjectAccess: opts.resolveProjectAccess ?? vi.fn().mockResolvedValue({ id: "proj_1", teamId: "team_1" }),
    findTeamMembership: opts.findTeamMembership ?? vi.fn().mockResolvedValue({ role: "LEAD" }),
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

  it("returns project_not_on_team when the project has no team", async () => {
    const { assignErrorGroup } = await freshAssignment({
      resolveProjectAccess: vi.fn().mockResolvedValue({ id: "proj_1", teamId: null }),
    });
    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "project_not_on_team" });
  });

  it("a MEMBER can self-assign", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: "user_1" });
    const { assignErrorGroup } = await freshAssignment({
      findTeamMembership: vi.fn().mockImplementation(async (_teamId, userId) => (userId === "user_1" ? { role: "MEMBER" } : null)),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_1");
    expect(result).toEqual({ status: "assigned", group: { id: "grp_1", message: "boom", assigneeId: "user_1" } });
  });

  it("a MEMBER can unassign themselves", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: null });
    const { assignErrorGroup } = await freshAssignment({
      findTeamMembership: vi.fn().mockResolvedValue({ role: "MEMBER" }),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", null);
    expect(result.status).toBe("assigned");
  });

  it("a MEMBER is blocked from assigning to someone else", async () => {
    const { assignErrorGroup } = await freshAssignment({
      findTeamMembership: vi.fn().mockResolvedValue({ role: "MEMBER" }),
    });

    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "insufficient_role" });
  });

  it("a LEAD can assign to any team member", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findUniqueOrThrow = vi.fn().mockResolvedValue({ id: "grp_1", message: "boom", assigneeId: "user_2" });
    const { assignErrorGroup } = await freshAssignment({
      findTeamMembership: vi.fn().mockImplementation(async (_teamId, userId) => (userId === "user_1" ? { role: "LEAD" } : { role: "MEMBER" })),
      errorGroup: { updateMany, findUniqueOrThrow },
    });

    const result = await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2");
    expect(result.status).toBe("assigned");
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "grp_1", projectId: "proj_1" }, data: { assigneeId: "user_2" } });
  });

  it("rejects assigning to a non-team-member", async () => {
    const { assignErrorGroup } = await freshAssignment({
      findTeamMembership: vi.fn().mockImplementation(async (_teamId, userId) => (userId === "user_1" ? { role: "LEAD" } : null)),
    });

    expect(await assignErrorGroup(actingUser, "proj_1", "grp_1", "user_2")).toEqual({ status: "not_a_team_member" });
  });

  it("returns group_not_found when the group doesn't exist in the project", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { assignErrorGroup } = await freshAssignment({ errorGroup: { updateMany } });

    expect(await assignErrorGroup(actingUser, "proj_1", "missing-group", null)).toEqual({ status: "group_not_found" });
  });
});
