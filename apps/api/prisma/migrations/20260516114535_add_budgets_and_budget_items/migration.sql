-- CreateEnum
CREATE TYPE "BudgetStatus" AS ENUM ('draft', 'pending_approval', 'approved', 'superseded');

-- CreateEnum
CREATE TYPE "BudgetItemKind" AS ENUM ('section', 'detail', 'composite');

-- CreateEnum
CREATE TYPE "CostElement" AS ENUM ('labor', 'material', 'subcontract', 'machine', 'expense');

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "project_id" UUID NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "status" "BudgetStatus" NOT NULL DEFAULT 'draft',
    "title" VARCHAR(200),
    "total_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "submitted_by_id" UUID,
    "submitted_at" TIMESTAMPTZ(6),
    "approved_by_id" UUID,
    "approved_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "budget_items" (
    "id" UUID NOT NULL,
    "budget_id" UUID NOT NULL,
    "parent_id" UUID,
    "level" INTEGER NOT NULL DEFAULT 0,
    "display_order" INTEGER NOT NULL DEFAULT 0,
    "kind" "BudgetItemKind" NOT NULL DEFAULT 'detail',
    "code" VARCHAR(50),
    "name" VARCHAR(200) NOT NULL,
    "spec" TEXT,
    "unit" VARCHAR(20),
    "cost_element" "CostElement",
    "quantity" DECIMAL(15,4) NOT NULL DEFAULT 0,
    "unit_price" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "lock_version" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "budget_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "budgets_project_id_idx" ON "budgets"("project_id");

-- CreateIndex
CREATE INDEX "budgets_status_idx" ON "budgets"("status");

-- CreateIndex
CREATE INDEX "budgets_deleted_at_idx" ON "budgets"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "budgets_project_id_version_key" ON "budgets"("project_id", "version");

-- CreateIndex
CREATE INDEX "budget_items_budget_id_parent_id_display_order_idx" ON "budget_items"("budget_id", "parent_id", "display_order");

-- CreateIndex
CREATE INDEX "budget_items_parent_id_idx" ON "budget_items"("parent_id");

-- CreateIndex
CREATE INDEX "budget_items_budget_id_cost_element_idx" ON "budget_items"("budget_id", "cost_element");

-- CreateIndex
CREATE INDEX "budget_items_deleted_at_idx" ON "budget_items"("deleted_at");

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_submitted_by_id_fkey" FOREIGN KEY ("submitted_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_budget_id_fkey" FOREIGN KEY ("budget_id") REFERENCES "budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "budget_items" ADD CONSTRAINT "budget_items_parent_id_fkey" FOREIGN KEY ("parent_id") REFERENCES "budget_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
