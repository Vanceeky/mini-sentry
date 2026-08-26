import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  findOwnedProject?: ReturnType<typeof vi.fn>;
  updateProjectName?: ReturnType<typeof vi.fn>;
  deleteOwnedProject?: ReturnType<typeof vi.fn>;
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
    findOwnedProject: opts.findOwnedProject ?? vi.fn().mockResolvedValue(null),
    updateProjectName: opts.updateProjectName ?? vi.fn().mockResolvedValue(null),
    deleteOwnedProject: opts.deleteOwnedProject ?? vi.fn().mockResolvedValue(false),
  }));
  return import("./route");
}

function makeRequest(method: string, body?: unknown, init: { origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/projects/proj_1", {
    method,
    headers,
    body: body !== undefined || init.raw !== undefined ? (init.raw ?? JSON.stringify(body)) : undefined,
  });
}

function ctx(projectId = "proj_1") {
  return { params: Promise.resolve({ projectId }) };
}

describe("GET /api/v1/projects/:projectId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 404 PROJECT_NOT_FOUND when the project isn't owned by the caller", async () => {
    const { GET } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(null) });
    const response = await GET(makeRequest("GET"), ctx());
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "PROJECT_NOT_FOUND" } });
  });

  it("returns 200 with the project when owned", async () => {
    const project = { id: "proj_1", name: "My App", apiKeyLastFour: "abcd" };
    const { GET } = await freshRoute({ findOwnedProject: vi.fn().mockResolvedValue(project) });
    const response = await GET(makeRequest("GET"), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, project });
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    const response = await GET(makeRequest("GET"), ctx());
    expect(response.status).toBe(401);
  });
});

describe("PATCH /api/v1/projects/:projectId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 404 PROJECT_NOT_FOUND when not owned", async () => {
    const { PATCH } = await freshRoute({ updateProjectName: vi.fn().mockResolvedValue(null) });
    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with the updated project", async () => {
    const updated = { id: "proj_1", name: "New Name" };
    const updateProjectName = vi.fn().mockResolvedValue(updated);
    const { PATCH } = await freshRoute({ updateProjectName });

    const response = await PATCH(makeRequest("PATCH", { name: "New Name" }), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, project: updated });
    expect(updateProjectName).toHaveBeenCalledWith("user_1", "proj_1", "New Name");
  });

  it("returns 400 VALIDATION_ERROR for an empty name", async () => {
    const { PATCH } = await freshRoute();
    const response = await PATCH(makeRequest("PATCH", { name: "" }), ctx());
    expect(response.status).toBe(400);
  });
});

describe("DELETE /api/v1/projects/:projectId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 404 PROJECT_NOT_FOUND when not owned", async () => {
    const { DELETE } = await freshRoute({ deleteOwnedProject: vi.fn().mockResolvedValue(false) });
    const response = await DELETE(makeRequest("DELETE"), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 {success:true} when deleted", async () => {
    const { DELETE } = await freshRoute({ deleteOwnedProject: vi.fn().mockResolvedValue(true) });
    const response = await DELETE(makeRequest("DELETE"), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    const response = await POST();
    expect(response.status).toBe(405);
  });
});
