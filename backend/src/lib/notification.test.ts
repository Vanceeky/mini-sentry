import { afterEach, describe, expect, it, vi } from "vitest";

async function freshNotification(findMany: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { device: { findMany } } }));
  return import("./notification");
}

const payload = {
  type: "NEW_ERROR" as const,
  projectId: "proj_1",
  errorGroupId: "grp_1",
  title: "New Error Detected",
  message: "boom",
};

describe("getNotificationService / ConsoleNotificationService", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns the same instance on repeated calls (singleton)", async () => {
    const { getNotificationService } = await freshNotification(vi.fn().mockResolvedValue([]));
    expect(getNotificationService()).toBe(getNotificationService());
  });

  it("looks up the user's devices scoped to userId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { getNotificationService } = await freshNotification(findMany);

    await getNotificationService().notifyUser("user_1", payload);
    expect(findMany.mock.calls[0][0].where).toEqual({ userId: "user_1" });
  });

  it("logs once per registered device without throwing", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "dev_1", platform: "ios" },
      { id: "dev_2", platform: "android" },
    ]);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { getNotificationService } = await freshNotification(findMany);

    await expect(getNotificationService().notifyUser("user_1", payload)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(2);

    logSpy.mockRestore();
  });

  it("logs (but doesn't throw) when the user has no registered devices", async () => {
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { getNotificationService } = await freshNotification(vi.fn().mockResolvedValue([]));

    await expect(getNotificationService().notifyUser("user_1", payload)).resolves.toBeUndefined();
    expect(logSpy).toHaveBeenCalledTimes(1);

    logSpy.mockRestore();
  });
});
