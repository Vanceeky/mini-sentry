import { afterEach, describe, expect, it, vi } from "vitest";

async function freshSession() {
  vi.resetModules();
  return import("./session");
}

describe("createSession", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("creates a session row with a hashed token and a future expiry", async () => {
    const create = vi.fn().mockResolvedValue({});
    vi.doMock("./db", () => ({ prisma: { session: { create } } }));

    const { createSession } = await freshSession();
    const result = await createSession("user_1");

    expect(create).toHaveBeenCalledTimes(1);
    const args = create.mock.calls[0][0];
    expect(args.data.userId).toBe("user_1");
    expect(args.data.tokenHash).not.toBe(result.token);
    expect(args.data.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(result.token).toMatch(/^[0-9a-f]{64}$/);
  });

  it("generates a different token on each call", async () => {
    vi.doMock("./db", () => ({ prisma: { session: { create: vi.fn().mockResolvedValue({}) } } }));
    const { createSession } = await freshSession();

    const a = await createSession("user_1");
    const b = await createSession("user_1");
    expect(a.token).not.toBe(b.token);
  });
});

describe("findUserBySessionToken", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns the user for a valid, unexpired session", async () => {
    const user = { id: "user_1", name: "Ada", email: "ada@example.com" };
    const findUnique = vi.fn().mockResolvedValue({ expiresAt: new Date(Date.now() + 1000_000), user });
    vi.doMock("./db", () => ({ prisma: { session: { findUnique } } }));

    const { findUserBySessionToken } = await freshSession();
    expect(await findUserBySessionToken("some-token")).toEqual(user);
  });

  it("returns null when no session matches", async () => {
    vi.doMock("./db", () => ({ prisma: { session: { findUnique: vi.fn().mockResolvedValue(null) } } }));
    const { findUserBySessionToken } = await freshSession();
    expect(await findUserBySessionToken("unknown-token")).toBeNull();
  });

  it("returns null for an expired session", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      expiresAt: new Date(Date.now() - 1000),
      user: { id: "user_1", name: "Ada", email: "ada@example.com" },
    });
    vi.doMock("./db", () => ({ prisma: { session: { findUnique } } }));

    const { findUserBySessionToken } = await freshSession();
    expect(await findUserBySessionToken("expired-token")).toBeNull();
  });
});

describe("deleteSessionByToken", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("deletes by the token's hash", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    vi.doMock("./db", () => ({ prisma: { session: { deleteMany } } }));

    const { deleteSessionByToken } = await freshSession();
    await deleteSessionByToken("some-token");

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(deleteMany.mock.calls[0][0].where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("does not throw when no session matches (idempotent logout)", async () => {
    vi.doMock("./db", () => ({ prisma: { session: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) } } }));
    const { deleteSessionByToken } = await freshSession();
    await expect(deleteSessionByToken("unknown-token")).resolves.toBeUndefined();
  });
});
