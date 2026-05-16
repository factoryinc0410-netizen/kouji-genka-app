-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('bidding', 'in_progress', 'completed', 'billing', 'closed');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('public', 'private');

-- CreateEnum
CREATE TYPE "ConstructionType" AS ENUM ('civil', 'building', 'renovation');

-- CreateEnum
CREATE TYPE "CustomerType" AS ENUM ('client', 'general', 'subcontractor', 'supplier');

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "name_kana" VARCHAR(200),
    "customer_type" "CustomerType" NOT NULL,
    "address" TEXT,
    "phone" VARCHAR(50),
    "email" VARCHAR(255),
    "contact_person" VARCHAR(100),
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "name" VARCHAR(200) NOT NULL,
    "customer_id" UUID NOT NULL,
    "location" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "actual_end_date" DATE,
    "contract_amount" DECIMAL(15,0) NOT NULL DEFAULT 0,
    "status" "ProjectStatus" NOT NULL DEFAULT 'bidding',
    "project_type" "ProjectType" NOT NULL DEFAULT 'private',
    "construction_type" "ConstructionType" NOT NULL DEFAULT 'building',
    "manager_user_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL,
    "deleted_at" TIMESTAMPTZ(6),

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_status_history" (
    "id" BIGSERIAL NOT NULL,
    "project_id" UUID NOT NULL,
    "from_status" "ProjectStatus",
    "to_status" "ProjectStatus" NOT NULL,
    "changed_by_id" UUID NOT NULL,
    "changed_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reason" TEXT,

    CONSTRAINT "project_status_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_code_key" ON "customers"("code");

-- CreateIndex
CREATE INDEX "customers_customer_type_idx" ON "customers"("customer_type");

-- CreateIndex
CREATE INDEX "customers_deleted_at_idx" ON "customers"("deleted_at");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_customer_id_idx" ON "projects"("customer_id");

-- CreateIndex
CREATE INDEX "projects_manager_user_id_idx" ON "projects"("manager_user_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_deleted_at_idx" ON "projects"("deleted_at");

-- CreateIndex
CREATE INDEX "project_status_history_project_id_idx" ON "project_status_history"("project_id");

-- CreateIndex
CREATE INDEX "project_status_history_changed_at_idx" ON "project_status_history"("changed_at");

-- AddForeignKey
ALTER TABLE "user_project_permissions" ADD CONSTRAINT "user_project_permissions_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_manager_user_id_fkey" FOREIGN KEY ("manager_user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_status_history" ADD CONSTRAINT "project_status_history_changed_by_id_fkey" FOREIGN KEY ("changed_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
