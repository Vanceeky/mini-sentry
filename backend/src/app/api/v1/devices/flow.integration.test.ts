import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). Drives the real route handlers through:
// register device -> ingest events covering each of the 4 notification
// types (checking the actual console.log calls ConsoleNotificationService
// makes) -> delete device -> confirm a second user gets 404 on someone
// else's device.
//
// See ingest()'s own comment for why FIREBASE_SERVICE_ACCOUNT_JSON_BASE64
// gets cleared there — this test needs ConsoleNotificationService's exact
// log format regardless of the developer's local .env.
describe.skipIf(!process.env.DATABASE_URL)("device registration + notification flow (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let projectId: string;
  let projectApiKey: string;
  let userAToken: string;
  let userAId: string;
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
    const { POST: register } = await import("../auth/register/route");
    const { POST: login } = await import("../auth/login/route");
    const password = "correct-horse-battery-staple";

    const registerResponse = await register(jsonRequest("/api/v1/auth/register", "POST", { name: "Test", email, password }));
    const registerBody = (await registerResponse.json()) as { user: { id: string } };
    userIds.push(registerBody.user.id);

    const loginResponse = await login(jsonRequest("/api/v1/auth/login", "POST", { email, password }));
    const loginBody = (await loginResponse.json()) as { token: string };
    return { token: loginBody.token, userId: registerBody.user.id };
  }

  async function ingest(body: Record<string, unknown>) {
    // Next.js's env loader (@next/env) re-populates process.env from .env as
    // a side effect of importing a route module — a delete before the import
    // alone doesn't stick, since the import itself can re-trigger the reload.
    // Delete both before and after so a real local FCM credential can never
    // flip getNotificationService()'s singleton onto the FCM path here —
    // this test asserts on ConsoleNotificationService's exact log format.
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    const { POST: ingestEvent } = await import("../events/route");
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON_BASE64;
    const request = new Request("http://localhost:3000/api/v1/events", {
      method: "POST",
      headers: { Authorization: `Bearer ${projectApiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const response = await ingestEvent(request);
    expect(response.status).toBe(200);
  }

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    const { POST: createProjectRoute } = await import("../projects/route");

    const a = await registerAndLogin(`notify-a-${Date.now()}@example.com`);
    userAToken = a.token;
    userAId = a.userId;
    userBToken = (await registerAndLogin(`notify-b-${Date.now()}@example.com`)).token;

    const createResponse = await createProjectRoute(jsonRequest("/api/v1/projects", "POST", { name: "Notify Test Project" }, userAToken));
    const createBody = (await createResponse.json()) as { project: { id: string; apiKey: string } };
    projectId = createBody.project.id;
    projectApiKey = createBody.project.apiKey;
  });

  afterAll(async () => {
    await prisma.errorEvent.deleteMany({ where: { projectId } });
    await prisma.errorGroup.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.device.deleteMany({ where: { userId: { in: userIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  it("registers a device for the authenticated user", async () => {
    const { POST: registerDeviceRoute } = await import("./route");
    const response = await registerDeviceRoute(jsonRequest("/api/v1/devices", "POST", { platform: "ios", pushToken: `flow-token-${Date.now()}` }, userAToken));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { device: { id: string; platform: string } };
    expect(body.device.platform).toBe("ios");

    const device = await prisma.device.findUnique({ where: { id: body.device.id } });
    expect(device?.userId).toBe(userAId);
  });

  it("logs a NEW_ERROR notification for a brand-new error group", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await ingest({
      id: "evt_new_1",
      type: "error",
      message: "Brand new error type",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:00:00.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
    });

    const notifyCall = logSpy.mock.calls.find(([msg]) => typeof msg === "string" && msg.includes("no push provider"));
    expect(notifyCall).toBeDefined();
    expect(notifyCall?.[1]).toMatchObject({ type: "NEW_ERROR", title: "New Error Detected" });

    logSpy.mockRestore();
  });

  it("still logs an ERROR_OCCURRED notification for an ordinary repeat occurrence of an already-active group", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Second occurrence of the SAME group from the previous test — not new, not 5xx, not inactive.
    await ingest({
      id: "evt_new_1_repeat",
      type: "error",
      message: "Brand new error type",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:00:05.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
    });

    const notifyCall = logSpy.mock.calls.find(([msg]) => typeof msg === "string" && msg.includes("no push provider"));
    expect(notifyCall).toBeDefined();
    expect(notifyCall?.[1]).toMatchObject({ type: "ERROR_OCCURRED", title: "Error Occurred" });

    logSpy.mockRestore();
  });

  it("logs a SERIOUS_ERROR notification for a repeat 5xx occurrence (not a new group)", async () => {
    // First occurrence creates the group (fires NEW_ERROR, not SERIOUS_ERROR — priority).
    await ingest({
      id: "evt_5xx_1",
      type: "http",
      message: "HTTP 502 Bad Gateway",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:05:00.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
      request: { url: "/api/orders", method: "POST", statusCode: 502 },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    // Second occurrence: same group (not new), still 5xx -> SERIOUS_ERROR.
    await ingest({
      id: "evt_5xx_2",
      type: "http",
      message: "HTTP 502 Bad Gateway",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:05:05.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
      request: { url: "/api/orders", method: "POST", statusCode: 502 },
    });

    const notifyCall = logSpy.mock.calls.find(([msg]) => typeof msg === "string" && msg.includes("no push provider"));
    expect(notifyCall).toBeDefined();
    expect(notifyCall?.[1]).toMatchObject({ type: "SERIOUS_ERROR", title: "Serious Error", message: "502 POST /api/orders" });

    logSpy.mockRestore();
  });

  it("logs a REACTIVATED_ERROR notification when a group's last occurrence was over 24h ago", async () => {
    await ingest({
      id: "evt_reactivate_1",
      type: "error",
      message: "Quiet error",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:10:00.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
    });

    // Force the group to look 25h stale, simulating real elapsed time.
    await prisma.errorGroup.updateMany({
      where: { projectId, message: "Quiet error" },
      data: { lastSeenAt: new Date(Date.now() - 25 * 60 * 60 * 1000) },
    });

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await ingest({
      id: "evt_reactivate_2",
      type: "error",
      message: "Quiet error",
      url: "https://example.com/",
      timestamp: "2026-08-26T13:10:05.000Z",
      environment: "browser",
      browser: { userAgent: "test" },
    });

    const notifyCall = logSpy.mock.calls.find(([msg]) => typeof msg === "string" && msg.includes("no push provider"));
    expect(notifyCall).toBeDefined();
    expect(notifyCall?.[1]).toMatchObject({ type: "REACTIVATED_ERROR", title: "Error Reactivated" });

    logSpy.mockRestore();
  });

  it("deletes the device and confirms a second user gets 404 on it (IDOR-safe)", async () => {
    const { POST: registerDeviceRoute } = await import("./route");
    const { DELETE } = await import("./[deviceId]/route");

    const registerResponse = await registerDeviceRoute(
      jsonRequest("/api/v1/devices", "POST", { platform: "android", pushToken: `flow-delete-token-${Date.now()}` }, userAToken),
    );
    const deviceId = ((await registerResponse.json()) as { device: { id: string } }).device.id;

    const deleteAsB = await DELETE(jsonRequest(`/api/v1/devices/${deviceId}`, "DELETE", undefined, userBToken), {
      params: Promise.resolve({ deviceId }),
    });
    expect(deleteAsB.status).toBe(404);

    const deleteAsA = await DELETE(jsonRequest(`/api/v1/devices/${deviceId}`, "DELETE", undefined, userAToken), {
      params: Promise.resolve({ deviceId }),
    });
    expect(deleteAsA.status).toBe(200);

    expect(await prisma.device.findUnique({ where: { id: deviceId } })).toBeNull();
  });
});
