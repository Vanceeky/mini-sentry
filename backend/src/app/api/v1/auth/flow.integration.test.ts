import { afterAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). Exercises the full acceptance-criteria flow:
// Register -> Login -> receive session -> call an authenticated endpoint ->
// Logout -> the same token no longer works.
describe.skipIf(!process.env.DATABASE_URL)("auth flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  const email = `flow-test-${Date.now()}@example.com`;
  const password = "correct-horse-battery-staple";
  let createdUserId: string | undefined;

  afterAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    if (createdUserId) {
      await prisma.user.delete({ where: { id: createdUserId } }).catch(() => {});
    }
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

  it("completes register -> login -> me -> logout -> me(fails)", async () => {
    const { POST: register } = await import("./register/route");
    const { POST: login } = await import("./login/route");
    const { GET: me } = await import("./me/route");
    const { POST: logout } = await import("./logout/route");

    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "Flow Test", email, password }));
    expect(registerResponse.status).toBe(201);
    const registerBody = (await registerResponse.json()) as { user: { id: string; email: string } };
    createdUserId = registerBody.user.id;
    expect(registerBody.user.email).toBe(email);

    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    expect(loginResponse.status).toBe(200);
    const loginBody = (await loginResponse.json()) as { token: string; user: { id: string } };
    expect(loginBody.user.id).toBe(createdUserId);
    const token = loginBody.token;

    const meResponse = await me(jsonRequest("/api/v1/auth/me", "GET", undefined, token));
    expect(meResponse.status).toBe(200);
    const meBody = (await meResponse.json()) as { user: { id: string; email: string } };
    expect(meBody.user).toEqual({ id: createdUserId, name: "Flow Test", email });

    const logoutResponse = await logout(jsonRequest("/api/v1/auth/logout", "POST", undefined, token));
    expect(logoutResponse.status).toBe(200);

    const meAfterLogout = await me(jsonRequest("/api/v1/auth/me", "GET", undefined, token));
    expect(meAfterLogout.status).toBe(401);
    const afterLogoutBody = (await meAfterLogout.json()) as { error: { code: string } };
    expect(afterLogoutBody.error.code).toBe("INVALID_SESSION");
  });

  it("rejects registering the same email twice", async () => {
    const { POST: register } = await import("./register/route");
    const duplicateEmail = `flow-dup-${Date.now()}@example.com`;

    const first = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "A", email: duplicateEmail, password }));
    expect(first.status).toBe(201);
    const firstBody = (await first.json()) as { user: { id: string } };

    const second = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "B", email: duplicateEmail, password }));
    expect(second.status).toBe(409);

    const { prisma: db } = await import("@/lib/db");
    await db.user.delete({ where: { id: firstBody.user.id } });
  });
});
