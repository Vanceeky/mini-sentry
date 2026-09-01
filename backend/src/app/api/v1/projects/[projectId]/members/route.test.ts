import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const user = { id: "user_1", name: "Ada", email: "ada@example.com" };

async function freshRoute(
  opts: { authFails?: boolean; resolveProjectAccess?: ReturnType<typeof vi.fn>; listProjectMembers?: ReturnType<typeof vi.fn> } = {},
) {
  vi.resetModules();
  const { ERRORS } = await import("@/lib/errors");
  vi.doMock("@/lib/authGuard", () => ({
    requireSessionUser: opts.authFails ? vi.fn().mockRejectedValue(ERRORS.UNAUTHORIZED()) : vi.fn().mockResolvedValue(user),
  }));
  vi.doMock("@/lib/access", () => ({
    resolveProjectAccess: opts.resolveProjectAccess ?? vi.fn().mockResolvedValue({ id: "proj_1", ownerId: "user_1" }),
  }));
  vi.doMock("@/lib/projectMembers", () => ({
    listProjectMembers: opts.listProjectMembers ?? vi.fn().mockResolvedValue([]),
  }));
  return import("./route");
}

function ctx() {
  return { params: Promise.resolve({ projectId: "proj_1" }) };
}

describe("GET /api/v1/projects/:projectId/members", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/authGuard");
    vi.doUnmock("@/lib/access");
    vi.doUnmock("@/lib/projectMembers");
  });

  it("returns 404 when the caller can't access the project", async () => {
    const { GET } = await freshRoute({ resolveProjectAccess: vi.fn().mockResolvedValue(null) });
    const response = await GET(new Request("http://localhost:3000/x"), ctx());
    expect(response.status).toBe(404);
  });

  it("returns 200 with the member list", async () => {
    const members = [{ userId: "user_1", name: "Ada", email: "ada@example.com", isOwner: true }];
    const { GET } = await freshRoute({ listProjectMembers: vi.fn().mockResolvedValue(members) });
    const response = await GET(new Request("http://localhost:3000/x"), ctx());
    expect(response.status).toBe(200);
    expect((await response.json()) as unknown).toEqual({ success: true, members });
  });
});

describe("unsupported methods on /api/v1/projects/:projectId/members", () => {
  it("POST returns 405", async () => {
    const { POST } = await freshRoute();
    expect((await POST(new Request("http://localhost:3000/x"))).status).toBe(405);
  });
});
