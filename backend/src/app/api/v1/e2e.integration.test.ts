import { afterAll, describe, expect, it } from "vitest";

/**
 * Phase 13's explicit acceptance test: the brief asks for automated
 * integration tests covering the main flow — Register -> Login ->
 * Create Project -> Receive API Key -> Send SDK Event -> Persist Event ->
 * Group Event -> Query Error -> Query Stats — plus a separate Mobile flow:
 * Authenticate -> Get Projects -> Get Errors -> Get Error Detail. This file
 * is that literal flow, driving the real route handlers end to end against
 * real Postgres (not mocks) — a single canonical read of "does the whole
 * system actually work together," distinct from the narrower/mocked unit
 * tests and the other phase-specific integration suites.
 *
 * Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
 * backend/docker-compose.yml).
 */
describe.skipIf(!process.env.DATABASE_URL)("main flow (Register -> ... -> Query Stats) + mobile flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let projectId: string;
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

  afterAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    if (projectId) {
      await prisma.errorEvent.deleteMany({ where: { projectId } });
      await prisma.errorGroup.deleteMany({ where: { projectId } });
      await prisma.project.deleteMany({ where: { id: projectId } });
    }
    if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("completes the full main flow end to end", async () => {
    const { POST: register } = await import("./auth/register/route");
    const { POST: login } = await import("./auth/login/route");
    const { POST: createProjectRoute } = await import("./projects/route");
    const { POST: ingestEvent } = await import("./events/route");
    const { GET: listErrors } = await import("./projects/[projectId]/errors/route");
    const { GET: getErrorDetail } = await import("./projects/[projectId]/errors/[errorGroupId]/route");
    const { GET: getStats } = await import("./projects/[projectId]/stats/route");

    const email = `e2e-main-${Date.now()}@example.com`;
    const password = "correct-horse-battery-staple";

    // 1. Register
    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "E2E Main", email, password }));
    expect(registerResponse.status).toBe(201);
    const { user } = (await registerResponse.json()) as { user: { id: string; email: string } };
    userIds.push(user.id);
    expect(user.email).toBe(email);

    // 2. Login
    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    expect(loginResponse.status).toBe(200);
    const { token } = (await loginResponse.json()) as { token: string };
    expect(typeof token).toBe("string");

    // 3. Create Project
    const createResponse = await createProjectRoute(jsonRequest("/api/v1/projects", "POST", { name: "E2E Main App" }, token));
    expect(createResponse.status).toBe(201);
    const { project } = (await createResponse.json()) as { project: { id: string; apiKey: string } };
    projectId = project.id;

    // 4. Receive API Key
    expect(project.apiKey.startsWith("mnst_")).toBe(true);

    // 5. Send SDK Event — twice, to prove grouping in step 7
    for (let i = 0; i < 2; i++) {
      const eventResponse = await ingestEvent(
        new Request("http://localhost:3000/api/v1/events", {
          method: "POST",
          headers: { Authorization: `Bearer ${project.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `evt_e2e_main_${i}`,
            type: "error",
            message: "E2E main flow error",
            url: "https://example.com/",
            timestamp: new Date(2026, 0, 1, 0, i).toISOString(),
            environment: "browser",
            browser: { userAgent: "e2e-test" },
          }),
        }),
      );
      // 6. Persist Event — a 200 here means the event was validated,
      // persisted, and (per Phase 8's transaction) grouped, all before this
      // response was returned.
      expect(eventResponse.status).toBe(200);
    }

    // 7. Group Event — confirm the two occurrences collapsed into one group.
    const errorsResponse = await listErrors(jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, token), {
      params: Promise.resolve({ projectId }),
    });
    expect(errorsResponse.status).toBe(200);
    const errorsBody = (await errorsResponse.json()) as { data: Array<{ id: string; occurrenceCount: number; message: string }> };
    expect(errorsBody.data).toHaveLength(1);
    expect(errorsBody.data[0].occurrenceCount).toBe(2);
    const groupId = errorsBody.data[0].id;

    // 8. Query Error (detail)
    const detailResponse = await getErrorDetail(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${groupId}`, "GET", undefined, token),
      { params: Promise.resolve({ projectId, errorGroupId: groupId }) },
    );
    expect(detailResponse.status).toBe(200);
    const detailBody = (await detailResponse.json()) as { group: { occurrenceCount: number }; occurrences: { data: unknown[] } };
    expect(detailBody.group.occurrenceCount).toBe(2);
    expect(detailBody.occurrences.data).toHaveLength(2);

    // 9. Query Stats
    const statsResponse = await getStats(jsonRequest(`/api/v1/projects/${projectId}/stats`, "GET", undefined, token), {
      params: Promise.resolve({ projectId }),
    });
    expect(statsResponse.status).toBe(200);
    const statsBody = (await statsResponse.json()) as { errors: number; events: number; activeGroups: number };
    expect(statsBody.errors).toBe(1);
    expect(statsBody.events).toBe(2);
    expect(statsBody.activeGroups).toBe(1);
  });

  it("completes the mobile flow: Authenticate -> Get Projects -> Get Errors -> Get Error Detail", async () => {
    // Deliberately reuses the SAME route handlers as the "web dashboard"
    // flow above — proving there are no mobile-specific endpoints, per the
    // brief's explicit requirement (see plans/DECISIONS.md, Phase 11).
    const { POST: register } = await import("./auth/register/route");
    const { POST: login } = await import("./auth/login/route");
    const { GET: listProjects } = await import("./projects/route");
    const { GET: listErrors } = await import("./projects/[projectId]/errors/route");
    const { GET: getErrorDetail } = await import("./projects/[projectId]/errors/[errorGroupId]/route");

    const email = `e2e-mobile-${Date.now()}@example.com`;
    const password = "correct-horse-battery-staple";

    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "E2E Mobile", email, password }));
    const { user } = (await registerResponse.json()) as { user: { id: string } };
    userIds.push(user.id);

    // Authenticate
    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    const { token } = (await loginResponse.json()) as { token: string };

    // Get Projects — the mobile user has none yet, but the call must
    // succeed and return an empty, well-formed list (not an error).
    const projectsResponse = await listProjects(jsonRequest("/api/v1/projects", "GET", undefined, token));
    expect(projectsResponse.status).toBe(200);
    const { projects } = (await projectsResponse.json()) as { projects: unknown[] };
    expect(projects).toEqual([]);

    // Get Errors on the shared project from the main flow above — this
    // mobile user does NOT own it, so this must 404, never leak data.
    const errorsAsMobile = await listErrors(jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, token), {
      params: Promise.resolve({ projectId }),
    });
    expect(errorsAsMobile.status).toBe(404);

    // Get Error Detail — same non-ownership 404, confirming the mobile
    // client sees identical authorization behavior to the dashboard.
    const detailAsMobile = await getErrorDetail(
      jsonRequest(`/api/v1/projects/${projectId}/errors/not-a-real-group`, "GET", undefined, token),
      { params: Promise.resolve({ projectId, errorGroupId: "not-a-real-group" }) },
    );
    expect(detailAsMobile.status).toBe(404);
    const detailAsMobileBody = (await detailAsMobile.json()) as { error: { code: string } };
    // PROJECT_NOT_FOUND, not ERROR_GROUP_NOT_FOUND — ownership is checked
    // before the group lookup even happens.
    expect(detailAsMobileBody.error.code).toBe("PROJECT_NOT_FOUND");
  });
});
