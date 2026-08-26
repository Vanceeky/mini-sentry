import { afterEach, describe, expect, it, vi } from "vitest";

async function freshDevice(prismaDevice: Record<string, ReturnType<typeof vi.fn>>) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { device: prismaDevice } }));
  return import("./device");
}

describe("registerDevice", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("upserts by pushToken, setting userId/platform on both create and update", async () => {
    const upsert = vi.fn().mockResolvedValue({ id: "dev_1", platform: "ios", createdAt: new Date() });
    const { registerDevice } = await freshDevice({ upsert });

    await registerDevice("user_1", "ios", "token-abc");

    const args = upsert.mock.calls[0][0];
    expect(args.where).toEqual({ pushToken: "token-abc" });
    expect(args.create).toEqual({ userId: "user_1", platform: "ios", pushToken: "token-abc" });
    expect(args.update).toEqual({ userId: "user_1", platform: "ios" });
  });

  it("returns the safe device shape (no pushToken/userId)", async () => {
    const device = { id: "dev_1", platform: "ios", createdAt: new Date() };
    const { registerDevice } = await freshDevice({ upsert: vi.fn().mockResolvedValue(device) });

    expect(await registerDevice("user_1", "ios", "token-abc")).toEqual(device);
  });
});

describe("deleteOwnedDevice", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the delete to both deviceId AND userId", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { deleteOwnedDevice } = await freshDevice({ deleteMany });

    await deleteOwnedDevice("user_1", "dev_1");
    expect(deleteMany.mock.calls[0][0].where).toEqual({ id: "dev_1", userId: "user_1" });
  });

  it("returns false when nothing was deleted (not owned)", async () => {
    const { deleteOwnedDevice } = await freshDevice({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });
    expect(await deleteOwnedDevice("user_1", "not-owned")).toBe(false);
  });

  it("returns true when a device was deleted", async () => {
    const { deleteOwnedDevice } = await freshDevice({ deleteMany: vi.fn().mockResolvedValue({ count: 1 }) });
    expect(await deleteOwnedDevice("user_1", "dev_1")).toBe(true);
  });
});
