import { afterAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml).
describe.skipIf(!process.env.DATABASE_URL)("project management flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  const userIds: string[] = [];
  const projectIds: string[] = [];

  afterAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    if (projectIds.length) await prisma.project.deleteMany({ where: { id: { in: projectIds } } });
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

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
    const { POST: register } = await import("../auth/register/route");
    const { POST: login } = await import("../auth/login/route");
    const password = "correct-horse-battery-staple";

    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "Test User", email, password }));
    const registerBody = (await registerResponse.json()) as { user: { id: string } };
    userIds.push(registerBody.user.id);

    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    const loginBody = (await loginResponse.json()) as { token: string };
    return loginBody.token;
  }

  it("completes create -> receive API key -> ingest a real event with it", async () => {
    const { POST: createProjectRoute } = await import("./route");
    const { POST: ingestEvent } = await import("../events/route");

    const token = await registerAndLogin(`proj-flow-${Date.now()}@example.com`);

    const createResponse = await createProjectRoute(jsonRequest("/api/v1/projects", "POST", { name: "My Application" }, token));
    expect(createResponse.status).toBe(201);
    const createBody = (await createResponse.json()) as { project: { id: string; apiKey: string } };
    projectIds.push(createBody.project.id);
    expect(createBody.project.apiKey.startsWith("mnst_")).toBe(true);

    // "Install SDK / start monitoring": the freshly issued key must actually
    // authenticate a real event POST — proves Phase 10's key issuance is
    // wired to the same validation Phase 7 already uses, not a parallel path.
    const eventRequest = new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${createBody.project.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        id: "evt_flow_1",
        type: "error",
        message: "flow test",
        url: "https://example.com/",
        timestamp: new Date(0).toISOString(),
        environment: "browser",
        browser: { userAgent: "test" },
      }),
    });
    const eventResponse = await ingestEvent(eventRequest);
    expect(eventResponse.status).toBe(200);
  });

  it("prevents user A from reading, renaming, deleting, or rotating user B's project (IDOR)", async () => {
    const { POST: createProjectRoute } = await import("./route");
    const { GET, PATCH, DELETE } = await import("./[projectId]/route");
    const { POST: rotate } = await import("./[projectId]/api-key/rotate/route");

    const tokenA = await registerAndLogin(`idor-a-${Date.now()}@example.com`);
    const tokenB = await registerAndLogin(`idor-b-${Date.now()}@example.com`);

    const createResponse = await createProjectRoute(jsonRequest("/api/v1/projects", "POST", { name: "A's Project" }, tokenA));
    const createBody = (await createResponse.json()) as { project: { id: string } };
    const projectId = createBody.project.id;
    projectIds.push(projectId);

    const ctx = { params: Promise.resolve({ projectId }) };

    const getAsB = await GET(jsonRequest(`/api/v1/projects/${projectId}`, "GET", undefined, tokenB), ctx);
    expect(getAsB.status).toBe(404);

    const patchAsB = await PATCH(jsonRequest(`/api/v1/projects/${projectId}`, "PATCH", { name: "Hijacked" }, tokenB), ctx);
    expect(patchAsB.status).toBe(404);

    const rotateAsB = await rotate(jsonRequest(`/api/v1/projects/${projectId}/api-key/rotate`, "POST", undefined, tokenB), ctx);
    expect(rotateAsB.status).toBe(404);

    const deleteAsB = await DELETE(jsonRequest(`/api/v1/projects/${projectId}`, "DELETE", undefined, tokenB), ctx);
    expect(deleteAsB.status).toBe(404);

    // Confirm it's untouched and still fully accessible by its real owner.
    const getAsA = await GET(jsonRequest(`/api/v1/projects/${projectId}`, "GET", undefined, tokenA), ctx);
    expect(getAsA.status).toBe(200);
    const getAsABody = (await getAsA.json()) as { project: { name: string } };
    expect(getAsABody.project.name).toBe("A's Project");
  });
});
