import { afterEach, describe, expect, it, vi } from "vitest";

async function freshInvitation(opts: {
  invitation?: Record<string, ReturnType<typeof vi.fn>>;
  project?: Record<string, ReturnType<typeof vi.fn>>;
  user?: Record<string, ReturnType<typeof vi.fn>>;
  projectMember?: Record<string, ReturnType<typeof vi.fn>>;
  transaction?: ReturnType<typeof vi.fn>;
}) {
  vi.resetModules();
  const tx = { projectMember: opts.projectMember ?? {}, invitation: opts.invitation ?? {}, project: opts.project ?? {} };
  vi.doMock("./db", () => ({
    prisma: {
      invitation: opts.invitation ?? {},
      project: opts.project ?? {},
      user: opts.user ?? {},
      projectMember: opts.projectMember ?? {},
      $transaction: opts.transaction ?? vi.fn((cb: (tx: unknown) => unknown) => cb(tx)),
    },
  }));
  return import("./invitation");
}

describe("createInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns forbidden when the inviter doesn't own the project", async () => {
    const findFirst = vi.fn().mockResolvedValue(null); // findOwnedProject's underlying lookup
    const { createInvitation } = await freshInvitation({ project: { findFirst } });

    const result = await createInvitation("proj_1", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "forbidden" });
  });

  it("returns already_pending when a pending invite for this email already exists", async () => {
    const projectFindFirst = vi.fn().mockResolvedValue({ id: "proj_1", name: "Rocket" });
    const invitationFindFirst = vi.fn().mockResolvedValue({ id: "inv_existing" });
    const { createInvitation } = await freshInvitation({ project: { findFirst: projectFindFirst }, invitation: { findFirst: invitationFindFirst } });

    const result = await createInvitation("proj_1", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "already_pending" });
    expect(invitationFindFirst.mock.calls[0][0].where).toEqual({ projectId: "proj_1", invitedEmail: "bob@example.com", status: "PENDING" });
  });

  it("creates the invitation and returns the raw token exactly once", async () => {
    const projectFindFirst = vi.fn().mockResolvedValue({ id: "proj_1", name: "Rocket" });
    const invitationFindFirst = vi.fn().mockResolvedValue(null);
    const create = vi.fn().mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: "inv_1", projectId: data.projectId, invitedEmail: data.invitedEmail, status: "PENDING", expiresAt: data.expiresAt, createdAt: new Date() }),
    );
    const userFindUniqueOrThrow = vi.fn().mockResolvedValue({ name: "Ada" });
    const { createInvitation } = await freshInvitation({
      project: { findFirst: projectFindFirst },
      invitation: { findFirst: invitationFindFirst, create },
      user: { findUniqueOrThrow: userFindUniqueOrThrow },
    });

    const result = await createInvitation("proj_1", "user_1", "bob@example.com");
    expect(result.status).toBe("created");
    if (result.status === "created") {
      expect(typeof result.token).toBe("string");
      expect(result.token.length).toBeGreaterThan(0);
      expect(result.projectName).toBe("Rocket");
      expect(result.inviterName).toBe("Ada");
      expect(result.invitation.id).toBe("inv_1");
    }
    expect(create.mock.calls[0][0].data.invitedById).toBe("user_1");
    expect(create.mock.calls[0][0].data).not.toHaveProperty("invitedRole");
    expect(create.mock.calls[0][0].data.tokenHash).not.toBe(result.status === "created" ? result.token : undefined);
  });
});

describe("revokeInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the update to projectId AND PENDING status", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { revokeInvitation } = await freshInvitation({ invitation: { updateMany } });

    expect(await revokeInvitation("proj_1", "inv_1")).toBe(true);
    expect(updateMany.mock.calls[0][0]).toEqual({
      where: { id: "inv_1", projectId: "proj_1", status: "PENDING" },
      data: { status: "REVOKED" },
    });
  });
});

describe("previewInvitation", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns not_found when no invitation matches the token", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const { previewInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await previewInvitation("bad-token")).toEqual({ status: "not_found" });
  });

  it("returns not_found for a non-PENDING invitation", async () => {
    const findUnique = vi.fn().mockResolvedValue({ status: "REVOKED" });
    const { previewInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await previewInvitation("token")).toEqual({ status: "not_found" });
  });

  it("returns expired for a PENDING invitation past its expiresAt", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      status: "PENDING",
      expiresAt: new Date(Date.now() - 1000),
      invitedEmail: "bob@example.com",
      project: { name: "Rocket" },
    });
    const { previewInvitation } = await freshInvitation({ invitation: { findUnique } });

    expect(await previewInvitation("token")).toEqual({ status: "expired" });
  });

  it("returns only projectName + invitedEmail on success — nothing else", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "bob@example.com",
      project: { name: "Rocket" },
    });
    const { previewInvitation } = await freshInvitation({ invitation: { findUnique } });

    const result = await previewInvitation("token");
    expect(result).toEqual({ status: "ok", projectName: "Rocket", invitedEmail: "bob@example.com" });
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
      projectId: "proj_1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "bob@example.com",
    };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const projectFindUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const memberFindUnique = vi.fn().mockResolvedValue(null);
    const memberCreate = vi.fn().mockResolvedValue({});
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({
      invitation: { findUnique, update: invitationUpdate },
      project: { findUnique: projectFindUnique },
      projectMember: { findUnique: memberFindUnique, create: memberCreate },
    });

    const result = await acceptInvitation("token", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "accepted", projectId: "proj_1" });
    expect(memberCreate.mock.calls[0][0].data).toEqual({ projectId: "proj_1", userId: "user_1" });
    expect(invitationUpdate.mock.calls[0][0]).toEqual({ where: { id: "inv_1" }, data: { status: "ACCEPTED" } });
  });

  it("is idempotent when the user is already a member — doesn't create a duplicate row", async () => {
    const invitation = {
      id: "inv_1",
      projectId: "proj_1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "bob@example.com",
    };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const projectFindUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const memberFindUnique = vi.fn().mockResolvedValue({ userId: "user_1" });
    const memberCreate = vi.fn();
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({
      invitation: { findUnique, update: invitationUpdate },
      project: { findUnique: projectFindUnique },
      projectMember: { findUnique: memberFindUnique, create: memberCreate },
    });

    const result = await acceptInvitation("token", "user_1", "bob@example.com");
    expect(result).toEqual({ status: "accepted", projectId: "proj_1" });
    expect(memberCreate).not.toHaveBeenCalled();
  });

  it("never creates a ProjectMember row for the owner, even if they redeem their own invite", async () => {
    const invitation = {
      id: "inv_1",
      projectId: "proj_1",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 1_000_000),
      invitedEmail: "owner@example.com",
    };
    const findUnique = vi.fn().mockResolvedValue(invitation);
    const projectFindUnique = vi.fn().mockResolvedValue({ ownerId: "owner_1" });
    const memberCreate = vi.fn();
    const invitationUpdate = vi.fn().mockResolvedValue({});
    const { acceptInvitation } = await freshInvitation({
      invitation: { findUnique, update: invitationUpdate },
      project: { findUnique: projectFindUnique },
      projectMember: { create: memberCreate },
    });

    const result = await acceptInvitation("token", "owner_1", "owner@example.com");
    expect(result).toEqual({ status: "accepted", projectId: "proj_1" });
    expect(memberCreate).not.toHaveBeenCalled();
  });
});
