import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  findOwnedProject?: ReturnType<typeof vi.fn>;
  getProjectStats?: ReturnType<typeof vi.fn>;
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
    getProjectStats: opts.getProjectStats ?? vi.fn().mockResolvedValue({ errors: 0, events: 0, activeGroups: 0, lastErrorAt: null }),
  }));
  return import("./route");
}

function makeRequest() {
  return new Request("http://localhost:3000/api/v1/projects/proj_1/stats");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1" }) };
}

describe("GET /api/v1/projects/:projectId/stats", () => {
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

  it("returns 200 with the stats shape from the brief", async () => {
    const stats = { errors: 27, events: 184, activeGroups: 8, lastErrorAt: new Date("2026-08-26T00:00:00.000Z") };
    const { GET } = await freshRoute({ getProjectStats: vi.fn().mockResolvedValue(stats) });

    const response = await GET(makeRequest(), ctx());
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ success: true, errors: 27, events: 184, activeGroups: 8 });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/stats", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    expect((await POST()).status).toBe(405);
  });
});
