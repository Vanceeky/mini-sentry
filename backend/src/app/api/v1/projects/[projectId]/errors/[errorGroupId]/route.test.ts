import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: {
    authFails?: boolean;
    resolveProjectAccess?: ReturnType<typeof vi.fn>;
    getErrorGroupDetail?: ReturnType<typeof vi.fn>;
    assignErrorGroup?: ReturnType<typeof vi.fn>;
    notifyUser?: ReturnType<typeof vi.fn>;
  } = {},
) {
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
    getErrorGroupDetail: opts.getErrorGroupDetail ?? vi.fn().mockResolvedValue(null),
  }));
  vi.doMock("@/lib/assignment", () => ({
    assignErrorGroup:
      opts.assignErrorGroup ??
      vi.fn().mockResolvedValue({ status: "assigned", group: { id: "grp_1", message: "boom", assigneeId: "user_1" } }),
  }));
  vi.doMock("@/lib/notification", () => ({
    getNotificationService: () => ({ notifyUser: opts.notifyUser ?? vi.fn().mockResolvedValue(undefined) }),
  }));
  return import("./route");
}

function makeRequest(search = "") {
  return new Request(`http://localhost:3000/api/v1/projects/proj_1/errors/grp_1${search}`);
}

function patchRequest(body: unknown) {
  return new Request("http://localhost:3000/api/v1/projects/proj_1/errors/grp_1", {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1", errorGroupId: "grp_1" }) };
}

describe("GET /api/v1/projects/:projectId/errors/:errorGroupId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/access");
    vi.doUnmock("@/lib/errorQuery");
    vi.doUnmock("@/lib/assignment");
    vi.doUnmock("@/lib/notification");
  });

  it("returns 401 when not authenticated", async () => {
    const { GET } = await freshRoute({ authFails: true });
    expect((await GET(makeRequest(), ctx())).status).toBe(401);
  });

  it("returns 404 PROJECT_NOT_FOUND when the project isn't accessible", async () => {
    const { GET } = await freshRoute({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
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

describe("PATCH /api/v1/projects/:projectId/errors/:errorGroupId", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/access");
    vi.doUnmock("@/lib/errorQuery");
    vi.doUnmock("@/lib/assignment");
    vi.doUnmock("@/lib/notification");
  });

  it("returns 401 when not authenticated", async () => {
    const { PATCH } = await freshRoute({ authFails: true });
    expect((await PATCH(patchRequest({ assigneeId: "user_2" }), ctx())).status).toBe(401);
  });

  it("returns 400 VALIDATION_ERROR when assigneeId is missing", async () => {
    const { PATCH } = await freshRoute();
    const response = await PATCH(patchRequest({}), ctx());
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 409 PROJECT_NOT_ON_TEAM when the lib layer reports it", async () => {
    const { PATCH } = await freshRoute({ assignErrorGroup: vi.fn().mockResolvedValue({ status: "project_not_on_team" }) });
    const response = await PATCH(patchRequest({ assigneeId: "user_2" }), ctx());
    expect(response.status).toBe(409);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "PROJECT_NOT_ON_TEAM" } });
  });

  it("returns 403 INSUFFICIENT_ROLE when a member tries to assign someone else", async () => {
    const { PATCH } = await freshRoute({ assignErrorGroup: vi.fn().mockResolvedValue({ status: "insufficient_role" }) });
    const response = await PATCH(patchRequest({ assigneeId: "user_2" }), ctx());
    expect(response.status).toBe(403);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INSUFFICIENT_ROLE" } });
  });

  it("returns 400 NOT_A_TEAM_MEMBER when the target isn't on the team", async () => {
    const { PATCH } = await freshRoute({ assignErrorGroup: vi.fn().mockResolvedValue({ status: "not_a_team_member" }) });
    const response = await PATCH(patchRequest({ assigneeId: "user_2" }), ctx());
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "NOT_A_TEAM_MEMBER" } });
  });

  it("returns 200 and notifies the assignee on success", async () => {
    const notifyUser = vi.fn().mockResolvedValue(undefined);
    const { PATCH } = await freshRoute({ notifyUser });

    const response = await PATCH(patchRequest({ assigneeId: "user_1" }), ctx());
    expect(response.status).toBe(200);
    expect(notifyUser).toHaveBeenCalledWith(
      "user_1",
      expect.objectContaining({ type: "ASSIGNED_ERROR", projectId: "proj_1", errorGroupId: "grp_1" }),
    );
  });

  it("does not notify on unassign", async () => {
    const notifyUser = vi.fn().mockResolvedValue(undefined);
    const assignErrorGroup = vi.fn().mockResolvedValue({ status: "assigned", group: { id: "grp_1", message: "boom", assigneeId: null } });
    const { PATCH } = await freshRoute({ assignErrorGroup, notifyUser });

    const response = await PATCH(patchRequest({ assigneeId: null }), ctx());
    expect(response.status).toBe(200);
    expect(notifyUser).not.toHaveBeenCalled();
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/errors/:errorGroupId", () => {
  it("POST returns 405 METHOD_NOT_ALLOWED", async () => {
    const { POST } = await freshRoute();
    expect((await POST(new Request("http://localhost:3000/api/v1/projects/proj_1/errors/grp_1"))).status).toBe(405);
  });
});
