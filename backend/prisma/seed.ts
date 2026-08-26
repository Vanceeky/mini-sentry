import { PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { hashPassword } from "../src/lib/password";

const prisma = new PrismaClient();

// Fixed, well-known, dev-only values — not secrets. Reused by
// docs/API_EXAMPLES.md's curl samples, the demo app's init() call, and
// integration tests so everything stays in sync without reading a
// freshly-generated value out of a log.
const DEV_API_KEY = "mnst_dev_local_0000000000000000000000000000";
const DEV_USER_EMAIL = "dev@example.com";
const DEV_USER_PASSWORD = "mini-sentry-dev-password";

function hashApiKey(rawKey: string): string {
  return createHash("sha256").update(rawKey, "utf8").digest("hex");
}

async function main() {
  const devUser = await prisma.user.upsert({
    where: { email: DEV_USER_EMAIL },
    update: {},
    create: { name: "Local Dev User", email: DEV_USER_EMAIL, passwordHash: hashPassword(DEV_USER_PASSWORD) },
  });

  const project = await prisma.project.upsert({
    where: { apiKeyHash: hashApiKey(DEV_API_KEY) },
    update: { ownerId: devUser.id, apiKeyLastFour: DEV_API_KEY.slice(-4) },
    create: {
      name: "Local Dev Project",
      apiKeyHash: hashApiKey(DEV_API_KEY),
      apiKeyLastFour: DEV_API_KEY.slice(-4),
      ownerId: devUser.id,
    },
  });

  console.log(`Seeded user "${devUser.email}" (${devUser.id})`);
  console.log(`Dev login: ${DEV_USER_EMAIL} / ${DEV_USER_PASSWORD}`);
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
