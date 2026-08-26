import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  rotateApiKey?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  // See projects/route.test.ts's freshRoute for why this must be built from
  // a post-reset module instance rather than a statically-imported one.
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/project", () => ({
    rotateApiKey: opts.rotateApiKey ?? vi.fn().mockResolvedValue(null),
  }));
  return import("./route");
}

function makeRequest() {
  return new Request("http://localhost:3000/api/v1/projects/proj_1/api-key/rotate", { method: "POST" });
}

function ctx(projectId = "proj_1") {
  return { params: Promise.resolve({ projectId }) };
}

describe("POST /api/v1/projects/:projectId/api-key/rotate", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 401 when not authenticated", async () => {
    const { POST } = await freshRoute({ authFails: true });
    const response = await POST(makeRequest(), ctx());
    expect(response.status).toBe(401);
  });

  it("returns 404 PROJECT_NOT_FOUND when not owned", async () => {
    const { POST } = await freshRoute({ rotateApiKey: vi.fn().mockResolvedValue(null) });
    const response = await POST(makeRequest(), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with the new raw apiKey when owned", async () => {
    const rotateApiKey = vi.fn().mockResolvedValue("mnst_newrawkey");
    const { POST } = await freshRoute({ rotateApiKey });

    const response = await POST(makeRequest(), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, apiKey: "mnst_newrawkey" });
    expect(rotateApiKey).toHaveBeenCalledWith("user_1", "proj_1");
  });
});

describe("unsupported methods on rotate", () => {
  it("GET returns 405 METHOD_NOT_ALLOWED", async () => {
    const { GET } = await freshRoute();
    const response = await GET(new Request("http://localhost:3000/api/v1/projects/proj_1/api-key/rotate"));
    expect(response.status).toBe(405);
  });
});
