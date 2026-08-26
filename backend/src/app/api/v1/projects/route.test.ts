import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(opts: {
  authFails?: boolean;
  listOwnedProjects?: ReturnType<typeof vi.fn>;
  createProject?: ReturnType<typeof vi.fn>;
} = {}) {
  vi.resetModules();
  // ApiError rejections must come from the SAME post-reset module instance
  // route.ts will import — an ApiError built from a statically-imported
  // module fails `instanceof ApiError` after resetModules() gives route.ts
  // a fresh copy of lib/errors.
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails
      ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED())
      : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/project", () => ({
    listOwnedProjects: opts.listOwnedProjects ?? vi.fn().mockResolvedValue([]),
    createProject: opts.createProject ?? vi.fn(),
  }));
  return import("./route");
}

function makeRequest(method: string, body?: unknown, init: { auth?: string; origin?: string; raw?: string } = {}) {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (init.auth !== undefined) headers.set("Authorization", init.auth);
  if (init.origin !== undefined) headers.set("Origin", init.origin);
  return new Request("http://localhost:3000/api/v1/projects", {
    method,
    headers,
    body: body !== undefined || init.raw !== undefined ? (init.raw ?? JSON.stringify(body)) : undefined,
  });
}

describe("GET /api/v1/projects", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 401 UNAUTHORIZED when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(401);
  });

  it("returns 200 with the current user's projects", async () => {
    const projects = [{ id: "proj_1", name: "App", apiKeyLastFour: "abcd" }];
    const { GET } = await freshRoute({ listOwnedProjects: vi.fn().mockResolvedValue(projects) });

    const response = await GET(makeRequest("GET"));
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, projects });
  });
});

describe("POST /api/v1/projects", () => {
  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/project");
  });

  it("returns 201 with the project including apiKey", async () => {
    const created = { id: "proj_1", name: "My App", apiKeyLastFour: "wxyz", apiKey: "mnst_rawkey" };
    const createProject = vi.fn().mockResolvedValue(created);
    const { POST } = await freshRoute({ createProject });

    const response = await POST(makeRequest("POST", { name: "My App" }));
    expect(response.status).toBe(201);
    expect((await response.json()) as unknown).toEqual({ success: true, project: created });
    expect(createProject).toHaveBeenCalledWith("user_1", "My App");
  });

  it("returns 400 VALIDATION_ERROR for a missing name", async () => {
    const { POST } = await freshRoute();
    const response = await POST(makeRequest("POST", {}));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 400 VALIDATION_ERROR for malformed JSON", async () => {
    const { POST } = await freshRoute();
    const response = await POST(makeRequest("POST", undefined, { raw: "{not json" }));
    expect(response.status).toBe(400);
  });

  it("returns 401 UNAUTHORIZED when not authenticated (never reaches createProject)", async () => {
    const createProject = vi.fn();
    const { POST } = await freshRoute({ authFails: true, createProject });

    const response = await POST(makeRequest("POST", { name: "My App" }));
    expect(response.status).toBe(401);
    expect(createProject).not.toHaveBeenCalled();
  });

  it("attaches CORS headers for an allowed origin", async () => {
    const { POST } = await freshRoute({ createProject: vi.fn().mockResolvedValue({ id: "proj_1" }) });
    const response = await POST(makeRequest("POST", { name: "My App" }, { origin: "http://localhost:5173" }));
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:5173");
  });
});

describe("OPTIONS /api/v1/projects", () => {
  const originalEnv = process.env.CORS_ALLOWED_ORIGINS;

  beforeEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = "http://localhost:5173";
  });

  afterEach(() => {
    process.env.CORS_ALLOWED_ORIGINS = originalEnv;
  });

  it("advertises GET and POST (both real methods this route supports), not just POST", async () => {
    const { OPTIONS } = await freshRoute();
    const response = await OPTIONS(makeRequest("OPTIONS", undefined, { origin: "http://localhost:5173" }));
    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Methods")).toBe("GET, POST, OPTIONS");
  });
});
