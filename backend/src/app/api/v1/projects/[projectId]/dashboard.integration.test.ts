import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). Drives the real route handlers (not mocks)
// through: create project -> ingest events (including repeats, to prove
// grouping/occurrenceCount) -> list errors -> error detail -> list events ->
// stats, then confirms a second user gets 404 everywhere.
describe.skipIf(!process.env.DATABASE_URL)("dashboard query flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let projectId: string;
  let projectApiKey: string;
  let userAToken: string;
  let userBToken: string;
  const userIds: string[] = [];

  function jsonRequest(url: string, method: string, body?: unknown, token?: string) {
    const headers = new Headers({ "Content-Type": "application/json" });
    if (token) headers.set("Authorization", `Bearer ${token}`);
    return new Request(`http://localhost:3000${url}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  }

  async function registerAndLogin(email: string) {
    const { POST: register } = await import("../../auth/register/route");
    const { POST: login } = await import("../../auth/login/route");
    const password = "correct-horse-battery-staple";

    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "Test", email, password }));
    const registerBody = (await registerResponse.json()) as { user: { id: string } };
    userIds.push(registerBody.user.id);

    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    return ((await loginResponse.json()) as { token: string }).token;
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { POST: createProjectRoute } = await import("../route");

    userAToken = await registerAndLogin(`dashboard-a-${Date.now()}@example.com`);
    userBToken = await registerAndLogin(`dashboard-b-${Date.now()}@example.com`);

    const createResponse = await createProjectRoute(jsonRequest("/api/v1/projects", "POST", { name: "Dashboard Test Project" }, userAToken));
    const createBody = (await createResponse.json()) as { project: { id: string; apiKey: string } };
    projectId = createBody.project.id;
    projectApiKey = createBody.project.apiKey;

    const { POST: ingestEvent } = await import("../../events/route");
    async function ingest(body: Record<string, unknown>) {
      const request = new Request("http://localhost:3000/api/v1/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${projectApiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const response = await ingestEvent(request);
      expect(response.status).toBe(200);
    }

    // 3 occurrences of the same http error (one group, occurrenceCount 3).
    for (let i = 0; i < 3; i++) {
      await ingest({
        id: `evt_http_${i}`,
        type: "http",
        message: "HTTP 500 Internal Server Error",
        url: "https://example.com/",
        timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
        environment: "browser",
        browser: { userAgent: "test" },
        request: { url: "/api/users", method: "GET", statusCode: 500 },
      });
    }
    // 1 distinct JS error (a second, separate group).
    await ingest({
      id: "evt_js_1",
      type: "error",
      message: "Cannot read property of undefined",
      stack: "TypeError: Cannot read property of undefined\n  at app.js:10",
      url: "https://example.com/",
      timestamp: new Date(2026, 0, 1, 0, 5).toISOString(),
      environment: "browser",
      browser: { userAgent: "test" },
    });
  });

  afterAll(async () => {
    await prisma.errorEvent.deleteMany({ where: { projectId } });
    await prisma.errorGroup.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("lists 2 error groups, sorted by lastSeen desc by default, with the http group's occurrenceCount:3", async () => {
    const { GET } = await import("./errors/route");
    const response = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { data: Array<Record<string, unknown>>; pagination: { total: number } };

    expect(body.pagination.total).toBe(2);
    const httpGroup = body.data.find((g) => g.type === "http");
    expect(httpGroup).toMatchObject({ message: "HTTP 500 Internal Server Error", endpoint: "GET /api/users", statusCode: 500, occurrenceCount: 3 });
  });

  it("filters errors by type and search", async () => {
    const { GET } = await import("./errors/route");

    const byType = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/errors?type=error`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    const byTypeBody = (await byType.json()) as { data: Array<{ type: string }> };
    expect(byTypeBody.data).toHaveLength(1);
    expect(byTypeBody.data[0].type).toBe("error");

    const bySearch = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/errors?search=undefined`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    const bySearchBody = (await bySearch.json()) as { data: Array<{ message: string }> };
    expect(bySearchBody.data).toHaveLength(1);
    expect(bySearchBody.data[0].message).toContain("undefined");
  });

  it("returns error group detail with paginated occurrences", async () => {
    const { GET: listErrors } = await import("./errors/route");
    const listResponse = await listErrors(
      jsonRequest(`/api/v1/projects/${projectId}/errors?type=http`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    const groupId = ((await listResponse.json()) as { data: Array<{ id: string }> }).data[0].id;

    const { GET: getDetail } = await import("./errors/[errorGroupId]/route");
    const detailResponse = await getDetail(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${groupId}`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId, errorGroupId: groupId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as {
      group: { occurrenceCount: number; endpoint: string };
      occurrences: { data: unknown[]; pagination: { total: number } };
    };
    expect(detailBody.group.occurrenceCount).toBe(3);
    expect(detailBody.group.endpoint).toBe("GET /api/users");
    expect(detailBody.occurrences.pagination.total).toBe(3);
    expect(detailBody.occurrences.data).toHaveLength(3);
  });

  it("returns 404 ERROR_GROUP_NOT_FOUND for an unknown group id in an owned project", async () => {
    const { GET } = await import("./errors/[errorGroupId]/route");
    const response = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/errors/not-a-real-group`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId, errorGroupId: "not-a-real-group" }) },
    );
    expect(response.status).toBe(404);
    expect((await response.json()) as unknown).toMatchObject({ error: { code: "ERROR_GROUP_NOT_FOUND" } });
  });

  it("lists 4 raw events across both groups", async () => {
    const { GET } = await import("./events/route");
    const response = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/events`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    const body = (await response.json()) as { pagination: { total: number } };
    expect(body.pagination.total).toBe(4);
  });

  it("returns correct project-wide stats", async () => {
    const { GET } = await import("./stats/route");
    const response = await GET(
      jsonRequest(`/api/v1/projects/${projectId}/stats`, "GET", undefined, userAToken),
      { params: Promise.resolve({ projectId }) },
    );
    expect(response.status).toBe(200);
    const body = (await response.json()) as { errors: number; events: number; activeGroups: number; lastErrorAt: string };
    expect(body.errors).toBe(2);
    expect(body.events).toBe(4);
    expect(body.activeGroups).toBe(2); // both groups just created, within the active window
    expect(body.lastErrorAt).toBeTruthy();
  });

  it("returns 404 (not the data) for every dashboard endpoint when requested by a non-owner", async () => {
    const ctx = { params: Promise.resolve({ projectId }) };
    const { GET: listErrors } = await import("./errors/route");
    const { GET: getStats } = await import("./stats/route");
    const { GET: listEvents } = await import("./events/route");

    for (const [GET, path] of [
      [listErrors, "errors"],
      [getStats, "stats"],
      [listEvents, "events"],
    ] as const) {
      const response = await GET(jsonRequest(`/api/v1/projects/${projectId}/${path}`, "GET", undefined, userBToken), ctx);
      expect(response.status).toBe(404);
    }
  });
});
