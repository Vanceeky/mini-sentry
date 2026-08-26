import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  findOwnedProject?: ReturnType<typeof vi.fn>;
  listErrorGroups?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/project", () => ({
    findOwnedProject: opts.findOwnedProject ?? vi.fn().mockResolvedValue({ id: "proj_1" }),
  }));
  vi.doMock("@/lib/errorQuery", () => ({
    listErrorGroups: opts.listErrorGroups ?? vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } }),
  }));
  return import("./route");
}

function makeRequest(search = "") {
  return new Request(`http://localhost:3000/api/v1/projects/proj_1/errors${search}`);
}

function ctx(projectId = "proj_1") {
  return { params: Promise.resolve({ projectId }) };
}

describe("GET /api/v1/projects/:projectId/errors", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
    vi.doUnmock("@/lib/errorQuery");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(401);
  });

  it("returns 404 PROJECT_NOT_FOUND when the project isn't owned", async () => {
    const { GET } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(null) });
    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with data + pagination on success", async () => {
    const payload = { data: [{ id: "grp_1", message: "boom" }], pagination: { page: 1, limit: 20, total: 1 } };
    const { GET } = await freshRoute({ listErrorGroups: vi.fn().mockResolvedValue(payload) });

    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, ...payload });
  });

  it("passes parsed query params through to listErrorGroups", async () => {
    const listErrorGroups = vi.fn().mockResolvedValue({ data: [], pagination: { page: 1, limit: 20, total: 0 } });
    const { GET } = await freshRoute({ listErrorGroups });

    await GET(makeRequest("?page=2&limit=10&type=http&status=500&sort=occurrences&search=fetch"), ctx());

    expect(listErrorGroups).toHaveBeenCalledWith("proj_1", {
      page: 2,
      limit: 10,
      type: "http",
      status: 500,
      sort: "occurrences",
      search: "fetch",
    });
  });

  it("returns 400 VALIDATION_ERROR for an invalid query param", async () => {
    const { GET } = await freshRoute();
    const response = await GET(makeRequest("?limit=99999"), ctx());
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/errors", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    const response = await POST();
    expect(response.status).toBe(405);
  });
});
