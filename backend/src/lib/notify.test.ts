import { afterEach, describe, expect, it, vi } from "vitest";
import type { CapturedEventInput } from "./eventSchema";
import type { PersistedEvent } from "./persistEvent";

const event: CapturedEventInput = {
  id: "evt_1",
  type: "error",
  message: "boom",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test" },
  url: "https://example.com/",
};

const newGroupPersisted: PersistedEvent = {
  groupId: "grp_1",
  eventId: "dbevt_1",
  occurrenceCount: 1,
  isNewGroup: true,
  wasInactive: false,
};

const ordinaryPersisted: PersistedEvent = { ...newGroupPersisted, isNewGroup: false };

async function freshNotify(notifyUserMock: ReturnType<typeof vi.fn>) {
  vi.resetModules();
  vi.doMock("./notification", () => ({ getNotificationService: () => ({ notifyUser: notifyUserMock }) }));
  return import("./notify");
}

describe("notifyIfNeeded", () => {
  afterEach(() => vi.doUnmock("./notification"));

  it("does nothing when the project has no owner", async () => {
    const notifyUserMock = vi.fn();
    const { notifyIfNeeded } = await freshNotify(notifyUserMock);

    await notifyIfNeeded({ id: "proj_1", name: "P", ownerId: null }, event, newGroupPersisted);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("does nothing when no trigger condition is met", async () => {
    const notifyUserMock = vi.fn();
    const { notifyIfNeeded } = await freshNotify(notifyUserMock);

    await notifyIfNeeded({ id: "proj_1", name: "P", ownerId: "user_1" }, event, ordinaryPersisted);
    expect(notifyUserMock).not.toHaveBeenCalled();
  });

  it("notifies the project owner with a NEW_ERROR payload for a new group", async () => {
    const notifyUserMock = vi.fn().mockResolvedValue(undefined);
    const { notifyIfNeeded } = await freshNotify(notifyUserMock);

    await notifyIfNeeded({ id: "proj_1", name: "P", ownerId: "user_1" }, event, newGroupPersisted);

    expect(notifyUserMock).toHaveBeenCalledTimes(1);
    const [userId, payload] = notifyUserMock.mock.calls[0];
    expect(userId).toBe("user_1");
    expect(payload).toMatchObject({ type: "NEW_ERROR", projectId: "proj_1", errorGroupId: "grp_1" });
  });

  it("propagates a notification-service failure to the caller (route decides how to handle it)", async () => {
    const notifyUserMock = vi.fn().mockRejectedValue(new Error("push provider down"));
    const { notifyIfNeeded } = await freshNotify(notifyUserMock);

    await expect(notifyIfNeeded({ id: "proj_1", name: "P", ownerId: "user_1" }, event, newGroupPersisted)).rejects.toThrow(
      "push provider down",
    );
  });
});
