import { afterEach, describe, expect, it, vi } from "vitest";

async function freshProject(prismaProject: Record<string, ReturnType<typeof vi.fn>>) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { project: prismaProject } }));
  return import("./project");
}

describe("generateApiKey", () => {
  it("produces a raw key, its hash, and a matching last-four", async () => {
    const { generateApiKey } = await freshProject({});
    const { rawKey, apiKeyHash, apiKeyLastFour } = generateApiKey();

    expect(rawKey.startsWith("mnst_")).toBe(true);
    expect(apiKeyHash).toMatch(/^[0-9a-f]{64}$/);
    expect(apiKeyLastFour).toBe(rawKey.slice(-4));
    expect(apiKeyHash).not.toBe(rawKey);
  });

  it("generates a different key on each call", async () => {
    const { generateApiKey } = await freshProject({});
    expect(generateApiKey().rawKey).not.toBe(generateApiKey().rawKey);
  });
});

describe("listOwnedProjects", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the query to the given ownerId", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { listOwnedProjects } = await freshProject({ findMany });

    await listOwnedProjects("user_1");
    expect(findMany.mock.calls[0][0].where).toEqual({ ownerId: "user_1" });
  });
});

describe("findOwnedProject", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes the lookup to both projectId AND ownerId — never just projectId", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { findOwnedProject } = await freshProject({ findFirst });

    await findOwnedProject("user_1", "proj_1");
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "proj_1", ownerId: "user_1" });
  });

  it("returns null when nothing matches (IDOR-safe: same result whether missing or someone else's)", async () => {
    const { findOwnedProject } = await freshProject({ findFirst: vi.fn().mockResolvedValue(null) });
    expect(await findOwnedProject("user_1", "not-owned")).toBeNull();
  });
});

describe("createProject", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("creates with the given ownerId and returns the raw apiKey exactly once", async () => {
    const create = vi.fn().mockImplementation(({ data }) =>
      Promise.resolve({
        id: "proj_1",
        name: data.name,
        apiKeyLastFour: data.apiKeyLastFour,
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    );
    const { createProject } = await freshProject({ create });

    const result = await createProject("user_1", "My App");

    expect(create.mock.calls[0][0].data.ownerId).toBe("user_1");
    expect(create.mock.calls[0][0].data.name).toBe("My App");
    expect(typeof result.apiKey).toBe("string");
    expect(result.apiKey.startsWith("mnst_")).toBe(true);
    expect(JSON.stringify(result)).not.toContain(create.mock.calls[0][0].data.apiKeyHash);
  });
});

describe("updateProjectName", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns null when no owned project matched (0 rows updated)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const { updateProjectName } = await freshProject({ updateMany });

    expect(await updateProjectName("user_1", "not-owned", "New Name")).toBeNull();
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "not-owned", ownerId: "user_1" });
  });

  it("returns the updated project when a row was updated", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const findFirst = vi.fn().mockResolvedValue({ id: "proj_1", name: "New Name" });
    const { updateProjectName } = await freshProject({ updateMany, findFirst });

    const result = await updateProjectName("user_1", "proj_1", "New Name");
    expect(result).toEqual({ id: "proj_1", name: "New Name" });
  });
});

describe("deleteOwnedProject", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns false when nothing was deleted", async () => {
    const { deleteOwnedProject } = await freshProject({ deleteMany: vi.fn().mockResolvedValue({ count: 0 }) });
    expect(await deleteOwnedProject("user_1", "not-owned")).toBe(false);
  });

  it("returns true and scopes the delete to ownerId", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 1 });
    const { deleteOwnedProject } = await freshProject({ deleteMany });

    expect(await deleteOwnedProject("user_1", "proj_1")).toBe(true);
    expect(deleteMany.mock.calls[0][0].where).toEqual({ id: "proj_1", ownerId: "user_1" });
  });
});

describe("rotateApiKey", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns null when nothing was rotated (not owned)", async () => {
    const { rotateApiKey } = await freshProject({ updateMany: vi.fn().mockResolvedValue({ count: 0 }) });
    expect(await rotateApiKey("user_1", "not-owned")).toBeNull();
  });

  it("returns the new raw key and scopes the update to ownerId", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const { rotateApiKey } = await freshProject({ updateMany });

    const newKey = await rotateApiKey("user_1", "proj_1");
    expect(newKey?.startsWith("mnst_")).toBe(true);
    expect(updateMany.mock.calls[0][0].where).toEqual({ id: "proj_1", ownerId: "user_1" });
  });
});
