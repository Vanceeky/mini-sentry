import { describe, expect, it, vi } from "vitest";
import type { CapturedEventInput } from "./eventSchema";

const baseEvent: CapturedEventInput = {
  id: "evt_1",
  type: "error",
  message: "boom",
  stack: "Error: boom\n  at x",
  timestamp: "2026-01-01T00:00:00.000Z",
  environment: "browser",
  browser: { userAgent: "test-agent" },
  url: "https://example.com/",
};

async function freshPersistEvent(tx: { errorGroup: { upsert: ReturnType<typeof vi.fn> }; errorEvent: { create: ReturnType<typeof vi.fn> } }) {
  vi.resetModules();
  vi.doMock("./db", () => ({
    prisma: { $transaction: vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(tx)) },
  }));
  return import("./persistEvent");
}

function makeTx(overrides: { group?: object; created?: object } = {}) {
  return {
    errorGroup: {
      upsert: vi.fn().mockResolvedValue({ id: "grp_1", occurrenceCount: 1, ...overrides.group }),
    },
    errorEvent: {
      create: vi.fn().mockResolvedValue({ id: "dbevt_1", ...overrides.created }),
    },
  };
}

describe("persistEvent", () => {
  it("upserts the group by [projectId, fingerprint] and creates the event", async () => {
    const tx = makeTx();
    const { persistEvent } = await freshPersistEvent(tx);

    const result = await persistEvent("proj_1", baseEvent);

    expect(tx.errorGroup.upsert).toHaveBeenCalledTimes(1);
    const upsertArgs = tx.errorGroup.upsert.mock.calls[0][0];
    expect(upsertArgs.where.projectId_fingerprint.projectId).toBe("proj_1");
    expect(upsertArgs.create).toMatchObject({
      projectId: "proj_1",
      type: "error",
      message: "boom",
      environment: "browser",
      endpoint: null,
      statusCode: null,
      occurrenceCount: 1,
    });
    expect(upsertArgs.update).toMatchObject({ occurrenceCount: { increment: 1 } });

    expect(tx.errorEvent.create).toHaveBeenCalledTimes(1);
    const createArgs = tx.errorEvent.create.mock.calls[0][0];
    expect(createArgs.data).toMatchObject({
      projectId: "proj_1",
      groupId: "grp_1",
      type: "error",
      message: "boom",
      stack: baseEvent.stack,
      url: baseEvent.url,
      browser: "test-agent",
      environment: "browser",
      os: null,
    });
    expect(createArgs.data.timestamp).toEqual(new Date(baseEvent.timestamp));

    expect(result).toEqual({ groupId: "grp_1", eventId: "dbevt_1", occurrenceCount: 1 });
  });

  it("populates method/statusCode from request for http events", async () => {
    const tx = makeTx();
    const { persistEvent } = await freshPersistEvent(tx);
    const httpEvent: CapturedEventInput = {
      ...baseEvent,
      type: "http",
      request: { url: "/api/users", method: "GET", statusCode: 500 },
    };

    await persistEvent("proj_1", httpEvent);

    const createArgs = tx.errorEvent.create.mock.calls[0][0];
    expect(createArgs.data.method).toBe("GET");
    expect(createArgs.data.statusCode).toBe(500);

    const groupCreateArgs = tx.errorGroup.upsert.mock.calls[0][0].create;
    expect(groupCreateArgs.endpoint).toBe("GET /api/users");
    expect(groupCreateArgs.statusCode).toBe(500);
  });

  it("leaves method/statusCode undefined for non-http events", async () => {
    const tx = makeTx();
    const { persistEvent } = await freshPersistEvent(tx);

    await persistEvent("proj_1", baseEvent);

    const createArgs = tx.errorEvent.create.mock.calls[0][0];
    expect(createArgs.data.method).toBeUndefined();
    expect(createArgs.data.statusCode).toBeUndefined();
  });

  it("returns the post-increment occurrenceCount on a repeat occurrence", async () => {
    const tx = makeTx({ group: { occurrenceCount: 5 } });
    const { persistEvent } = await freshPersistEvent(tx);

    const result = await persistEvent("proj_1", baseEvent);
    expect(result.occurrenceCount).toBe(5);
  });
});
