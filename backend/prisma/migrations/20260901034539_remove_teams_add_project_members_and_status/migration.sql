/*
  Warnings:

  - You are about to drop the column `invitedRole` on the `invitations` table. All the data in the column will be lost.
  - You are about to drop the column `teamId` on the `invitations` table. All the data in the column will be lost.
  - You are about to drop the column `teamId` on the `projects` table. All the data in the column will be lost.
  - You are about to drop the `team_members` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `teams` table. If the table is not empty, all the data it contains will be lost.
  - Added the required column `projectId` to the `invitations` table without a default value. This is not possible if the table is not empty.

*/
-- CreateEnum
CREATE TYPE "ErrorGroupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'DONE');

-- DropForeignKey
ALTER TABLE "invitations" DROP CONSTRAINT "invitations_teamId_fkey";

-- DropForeignKey
ALTER TABLE "projects" DROP CONSTRAINT "projects_teamId_fkey";

-- DropForeignKey
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_teamId_fkey";

-- DropForeignKey
ALTER TABLE "team_members" DROP CONSTRAINT "team_members_userId_fkey";

-- DropForeignKey
ALTER TABLE "teams" DROP CONSTRAINT "teams_createdById_fkey";

-- DropIndex
DROP INDEX "invitations_teamId_idx";

-- DropIndex
DROP INDEX "projects_teamId_idx";

-- AlterTable
ALTER TABLE "error_groups" ADD COLUMN     "status" "ErrorGroupStatus" NOT NULL DEFAULT 'PENDING';

-- AlterTable
ALTER TABLE "invitations" DROP COLUMN "invitedRole",
DROP COLUMN "teamId",
ADD COLUMN     "projectId" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "projects" DROP COLUMN "teamId";

-- DropTable
DROP TABLE "team_members";

-- DropTable
DROP TABLE "teams";

-- DropEnum
DROP TYPE "TeamRole";

-- CreateTable
CREATE TABLE "project_members" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_members_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "project_members_projectId_idx" ON "project_members"("projectId");

-- CreateIndex
CREATE INDEX "project_members_userId_idx" ON "project_members"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "project_members_projectId_userId_key" ON "project_members"("projectId", "userId");

-- CreateIndex
CREATE INDEX "error_groups_status_idx" ON "error_groups"("status");

-- CreateIndex
CREATE INDEX "invitations_projectId_idx" ON "invitations"("projectId");

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_members" ADD CONSTRAINT "project_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "invitations" ADD CONSTRAINT "invitations_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;
