-- AlterTable
ALTER TABLE "error_groups" ADD COLUMN     "endpoint" TEXT,
ADD COLUMN     "environment" TEXT,
ADD COLUMN     "statusCode" INTEGER;
