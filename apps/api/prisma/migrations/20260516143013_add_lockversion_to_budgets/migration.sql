-- AlterTable
ALTER TABLE "budgets" ADD COLUMN     "lock_version" INTEGER NOT NULL DEFAULT 0;
