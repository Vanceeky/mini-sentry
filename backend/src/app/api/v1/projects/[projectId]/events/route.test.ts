import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  resolveProjectAccess?: ReturnType<typeof vi.fn>;
  listProjectEvents?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/access", () => ({
    resolveProjectAccess: opts.resolveProjectAccess ?? vi.fn().mockResolvedValue({ id: "proj_1", teamId: null }),
  }));
  vi.doMock("@/lib/errorQuery", () => ({
    listProjectEvents: opts.listProjectEvents ?? vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
  }));
  return import("./route");
}

function makeRequest(search = "") {
  return new Request(`http://localhost:3000/api/v1/projects/proj_1/events${search}`);
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1" }) };
}

describe("GET /api/v1/projects/:projectId/events", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/access");
    vi.doUnmock("@/lib/errorQuery");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    expect((await GET(makeRequest(), ctx())).status).toBe(401);
  });

  it("returns 404 PROJECT_NOT_FOUND when the project isn't owned", async () => {
    const { GET } = await freshRoute({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
    expect((await GET(makeRequest(), ctx())).status).toBe(404);
  });

  it("returns 200 with data + pagination on success", async () => {
    const payload = { data: [{ id: "evt_1" }], pagination: { page: 1, limit: 20, total: 1 } };
    const { GET } = await freshRoute({ listProjectEvents: vi.fn().mockResolvedValue(payload) });

    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, ...payload });
  });

  it("passes the type filter through", async () => {
    const listProjectEvents = vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
    const { GET } = await freshRoute({ listProjectEvents });

    await GET(makeRequest("?type=http"), ctx());
    expect(listProjectEvents).toHaveBeenCalledWith("proj_1", { page: 1, limit: 20, type: "http" });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/events", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    expect((await POST(new Request("http://localhost:3000/api/v1/projects/proj_1/events"))).status).toBe(405);
  });
});
