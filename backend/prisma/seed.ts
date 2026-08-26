import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";

const prisma = new PrismaClient();

// Fixed, well-known, dev-only key — not a secret. Reused by docs/API_EXAMPLES.md's
// curl samples, the demo app's init() call, and the integration test so all three
// stay in sync without needing to read a freshly-generated value out of a log.
const DEV_API_KEY = "mnst_dev_local_0000000000000000000000000000";

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

async function main() {
  const project = await prisma.project.upsert({
    where: { apiKeyHash: hashApiKey(DEV_API_KEY) },
    update: {},
    create: {
      name: "Local Dev Project",
      apiKeyHash: hashApiKey(DEV_API_KEY),
    },
  });

  console.log(`Seeded project "${project.name}" (${project.id})`);
  console.log(`Dev API key: ${DEV_API_KEY}`);
}

main()
  .catch((error: unknown) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
