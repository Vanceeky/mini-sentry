import { afterAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). Exercises the full Phase 15 flow end to end:
// create project -> invite by email -> preview with no auth -> brand-new
// person registers with the token and is auto-joined -> reads errors ->
// self-assigns + sets status -> owner reassigns to a third (already-
// registered, invite-accepted) member -> permission denial -> member
// removed -> access revoked.
describe.skipIf(!process.env.DATABASE_URL)("project membership/invitation/assignment flow (real DB)", () => {
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

  async function registerAndLogin(email: string, invitationToken?: string) {
    const { POST: register } = await import("../auth/register/route");
    const { POST: login } = await import("../auth/login/route");
    const password = "correct-horse-battery-staple";

    const registerResponse = await register(
      jsonRequest("/api/v1/auth/register", "POST", { name: "Test User", email, password, ...(invitationToken ? { invitationToken } : {}) }),
    );
    const registerBody = (await registerResponse.json()) as { user: { id: string }; invitation?: { status: string; projectId?: string } };
    userIds.push(registerBody.user.id);

    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    const loginBody = (await loginResponse.json()) as { token: string };
    return { token: loginBody.token, userId: registerBody.user.id, invitation: registerBody.invitation };
  }

  it("supports the full invite -> register-with-token -> assign -> status -> reassign -> permission-denied -> remove flow", async () => {
    const { POST: createProject } = await import("./route");
    const { POST: createInvitation } = await import("./[projectId]/invitations/route");
    const { GET: previewInvitation } = await import("../invitations/preview/route");
    const { POST: acceptInvitation } = await import("../invitations/accept/route");
    const { GET: listErrors } = await import("./[projectId]/errors/route");
    const { PATCH: updateErrorGroup } = await import("./[projectId]/errors/[errorGroupId]/route");
    const { DELETE: removeMember } = await import("./[projectId]/members/[userId]/route");
    const { POST: ingestEvent } = await import("../events/route");

    const suffix = Date.now();
    const owner = await registerAndLogin(`membership-flow-owner-${suffix}@example.com`);
    const memberBEmail = `membership-flow-b-${suffix}@example.com`;

    // Owner creates a project and gets its API key.
    const projectResponse = await createProject(jsonRequest("/api/v1/projects", "POST", { name: "Shared App" }, owner.token));
    expect(projectResponse.status).toBe(201);
    const projectBody = (await projectResponse.json()) as { project: { id: string; apiKey: string } };
    const projectId = projectBody.project.id;
    projectIds.push(projectId);
    const projectCtx = { params: Promise.resolve({ projectId }) };

    // Owner invites a not-yet-existing person by email.
    const inviteResponse = await createInvitation(
      jsonRequest(`/api/v1/projects/${projectId}/invitations`, "POST", { email: memberBEmail }, owner.token),
      projectCtx,
    );
    expect(inviteResponse.status).toBe(201);
    const inviteBody = (await inviteResponse.json()) as { token: string };

    // Public preview, no auth at all — proves the token can be previewed before an account exists.
    const previewResponse = await previewInvitation(new Request(`http://localhost:3000/api/v1/invitations/preview?token=${inviteBody.token}`));
    expect(previewResponse.status).toBe(200);
    const previewBody = (await previewResponse.json()) as { success: boolean; projectName: string; invitedEmail: string };
    expect(previewBody).toEqual({ success: true, projectName: "Shared App", invitedEmail: memberBEmail });

    // Brand-new person registers WITH the token — joins in one step, no separate authenticated accept call.
    const memberB = await registerAndLogin(memberBEmail, inviteBody.token);
    expect(memberB.invitation).toEqual({ status: "accepted", projectId });

    // A third, already-registered person joins via the standard authenticated accept flow.
    const memberCEmail = `membership-flow-c-${suffix}@example.com`;
    const memberC = await registerAndLogin(memberCEmail);
    const inviteCResponse = await createInvitation(
      jsonRequest(`/api/v1/projects/${projectId}/invitations`, "POST", { email: memberCEmail }, owner.token),
      projectCtx,
    );
    const inviteCBody = (await inviteCResponse.json()) as { token: string };
    const acceptCResponse = await acceptInvitation(jsonRequest("/api/v1/invitations/accept", "POST", { token: inviteCBody.token }, memberC.token));
    expect(acceptCResponse.status).toBe(200);

    // Member B (not the owner) can now read the project's errors.
    const errorsAsB = await listErrors(jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, memberB.token), projectCtx);
    expect(errorsAsB.status).toBe(200);

    // Ingest a real event to produce an error group.
    const eventResponse = await ingestEvent(
      new Request("http://localhost:3000/api/v1/events", {
        method: "POST",
        headers: { Authorization: `Bearer ${projectBody.project.apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          id: "evt_membership_flow_1",
          type: "error",
          message: "membership flow test",
          url: "https://example.com/",
          timestamp: new Date(0).toISOString(),
          environment: "browser",
          browser: { userAgent: "test" },
        }),
      }),
    );
    expect(eventResponse.status).toBe(200);

    const groupsResponse = await listErrors(jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, owner.token), projectCtx);
    const groupsBody = (await groupsResponse.json()) as { data: { id: string }[] };
    const errorGroupId = groupsBody.data[0].id;
    const errorGroupCtx = { params: Promise.resolve({ projectId, errorGroupId }) };

    // Member B self-assigns and sets status to IN_PROGRESS.
    const selfAssign = await updateErrorGroup(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: memberB.userId }, memberB.token),
      errorGroupCtx,
    );
    expect(selfAssign.status).toBe(200);

    const setStatus = await updateErrorGroup(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { status: "IN_PROGRESS" }, memberB.token),
      errorGroupCtx,
    );
    expect(setStatus.status).toBe(200);
    const setStatusBody = (await setStatus.json()) as { group: { status: string } };
    expect(setStatusBody.group.status).toBe("IN_PROGRESS");

    // Owner reassigns it to member C.
    const ownerReassign = await updateErrorGroup(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: memberC.userId }, owner.token),
      errorGroupCtx,
    );
    expect(ownerReassign.status).toBe(200);

    // Member B (not the owner) is blocked from reassigning it to someone else.
    const blockedReassign = await updateErrorGroup(
      jsonRequest(`/api/v1/projects/${projectId}/errors/${errorGroupId}`, "PATCH", { assigneeId: owner.userId }, memberB.token),
      errorGroupCtx,
    );
    expect(blockedReassign.status).toBe(403);

    // Owner removes member B from the project.
    const removeResponse = await removeMember(
      jsonRequest(`/api/v1/projects/${projectId}/members/${memberB.userId}`, "DELETE", undefined, owner.token),
      { params: Promise.resolve({ projectId, userId: memberB.userId }) },
    );
    expect(removeResponse.status).toBe(200);

    // Member B no longer has access.
    const errorsAsBAfterRemoval = await listErrors(jsonRequest(`/api/v1/projects/${projectId}/errors`, "GET", undefined, memberB.token), projectCtx);
    expect(errorsAsBAfterRemoval.status).toBe(404);
  });
});
