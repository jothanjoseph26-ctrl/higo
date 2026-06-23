-- CreateTable
CREATE TABLE "compliance_audit_logs" (
    "id" UUID NOT NULL,
    "driver_id" UUID NOT NULL,
    "doc_type" TEXT,
    "action" TEXT NOT NULL,
    "actor_id" UUID,
    "actor_type" TEXT,
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "compliance_audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "compliance_audit_logs_driver_id_idx" ON "compliance_audit_logs"("driver_id");

-- CreateIndex
CREATE INDEX "compliance_audit_logs_action_idx" ON "compliance_audit_logs"("action");

-- CreateIndex
CREATE INDEX "compliance_audit_logs_created_at_idx" ON "compliance_audit_logs"("created_at");