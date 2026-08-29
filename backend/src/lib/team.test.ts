import { afterEach, describe, expect, it, vi } from "vitest";

async function freshTeam(opts: {
  team?: Record<string, ReturnType<typeof vi.fn>>;
  teamMember?: Record<string, ReturnType<typeof vi.fn>>;
  project?: Record<string, ReturnType<typeof vi.fn>>;
  transaction?: ReturnType<typeof vi.fn>;
  findOwnedProject?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();
  vi.doMock("./db", () => ({
    prisma: {
      team: opts.team ?? {},
      teamMember: opts.teamMember ?? {},
      project: opts.project ?? {},
      $transaction: opts.transaction ?? vi.fn((cb: (tx: unknown) => unknown) => cb({ team: opts.team, teamMember: opts.teamMember })),
    },
  }));
  vi.doMock("./project", () => ({ findOwnedProject: opts.findOwnedProject ?? vi.fn() }));
  return import("./team");
}

describe("createTeam", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("creates the team and a LEAD membership for the creator, in one transaction", async () => {
    const teamCreate = vi.fn().mockResolvedValue({ id: "team_1", name: "Rocket", createdById: "user_1" });
    const memberCreate = vi.fn().mockResolvedValue({});
    const { createTeam } = await freshTeam({
      team: { create: teamCreate },
      teamMember: { create: memberCreate },
    });

    const team = await createTeam("user_1", "Rocket");

    expect(teamCreate.mock.calls[0][0].data).toEqual({ name: "Rocket", createdById: "user_1" });
    expect(memberCreate.mock.calls[0][0].data).toEqual({ teamId: "team_1", userId: "user_1", role: "LEAD" });
    expect(team.id).toBe("team_1");
  });
});

describe("listTeamsForUser / findAccessibleTeam", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("scopes listTeamsForUser to team membership", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { listTeamsForUser } = await freshTeam({ team: { findMany } });

    await listTeamsForUser("user_1");
    expect(findMany.mock.calls[0][0].where).toEqual({ members: { some: { userId: "user_1" } } });
  });

  it("findAccessibleTeam is IDOR-safe — scopes to id AND membership", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { findAccessibleTeam } = await freshTeam({ team: { findFirst } });

    await findAccessibleTeam("user_1", "team_1");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "team_1", members: { some: { userId: "user_1" } } });
  });
});

describe("renameTeam / deleteTeam", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("renameTeam bakes the LEAD condition into the update's where clause", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { renameTeam } = await freshTeam({ team: { updateMany } });

    const result = await renameTeam("user_1", "team_1", "New Name");
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "team_1", members: { some: { userId: "user_1", role: "LEAD" } } });
    expect(result).toBeNull();
  });

  it("deleteTeam bakes the LEAD condition into the delete's where clause", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { deleteTeam } = await freshTeam({ team: { deleteMany } });

    const result = await deleteTeam("user_1", "team_1");
    expect(deleteMany.mock.calls[0][0].where).toEqual({ id: "team_1", members: { some: { userId: "user_1", role: "LEAD" } } });
    expect(result).toBe(true);
  });
});

describe("removeMember", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("allows a member to remove themselves (leave)", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ role: "MEMBER" }) // target lookup
      .mockResolvedValueOnce(null); // no-op, count() below
    const count = vi.fn().mockResolvedValue(1); // another LEAD remains — irrelevant, target isn't LEAD
    const del = vi.fn().mockResolvedValue({});
    const { removeMember } = await freshTeam({ teamMember: { findUnique, count, delete: del } });

    const result = await removeMember("user_1", "team_1", "user_1");
    expect(result).toBe("removed");
    expect(del).toHaveBeenCalledWith({ where: { teamId_userId: { teamId: "team_1", userId: "user_1" } } });
  });

  it("forbids a non-LEAD from removing someone else", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({ role: "MEMBER" }); // acting membership
    const { removeMember } = await freshTeam({ teamMember: { findUnique } });

    const result = await removeMember("user_1", "team_1", "user_2");
    expect(result).toBe("forbidden");
  });

  it("blocks removing the last remaining LEAD", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ role: "LEAD" }) // acting membership (self-removal path skips this — use a LEAD acting on someone else)
      .mockResolvedValueOnce({ role: "LEAD" }); // target membership
    const count = vi.fn().mockResolvedValue(0); // no other LEADs remain
    const { removeMember } = await freshTeam({ teamMember: { findUnique, count } });

    const result = await removeMember("user_1", "team_1", "user_2");
    expect(result).toBe("last_lead");
  });
});

describe("updateMemberRole", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("forbids a non-LEAD from changing anyone's role", async () => {
    const findUnique = vi.fn().mockResolvedValueOnce({ role: "MEMBER" });
    const { updateMemberRole } = await freshTeam({ teamMember: { findUnique } });

    expect(await updateMemberRole("user_1", "team_1", "user_2", "LEAD")).toBe("forbidden");
  });

  it("blocks demoting the last remaining LEAD to MEMBER", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ role: "LEAD" }) // acting
      .mockResolvedValueOnce({ role: "LEAD" }); // target
    const count = vi.fn().mockResolvedValue(0);
    const { updateMemberRole } = await freshTeam({ teamMember: { findUnique, count } });

    expect(await updateMemberRole("user_1", "team_1", "user_2", "MEMBER")).toBe("last_lead");
  });

  it("allows a LEAD to promote a member", async () => {
    const findUnique = vi
      .fn()
      .mockResolvedValueOnce({ role: "LEAD" }) // acting
      .mockResolvedValueOnce({ role: "MEMBER" }); // target
    const update = vi.fn().mockResolvedValue({});
    const { updateMemberRole } = await freshTeam({ teamMember: { findUnique, update } });

    expect(await updateMemberRole("user_1", "team_1", "user_2", "LEAD")).toBe("updated");
    expect(update.mock.calls[0][0]).toEqual({
      where: { teamId_userId: { teamId: "team_1", userId: "user_2" } },
      data: { role: "LEAD" },
    });
  });
});

describe("attachProjectToTeam / detachProjectFromTeam", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./project");
  });

  it("requires the caller to own the project", async () => {
    const findOwnedProject = vi.fn().mockResolvedValue(null);
    const { attachProjectToTeam } = await freshTeam({ findOwnedProject });

    expect(await attachProjectToTeam("user_1", "proj_1", "team_1")).toBe("project_not_found");
  });

  it("requires the owner to already be a member of the target team", async () => {
    const findOwnedProject = vi.fn().mockResolvedValue({ id: "proj_1" });
    const findUnique = vi.fn().mockResolvedValue(null);
    const { attachProjectToTeam } = await freshTeam({ findOwnedProject, teamMember: { findUnique } });

    expect(await attachProjectToTeam("user_1", "proj_1", "team_1")).toBe("not_a_team_member");
  });

  it("attaches the project once ownership and membership are both verified", async () => {
    const findOwnedProject = vi.fn().mockResolvedValue({ id: "proj_1" });
    const findUnique = vi.fn().mockResolvedValue({ role: "MEMBER" });
    const update = vi.fn().mockResolvedValue({});
    const { attachProjectToTeam } = await freshTeam({ findOwnedProject, teamMember: { findUnique }, project: { update } });

    expect(await attachProjectToTeam("user_1", "proj_1", "team_1")).toBe("attached");
    expect(update.mock.calls[0][0]).toEqual({ where: { id: "proj_1" }, data: { teamId: "team_1" } });
  });

  it("detachProjectFromTeam scopes the update to ownerId", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { detachProjectFromTeam } = await freshTeam({ project: { updateMany } });

    expect(await detachProjectFromTeam("user_1", "proj_1")).toBe(true);
    expect(updateMany.mock.calls[0][0]).toEqual({ where: { id: "proj_1", ownerId: "user_1" }, data: { teamId: null } });
  });
});
