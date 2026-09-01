import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

async function freshRoute(opts: { previewInvitation?: ReturnType<typeof vi.fn> } = {}) {
  vi.resetModules();
  vi.doMock("@/lib/invitation", () => ({
    previewInvitation: opts.previewInvitation ?? vi.fn().mockResolvedValue({ status: "ok", projectName: "Rocket", invitedEmail: "bob@example.com" }),
  }));
  return import("./route");
}

describe("GET /api/v1/invitations/preview", () => {
  beforeEach(() => vi.spyOn(console, "error").mockImplementation(() => {}));
  afterEach(() => {
    vi.restoreAllMocks();
    vi.doUnmock("@/lib/invitation");
  });

  it("requires no Authorization header at all", async () => {
    const { GET } = await freshRoute();
    // Deliberately no Authorization header on this request.
    const response = await GET(new Request("http://localhost:3000/x?token=abc"));
    expect(response.status).toBe(200);
  });

  it("returns 400 VALIDATION_ERROR when token is missing", async () => {
    const { GET } = await freshRoute();
    const response = await GET(new Request("http://localhost:3000/x"));
    expect(response.status).toBe(400);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "VALIDATION_ERROR" } });
  });

  it("returns 404 INVITATION_NOT_FOUND for an unknown token", async () => {
    const { GET } = await freshRoute({ previewInvitation: vi.fn().mockResolvedValue({ status: "not_found" }) });
    const response = await GET(new Request("http://localhost:3000/x?token=bad"));
    expect(response.status).toBe(404);
  });

  it("returns 404 INVITATION_EXPIRED for an expired token", async () => {
    const { GET } = await freshRoute({ previewInvitation: vi.fn().mockResolvedValue({ status: "expired" }) });
    const response = await GET(new Request("http://localhost:3000/x?token=old"));
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "INVITATION_EXPIRED" } });
  });

  it("returns only projectName + invitedEmail on success", async () => {
    const { GET } = await freshRoute();
    const response = await GET(new Request("http://localhost:3000/x?token=abc"));
    expect((await response.json()) as unknown).toEqual({ success: true, projectName: "Rocket", invitedEmail: "bob@example.com" });
  });
});

describe("unsupported methods on /api/v1/invitations/preview", () => {
  it("POST returns 405", async () => {
    const { POST } = await freshRoute();
    expect((await POST(new Request("http://localhost:3000/x"))).status).toBe(405);
  });
});
