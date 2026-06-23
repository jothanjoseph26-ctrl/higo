-- DropIndex
DROP INDEX "idx_driver_locations_location";

-- DropIndex
DROP INDEX "idx_trips_pickup_location";

-- DropIndex
DROP INDEX "idx_zones_boundary";

-- CreateTable
CREATE TABLE "financial_audit_logs" (
    "id" UUID NOT NULL,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT,
    "reference" TEXT NOT NULL,
    "amount" INTEGER,
    "before_status" TEXT,
    "after_status" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "financial_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "financial_audit_logs_reference_key" ON "financial_audit_logs"("reference");

-- CreateIndex
CREATE INDEX "financial_audit_logs_action_idx" ON "financial_audit_logs"("action");

-- CreateIndex
CREATE INDEX "financial_audit_logs_actor_id_idx" ON "financial_audit_logs"("actor_id");

-- CreateIndex
CREATE INDEX "financial_audit_logs_created_at_idx" ON "financial_audit_logs"("created_at");
