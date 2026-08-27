import { afterEach, describe, expect, it, vi } from "vitest";

async function freshErrorQuery(prismaMock: Record<string, Record<string, ReturnType<typeof vi.fn>>>) {
  vi.resetModules();
  vi.doMock("./db", () => ({ prisma: prismaMock }));
  return import("./errorQuery");
}

describe("listErrorGroups", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes to projectId and applies pagination/sort defaults", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const { listErrorGroups } = await freshErrorQuery({ errorGroup: { findMany, count } });

    await listErrorGroups("proj_1", { page: 1, limit: 20, sort: "lastSeen" });

    expect(findMany.mock.calls[0][0].where).toEqual({ projectId: "proj_1" });
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ lastSeenAt: "desc" });
    expect(findMany.mock.calls[0][0].skip).toBe(0);
    expect(findMany.mock.calls[0][0].take).toBe(20);
  });

  it("applies type/status/environment/search filters", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const count = vi.fn().mockResolvedValue(0);
    const { listErrorGroups } = await freshErrorQuery({ errorGroup: { findMany, count } });

    await listErrorGroups("proj_1", {
      page: 1,
      limit: 20,
      sort: "occurrences",
      type: "http",
      status: 500,
      environment: "browser",
      search: "fetch",
    });

    expect(findMany.mock.calls[0][0].where).toEqual({
      projectId: "proj_1",
      type: "http",
      statusCode: 500,
      environment: "browser",
      message: { contains: "fetch", mode: "insensitive" },
    });
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ occurrenceCount: "desc" });
  });

  it("computes skip from page/limit", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { listErrorGroups } = await freshErrorQuery({ errorGroup: { findMany, count: vi.fn().mockResolvedValue(0) } });

    await listErrorGroups("proj_1", { page: 3, limit: 10, sort: "lastSeen" });
    expect(findMany.mock.calls[0][0].skip).toBe(20);
  });

  it("returns data + pagination with the real total count", async () => {
    const data = [{ id: "grp_1" }];
    const { listErrorGroups } = await freshErrorQuery({
      errorGroup: { findMany: vi.fn().mockResolvedValue(data), count: vi.fn().mockResolvedValue(27) },
    });

    const result = await listErrorGroups("proj_1", { page: 1, limit: 20, sort: "lastSeen" });
    expect(result).toEqual({ data, pagination: { page: 1, limit: 20, total: 27 } });
  });
});

describe("getErrorGroupDetail", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("returns null when the group doesn't exist in this project", async () => {
    const { getErrorGroupDetail } = await freshErrorQuery({
      errorGroup: { findFirst: vi.fn().mockResolvedValue(null) },
      errorEvent: {},
    });

    expect(await getErrorGroupDetail("proj_1", "not-there", { page: 1, limit: 20 })).toBeNull();
  });

  it("includes the most recent occurrence's stack, independent of the requested occurrences page", async () => {
    const group = { id: "grp_1", message: "boom", type: "error", occurrenceCount: 5 };
    const { getErrorGroupDetail } = await freshErrorQuery({
      errorGroup: { findFirst: vi.fn().mockResolvedValue(group) },
      errorEvent: {
        findMany: vi.fn().mockResolvedValue([{ id: "evt_page2" }]),
        count: vi.fn().mockResolvedValue(50),
        findFirst: vi.fn().mockResolvedValue({
          stack: "most recent stack",
          filename: "https://example.com/app.js",
          line: 42,
          column: 15,
        }),
      },
    });

    const detail = await getErrorGroupDetail("proj_1", "grp_1", { page: 2, limit: 20 });
    expect(detail?.group.stack).toBe("most recent stack");
    expect(detail?.group.filename).toBe("https://example.com/app.js");
    expect(detail?.group.line).toBe(42);
    expect(detail?.group.column).toBe(15);
    expect(detail?.occurrences.pagination).toEqual({ page: 2, limit: 20, total: 50 });
  });

  it("falls back to null filename/line/column for an occurrence captured before this field existed", async () => {
    const group = { id: "grp_1", message: "boom", type: "error", occurrenceCount: 1 };
    const { getErrorGroupDetail } = await freshErrorQuery({
      errorGroup: { findFirst: vi.fn().mockResolvedValue(group) },
      errorEvent: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(1),
        findFirst: vi.fn().mockResolvedValue({ stack: null, filename: null, line: null, column: null }),
      },
    });

    const detail = await getErrorGroupDetail("proj_1", "grp_1", { page: 1, limit: 20 });
    expect(detail?.group.filename).toBeNull();
    expect(detail?.group.line).toBeNull();
    expect(detail?.group.column).toBeNull();
  });

  it("scopes the group lookup to both groupId AND projectId", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const { getErrorGroupDetail } = await freshErrorQuery({ errorGroup: { findFirst }, errorEvent: {} });

    await getErrorGroupDetail("proj_1", "grp_1", { page: 1, limit: 20 });
    expect(findFirst.mock.calls[0][0].where).toEqual({ id: "grp_1", projectId: "proj_1" });
  });
});

describe("listProjectEvents", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("scopes to projectId, orders by createdAt desc", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { listProjectEvents } = await freshErrorQuery({
      errorEvent: { findMany, count: vi.fn().mockResolvedValue(0) },
    });

    await listProjectEvents("proj_1", { page: 1, limit: 20 });
    expect(findMany.mock.calls[0][0].where).toEqual({ projectId: "proj_1" });
    expect(findMany.mock.calls[0][0].orderBy).toEqual({ createdAt: "desc" });
  });

  it("applies an optional type filter", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const { listProjectEvents } = await freshErrorQuery({
      errorEvent: { findMany, count: vi.fn().mockResolvedValue(0) },
    });

    await listProjectEvents("proj_1", { page: 1, limit: 20, type: "http" });
    expect(findMany.mock.calls[0][0].where).toEqual({ projectId: "proj_1", type: "http" });
  });
});

describe("getProjectStats", () => {
  afterEach(() => vi.doUnmock("./db"));

  it("aggregates errors/events/activeGroups/lastErrorAt, scoped to the project", async () => {
    const lastSeenAt = new Date("2026-08-26T00:00:00.000Z");
    const errorGroupCount = vi.fn().mockResolvedValue(27).mockResolvedValueOnce(27).mockResolvedValueOnce(8);
    const { getProjectStats } = await freshErrorQuery({
      errorGroup: {
        count: errorGroupCount,
        aggregate: vi.fn().mockResolvedValue({ _max: { lastSeenAt } }),
      },
      errorEvent: { count: vi.fn().mockResolvedValue(184) },
    });

    const stats = await getProjectStats("proj_1");
    expect(stats).toEqual({ errors: 27, events: 184, activeGroups: 8, lastErrorAt: lastSeenAt });
  });

  it("returns lastErrorAt: null when there are no groups yet", async () => {
    const { getProjectStats } = await freshErrorQuery({
      errorGroup: {
        count: vi.fn().mockResolvedValue(0),
        aggregate: vi.fn().mockResolvedValue({ _max: { lastSeenAt: null } }),
      },
      errorEvent: { count: vi.fn().mockResolvedValue(0) },
    });

    expect((await getProjectStats("proj_1")).lastErrorAt).toBeNull();
  });
});
