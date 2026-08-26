import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). The default `npm run test` has no DB configured
// and skips this cleanly rather than failing.
describe.skipIf(!process.env.DATABASE_URL)("persistEvent (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let persistEvent: typeof import("./persistEvent").persistEvent;
  let projectId: string;

  beforeAll(async () => {
    ({ prisma } = await import("./db"));
    ({ persistEvent } = await import("./persistEvent"));

    const project = await prisma.project.create({
      data: { name: "Persist Integration Test Project", apiKeyHash: `persist-test-${Date.now()}` },
    });
    projectId = project.id;
  });

  afterAll(async () => {
    await prisma.errorEvent.deleteMany({ where: { projectId } });
    await prisma.errorGroup.deleteMany({ where: { projectId } });
    await prisma.project.delete({ where: { id: projectId } });
    await prisma.$disconnect();
  });

  it("creates a Project -> ErrorGroup -> ErrorEvent chain on first occurrence", async () => {
    const event = {
      id: "evt_int_1",
      type: "error" as const,
      message: "Integration test error",
      timestamp: "2026-01-01T00:00:00.000Z",
      environment: "browser" as const,
      browser: { userAgent: "integration-agent" },
      url: "https://example.com/",
    };

    const result = await persistEvent(projectId, event);

    const group = await prisma.errorGroup.findUnique({ where: { id: result.groupId } });
    expect(group).toMatchObject({ projectId, type: "error", message: "Integration test error", occurrenceCount: 1 });

    const dbEvent = await prisma.errorEvent.findUnique({ where: { id: result.eventId } });
    expect(dbEvent).toMatchObject({ projectId, groupId: result.groupId, message: "Integration test error" });
  });

  it("groups a second occurrence of the same fingerprint into the same ErrorGroup", async () => {
    const event = {
      id: "evt_int_2",
      type: "error" as const,
      message: "Repeated integration error",
      timestamp: "2026-01-01T00:05:00.000Z",
      environment: "browser" as const,
      browser: { userAgent: "integration-agent" },
      url: "https://example.com/",
    };

    const first = await persistEvent(projectId, event);
    const second = await persistEvent(projectId, { ...event, id: "evt_int_3", timestamp: "2026-01-01T00:06:00.000Z" });

    expect(second.groupId).toBe(first.groupId);
    expect(second.occurrenceCount).toBe(2);
    expect(first.isNewGroup).toBe(true);
    expect(second.isNewGroup).toBe(false);
    expect(second.wasInactive).toBe(false);

    const eventCount = await prisma.errorEvent.count({ where: { groupId: first.groupId } });
    expect(eventCount).toBe(2);
  });
});
