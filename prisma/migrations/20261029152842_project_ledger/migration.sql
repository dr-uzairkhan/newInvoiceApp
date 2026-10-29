-- CreateEnum
CREATE TYPE "ProjectLedger" AS ENUM ('CLIENT', 'INTERNAL');

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "ledger" "ProjectLedger" NOT NULL DEFAULT 'CLIENT';
