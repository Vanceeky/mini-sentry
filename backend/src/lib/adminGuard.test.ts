import { afterEach, describe, expect, it, vi } from "vitest";

const ENV_KEY = "SUPERADMIN_EMAILS";
const originalEnv = process.env[ENV_KEY];

async function freshAdminGuard(opts: { userUpdate?: ReturnType<typeof vi.fn>; requireSessionUser?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { user: { update: opts.userUpdate ?? vi.fn() } } }));
  vi.doMock("./authGuard", () => ({ requireSessionUser: opts.requireSessionUser ?? vi.fn() }));
  return import("./adminGuard");
}

describe("syncSuperAdminRole", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./authGuard");
    if (originalEnv === undefined) delete process.env[ENV_KEY];
    else process.env[ENV_KEY] = originalEnv;
  });

  it("leaves an already-SUPERADMIN user unchanged (no query)", async () => {
    const userUpdate = vi.fn();
    const { syncSuperAdminRole } = await freshAdminGuard({ userUpdate });

    const role = await syncSuperAdminRole("user_1", "ada@example.com", "SUPERADMIN");
    expect(role).toBe("SUPERADMIN");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("leaves a USER unchanged when their email isn't on the allowlist", async () => {
    process.env[ENV_KEY] = "boss@example.com";
    const userUpdate = vi.fn();
    const { syncSuperAdminRole } = await freshAdminGuard({ userUpdate });

    const role = await syncSuperAdminRole("user_1", "ada@example.com", "USER");
    expect(role).toBe("USER");
    expect(userUpdate).not.toHaveBeenCalled();
  });

  it("promotes a USER whose email is on the allowlist", async () => {
    process.env[ENV_KEY] = "ada@example.com, boss@example.com";
    const userUpdate = vi.fn().mockResolvedValue({});
    const { syncSuperAdminRole } = await freshAdminGuard({ userUpdate });

    const role = await syncSuperAdminRole("user_1", "Ada@Example.com", "USER");
    expect(role).toBe("SUPERADMIN");
    expect(userUpdate.mock.calls[0][0]).toEqual({ where: { id: "user_1" }, data: { role: "SUPERADMIN" } });
  });
});

describe("requireSuperAdmin", () => {
  afterEach(() => {
    vi.doUnmock("./db");
    vi.doUnmock("./authGuard");
  });

  it("returns the user when they're SUPERADMIN", async () => {
    const user = { id: "user_1", name: "Ada", email: "ada@example.com", role: "SUPERADMIN" };
    const { requireSuperAdmin } = await freshAdminGuard({ requireSessionUser: vi.fn().mockResolvedValue(user) });

    expect(await requireSuperAdmin(new Request("http://localhost/x"))).toEqual(user);
  });

  it("throws FORBIDDEN for a regular USER", async () => {
    const user = { id: "user_1", name: "Ada", email: "ada@example.com", role: "USER" };
    const { requireSuperAdmin } = await freshAdminGuard({ requireSessionUser: vi.fn().mockResolvedValue(user) });

    await expect(requireSuperAdmin(new Request("http://localhost/x"))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
