-- AlterTable
ALTER TABLE "projects" ADD COLUMN     "apiKeyLastFour" TEXT,
ADD COLUMN     "ownerId" TEXT;

-- CreateIndex
CREATE INDEX "projects_ownerId_idx" ON "projects"("ownerId");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
