import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(opts: { forbidden?: boolean; listAllTeams?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/adminGuard", () => ({
    requireSuperAdmin: opts.forbidden
      ? vi.fn().mockRejectedValue(ERRORS.FORBIDDEN())
      : vi.fn().mockResolvedValue({ id: "user_1", role: "SUPERADMIN" }),
  }));
  vi.doMock("@/lib/admin", () => ({
    listAllTeams: opts.listAllTeams ?? vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
  }));
  return import("./route");
}

describe("GET /api/v1/admin/teams", () => {
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

  it("returns 200 with the paginated team list ('my clients') for a superadmin", async () => {
    const payload = {
      data: [{ id: "team_1", name: "Rocket", memberCount: 3, projectCount: 2 }],
      pagination: { page: 1, limit: 20, total: 1 },
    };
    const { GET } = await freshRoute({ listAllTeams: vi.fn().mockResolvedValue(payload) });

    const response = await GET(new Request("http://localhost:3000/x"));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, ...payload });
  });
});
