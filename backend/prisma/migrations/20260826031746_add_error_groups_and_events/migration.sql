-- CreateTable
CREATE TABLE "error_groups" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "fingerprint" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "error_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "error_events" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "stack" TEXT,
    "url" TEXT NOT NULL,
    "method" TEXT,
    "statusCode" INTEGER,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "browser" TEXT NOT NULL,
    "os" TEXT,
    "environment" TEXT NOT NULL,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "error_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "error_groups_projectId_idx" ON "error_groups"("projectId");

-- CreateIndex
CREATE INDEX "error_groups_fingerprint_idx" ON "error_groups"("fingerprint");

-- CreateIndex
CREATE UNIQUE INDEX "error_groups_projectId_fingerprint_key" ON "error_groups"("projectId", "fingerprint");

-- CreateIndex
CREATE INDEX "error_events_projectId_idx" ON "error_events"("projectId");

-- CreateIndex
CREATE INDEX "error_events_groupId_idx" ON "error_events"("groupId");

-- CreateIndex
CREATE INDEX "error_events_createdAt_idx" ON "error_events"("createdAt");

-- CreateIndex
CREATE INDEX "error_events_timestamp_idx" ON "error_events"("timestamp");

-- AddForeignKey
ALTER TABLE "error_groups" ADD CONSTRAINT "error_groups_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "error_events" ADD CONSTRAINT "error_events_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "error_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
