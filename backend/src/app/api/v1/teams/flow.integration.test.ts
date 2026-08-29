import { afterAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). Exercises the full Phase 14 flow end to end:
// create team -> invite by email -> accept via token -> attach a project ->
// team-member read access -> self-assign -> LEAD reassign -> permission
// denial -> member removal -> access revoked.
describe.skipIf(!process.env.DATABASE_URL)("teams/invitations/assignment flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  const userIds: string[] = [];
  const projectIds: string[] = [];
  const teamIds: string[] = [];

  afterAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    if (teamIds.length) await prisma.team.deleteMany({ where: { id: { in: teamIds } } });
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
    return { token: loginBody.token, userId: registerBody.user.id };
  }

  it("supports the full invite -> accept -> attach -> assign -> permission-denied -> remove flow", async () => {
    const { POST: createTeam } = await import("./route");
    const { POST: createInvitation } = await import("./[teamId]/invitations/route");
    const { POST: acceptInvitation } = await import("../invitations/accept/route");
    const { POST: createProject } = await import("../projects/route");
    const { PUT: attachTeam } = await import("../projects/[projectId]/team/route");
    const { GET: listErrors } = await import("../projects/[projectId]/errors/route");
    const { PATCH: assignErrorGroupRoute } = await import("../projects/[projectId]/errors/[errorGroupId]/route");
    const { DELETE: removeMemberRoute } = await import("./[teamId]/members/[userId]/route");
    const { POST: ingestEvent } = await import("../events/route");

    const suffix = Date.now();
    const a = await registerAndLogin(`team-flow-a-${suffix}@example.com`);
    const b = await registerAndLogin(`team-flow-b-${suffix}@example.com`);
    const c = await registerAndLogin(`team-flow-c-${suffix}@example.com`);

    // A creates a team and is its first LEAD.
    const teamResponse = await createTeam(jsonRequest("/api/v1/teams", "POST", { name: "Rocket" }, a.token));
    expect(teamResponse.status).toBe(201);
    const teamBody = (await teamResponse.json()) as { team: { id: string } };
    const teamId = teamBody.team.id;
    teamIds.push(teamId);
    const teamCtx = { params: Promise.resolve({ teamId }) };

    // A invites B and C by email; both accept via the returned token.
    for (const invitee of [b, c]) {
      const inviteResponse = await createInvitation(
        jsonRequest(`/api/v1/teams/${teamId}/invitations`, "POST", { email: `team-flow-${invitee === b ? "b" : "c"}-${suffix}@example.com` }, a.token),
        teamCtx,
      );
      expect(inviteResponse.status).toBe(201);
      const inviteBody = (await inviteResponse.json()) as { token: string };

      const acceptResponse = await acceptInvitation(
        jsonRequest("/api/v1/invitations/accept", "POST", { token: inviteBody.token }, invitee.token),
      );
      expect(acceptResponse.status).toBe(200);
    }

    // A creates a project and attaches it to the team.
    const projectResponse = await createProject(jsonRequest("/api/v1/projects", "POST", { name: "Shared App" }, a.token));
    const projectBody = (await projectResponse.json()) as { project: { id: string; apiKey: string } };
    const projectId = projectBody.project.id;
    projectIds.push(projectId);

    const attachResponse = await attachTeam(
      jsonRequest(`/api/v1/projects/${projectId}/team`, "PUT", { teamId }, a.token),
      { params: Promise.resolve({ projectId }) },
    );
    expect(attachResponse.status).toBe(200);

    // B (a mere team member, not the project owner) can now read the project's errors.
    const errorsAsB = await listErrors(
      jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, b.token),
      { params: Promise.resolve({ projectId }) },
    );
    expect(errorsAsB.status).toBe(200);

    // Ingest a real event via the project's API key to produce an error group to assign.
    const eventResponse = await ingestEvent(
      new Request("http://localhost:3000/api/v1/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${projectBody.project.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "evt_team_flow_1",
          type: "error",
          message: "team flow test",
          url: "https://example.com/",
          timestamp: new Date(0).toISOString(),
          environment: "browser",
          browser: { userAgent: "test" },
        }),
      }),
    );
    expect(eventResponse.status).toBe(200);

    const groupsAfterIngest = await listErrors(
      jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, a.token),
      { params: Promise.resolve({ projectId }) },
    );
    const groupsBody = (await groupsAfterIngest.json()) as { data: { id: string }[] };
    const errorGroupId = groupsBody.data[0].id;
    const errorGroupCtx = { params: Promise.resolve({ projectId, errorGroupId }) };

    // B self-assigns the error group.
    const selfAssign = await assignErrorGroupRoute(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: b.userId }, b.token),
      errorGroupCtx,
    );
    expect(selfAssign.status).toBe(200);

    // A (LEAD) reassigns it to C.
    const leadReassign = await assignErrorGroupRoute(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: c.userId }, a.token),
      errorGroupCtx,
    );
    expect(leadReassign.status).toBe(200);

    // B (a regular MEMBER) is blocked from reassigning it to someone else (only self-assign is allowed).
    const blockedReassign = await assignErrorGroupRoute(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: a.userId }, b.token),
      errorGroupCtx,
    );
    expect(blockedReassign.status).toBe(403);

    // A removes B from the team.
    const removeResponse = await removeMemberRoute(
      jsonRequest(`/api/v1/teams/${teamId}/members/${b.userId}`, "DELETE", undefined, a.token),
      { params: Promise.resolve({ teamId, userId: b.userId }) },
    );
    expect(removeResponse.status).toBe(200);

    // B no longer has access to the project's errors.
    const errorsAsBAfterRemoval = await listErrors(
      jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, b.token),
      { params: Promise.resolve({ projectId }) },
    );
    expect(errorsAsBAfterRemoval.status).toBe(404);
  });
});
