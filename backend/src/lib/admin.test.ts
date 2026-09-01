import { afterEach, describe, expect, it, vi } from "vitest";

async function freshAdmin(opts: { user?: Record<string, ReturnType<typeof vi.fn>>; project?: Record<string, ReturnType<typeof vi.fn>> }) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: { user: opts.user ?? {}, project: opts.project ?? {} } }));
  return import("./admin");
}

describe("listAllUsers", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("paginates and returns the shared { data, pagination } shape", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "u1", name: "Ada", email: "ada@x.com", role: "USER", createdAt: new Date() }]);
    const count = vi.fn().mockResolvedValue(1);
    const { listAllUsers } = await freshAdmin({ user: { findMany, count } });

    const result = await listAllUsers({ page: 2, limit: 10 });
    expect(findMany.mock.calls[0][0]).toMatchObject({ skip: 10, take: 10 });
    expect(result.pagination).toEqual({ page: 2, limit: 10, total: 1 });
    expect(result.data).toHaveLength(1);
  });
});

describe("listAllProjects", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("flattens _count into memberCount", async () => {
    const findMany = vi.fn().mockResolvedValue([
      {
        id: "proj_1",
        name: "Rocket",
        createdAt: new Date(),
        owner: { id: "user_1", name: "Ada", email: "ada@x.com" },
        _count: { members: 3 },
      },
    ]);
    const count = vi.fn().mockResolvedValue(1);
    const { listAllProjects } = await freshAdmin({ project: { findMany, count } });

    const result = await listAllProjects({ page: 1, limit: 20 });
    expect(result.data[0]).toMatchObject({ id: "proj_1", memberCount: 3, owner: { id: "user_1" } });
    expect(result.pagination).toEqual({ page: 1, limit: 20, total: 1 });
  });
});
