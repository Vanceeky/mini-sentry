import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Opt-in: only runs when DATABASE_URL is set (a real local Postgres — see
// backend/docker-compose.yml). The default `npm run test` has no DB configured
// and skips this cleanly rather than failing.
describe.skipIf(!process.env.DATABASE_URL)("findProjectByApiKey (real DB)", () => {
  let prisma: import("@prisma/client").PrismaClient;
  let hashApiKey: (rawKey: string) => string;
  let findProjectByApiKey: (rawKey: string) => Promise<{ id: string; name: string } | null>;
  const rawKey = "mnst_integration_test_key";

  beforeAll(async () => {
    ({ prisma } = await import("@/lib/db"));
    ({ hashApiKey, findProjectByApiKey } = await import("@/lib/apiKey"));

    await prisma.project.upsert({
      where: { apiKeyHash: hashApiKey(rawKey) },
      update: {},
      create: { name: "Integration Test Project", apiKeyHash: hashApiKey(rawKey) },
    });
  });

  afterAll(async () => {
    await prisma.project.deleteMany({ where: { apiKeyHash: hashApiKey(rawKey) } });
    await prisma.$disconnect();
  });

  it("finds the seeded project for a valid key", async () => {
    const project = await findProjectByApiKey(rawKey);
    expect(project?.name).toBe("Integration Test Project");
  });

  it("returns null for an unrecognized key", async () => {
    expect(await findProjectByApiKey("not-a-real-key")).toBeNull();
  });
});
