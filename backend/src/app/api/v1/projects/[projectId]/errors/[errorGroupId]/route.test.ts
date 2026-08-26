import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  findOwnedProject?: ReturnType<typeof vi.fn>;
  getErrorGroupDetail?: ReturnType<typeof vi.fn>;
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
    getErrorGroupDetail: opts.getErrorGroupDetail ?? vi.fn().mockResolvedValue(null),
  }));
  return import("./route");
}

function makeRequest(search = "") {
  return new Request(`http://localhost:3000/api/v1/projects/proj_1/errors/grp_1${search}`);
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1", errorGroupId: "grp_1" }) };
}

describe("GET /api/v1/projects/:projectId/errors/:errorGroupId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
    vi.doUnmock("@/lib/errorQuery");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    expect((await GET(makeRequest(), ctx())).status).toBe(401);
  });

  it("returns 404 PROJECT_NOT_FOUND when the project isn't owned", async () => {
    const { GET } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(null) });
    expect((await GET(makeRequest(), ctx())).status).toBe(404);
  });

  it("returns 404 ERROR_GROUP_NOT_FOUND when the group doesn't exist in the (owned) project", async () => {
    const { GET } = await freshRoute({ getErrorGroupDetail: vi.fn().mockResolvedValue(null) });
    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "ERROR_GROUP_NOT_FOUND" } });
  });

  it("returns 200 with group + occurrences on success", async () => {
    const detail = {
      group: { id: "grp_1", message: "boom", stack: "Error: boom" },
      occurrences: { data: [], pagination: { page: 1, limit: 20, total: 0 } },
    };
    const { GET } = await freshRoute({ getErrorGroupDetail: vi.fn().mockResolvedValue(detail) });

    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, ...detail });
  });

  it("passes the parsed occurrences page/limit through", async () => {
    const getErrorGroupDetail = vi.fn().mockResolvedValue({
      group: { id: "grp_1" },
      occurrences: { data: [], pagination: { page: 2, limit: 5, total: 0 } },
    });
    const { GET } = await freshRoute({ getErrorGroupDetail });

    await GET(makeRequest("?page=2&limit=5"), ctx());
    expect(getErrorGroupDetail).toHaveBeenCalledWith("proj_1", "grp_1", { page: 2, limit: 5 });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/errors/:errorGroupId", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    expect((await POST()).status).toBe(405);
  });
});
