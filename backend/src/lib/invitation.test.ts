import { afterEach, describe, expect, it, vi } from "vitest";

async function freshInvitation(opts: {
  invitation?: Record<string, ReturnType<typeof vi.fn>>;
  team?: Record<string, ReturnType<typeof vi.fn>>;
  user?: Record<string, ReturnType<typeof vi.fn>>;
  teamMember?: Record<string, ReturnType<typeof vi.fn>>;
  transaction?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();
  const tx = { teamMember: opts.teamMember ?? {}, invitation: opts.invitation ?? {} };
  vi.doMock("./db", () => ({
    prisma: {
      invitation: opts.invitation ?? {},
      team: opts.team ?? {},
      user: opts.user ?? {},
      teamMember: opts.teamMember ?? {},
      $transaction: opts.transaction ?? vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    },
  }));
  return import("./invitation");
}

describe("createInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns forbidden when the inviter isn't a LEAD", async () => {
    const findUnique = vi.fn().mockResolvedValue({ role: "MEMBER" });
    const { createInvitation } = await freshInvitation({ teamMember: { findUnique } });

    const result = await createInvitation("team_1", "user_1", "bob@example.com", "MEMBER");
    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns already_pending when a pending invite for this email already exists", async () => {
    const findUnique = vi.fn().mockResolvedValue({ role: "LEAD" });
    const findFirst = vi.fn().mockResolvedValue({ id: "inv_existing" });
    const { createInvitation } = await freshInvitation({ teamMember: { findUnique }, invitation: { findFirst } });

    const result = await createInvitation("team_1", "user_1", "bob@example.com", "MEMBER");
    expect(result).toEqual({ status: "already_pending" });
    expect(findFirst.mock.calls[0][0].where).toEqual({ teamId: "team_1", invitedEmail: "bob@example.com", status: "PENDING" });
  });

  it("creates the invitation and returns the raw token exactly once", async () => {
    const findUnique = vi.fn().mockResolvedValue({ role: "LEAD" });
    const findFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "inv_1", teamId: data.teamId, invitedEmail: data.invitedEmail, invitedRole: data.invitedRole, status: "PENDING", expiresAt: data.expiresAt, createdAt: new Date() }),
    );
    const teamFindUniqueOrThrow = vi.fn().mockResolvedValue({ name: "Rocket" });
    const userFindUniqueOrThrow = vi.fn().mockResolvedValue({ name: "Ada" });
    const { createInvitation } = await freshInvitation({
      teamMember: { findUnique },
      invitation: { findFirst, create },
      team: { findUniqueOrThrow: teamFindUniqueOrThrow },
      user: { findUniqueOrThrow: userFindUniqueOrThrow },
    });

    const result = await createInvitation("team_1", "user_1", "bob@example.com", "MEMBER");
    expect(result.status).toBe("created");
    if (result.status === "created") {
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.teamName).toBe("Rocket");
      expect(result.inviterName).toBe("Ada");
      expect(result.invitation.id).toBe("inv_1");
    }
    expect(create.mock.calls[0][0].data.invitedById).toBe("user_1");
    expect(create.mock.calls[0][0].data.tokenHash).not.toBe(result.status === "created" ? result.token : undefined);
  });
});

describe("revokeInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the update to teamId AND PENDING status", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { revokeInvitation } = await freshInvitation({ invitation: { updateMany } });

    expect(await revokeInvitation("team_1", "inv_1")).toBe(true);
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { id: "inv_1", teamId: "team_1", status: "PENDING" },
      data: { status: "REVOKED" },
    });
  });
});

describe("acceptInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns not_found when no invitation matches the token", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const { acceptInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await acceptInvitation("bad-token", "user_1", "bob@example.com")).toEqual({ status: "not_found" });
  });

  it("returns not_found for a non-PENDING invitation (revoked/accepted)", async () => {
    const findUnique = vi.fn().mockResolvedValue({ id: "inv_1", status: "REVOKED" });
    const { acceptInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await acceptInvitation("token", "user_1", "bob@example.com")).toEqual({ status: "not_found" });
  });

  it("lazily expires a PENDING invitation past its expiresAt and returns expired", async () => {
    const invitation = { id: "inv_1", status: "PENDING", expiresAt: new Date(Date.now() - 1000), invitedEmail: "bob@example.com" };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const update = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({ invitation: { findUnique, update } });

    const result = await acceptInvitation("token", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "expired" });
    expect(update.mock.calls[0][0]).toEqual({ where: { id: "inv_1" }, data: { status: "EXPIRED" } });
  });

  it("returns email_mismatch when the accepting user's email doesn't match", async () => {
    const invitation = { id: "inv_1", status: "PENDING", expiresAt: new Date(Date.now() + 1_000_000), invitedEmail: "bob@example.com" };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const { acceptInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await acceptInvitation("token", "user_1", "someone-else@example.com")).toEqual({ status: "email_mismatch" });
  });

  it("creates the membership and marks the invitation ACCEPTED on success", async () => {
    const invitation = {
      id: "inv_1",
      teamId: "team_1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "bob@example.com",
      invitedRole: "MEMBER",
    };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const memberFindUnique = vi.fn().mockResolvedValue(null);
    const memberCreate = vi.fn().mockResolvedValue({});
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({
      invitation: { findUnique, update: invitationUpdate },
      teamMember: { findUnique: memberFindUnique, create: memberCreate },
    });

    const result = await acceptInvitation("token", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "accepted", teamId: "team_1" });
    expect(memberCreate.mock.calls[0][0].data).toEqual({ teamId: "team_1", userId: "user_1", role: "MEMBER" });
    expect(invitationUpdate.mock.calls[0][0]).toEqual({ where: { id: "inv_1" }, data: { status: "ACCEPTED" } });
  });

  it("is idempotent when the user is already a member — doesn't create a duplicate row", async () => {
    const invitation = {
      id: "inv_1",
      teamId: "team_1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "bob@example.com",
      invitedRole: "MEMBER",
    };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const memberFindUnique = vi.fn().mockResolvedValue({ role: "MEMBER" });
    const memberCreate = vi.fn();
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({
      invitation: { findUnique, update: invitationUpdate },
      teamMember: { findUnique: memberFindUnique, create: memberCreate },
    });

    const result = await acceptInvitation("token", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "accepted", teamId: "team_1" });
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
