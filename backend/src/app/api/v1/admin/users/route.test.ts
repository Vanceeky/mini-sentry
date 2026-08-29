import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(opts: { forbidden?: boolean; listAllUsers?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  // Same reset-epoch gotcha as elsewhere: ERRORS must come from the same
  // post-reset module instance route.ts will import.
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/adminGuard", () => ({
    requireSuperAdmin: opts.forbidden
      ? vi.fn().mockRejectedValue(ERRORS.FORBIDDEN())
      : vi.fn().mockResolvedValue({ id: "user_1", role: "SUPERADMIN" }),
  }));
  vi.doMock("@/lib/admin", () => ({
    listAllUsers: opts.listAllUsers ?? vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
  }));
  return import("./route");
}

describe("GET /api/v1/admin/users", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/adminGuard");
    vi.doUnmock("@/lib/admin");
  });

  it("returns 403 for a non-superadmin", async () => {
    const { GET } = await freshRoute({ forbidden: true });
    const response = await GET(new Request("http://localhost:3000/x"));
    expect(response.status).toBe(403);
  });

  it("returns 200 with the paginated user list for a superadmin", async () => {
    const payload = { data: [{ id: "u1", email: "ada@example.com", role: "USER" }], pagination: { page: 1, limit: 20, total: 1 } };
    const { GET } = await freshRoute({ listAllUsers: vi.fn().mockResolvedValue(payload) });

    const response = await GET(new Request("http://localhost:3000/x"));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, ...payload });
  });
});
