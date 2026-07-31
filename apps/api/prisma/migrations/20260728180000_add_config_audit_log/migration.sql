-- Base44 migration Track 06: Admin Studio config audit trail.
-- Mirrors the FinancialAudit/ComplianceAudit append-only pattern.

CREATE TABLE "config_audit_logs" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "key" TEXT NOT NULL,
  "previous_value" JSONB,
  "new_value" JSONB,
  "changed_by" UUID NOT NULL,
  "changed_by_type" TEXT NOT NULL DEFAULT 'admin',
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "config_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "config_audit_logs_key_idx" ON "config_audit_logs"("key");
CREATE INDEX "config_audit_logs_changed_by_idx" ON "config_audit_logs"("changed_by");
CREATE INDEX "config_audit_logs_created_at_idx" ON "config_audit_logs"("created_at");

ALTER TABLE "config_audit_logs" ADD CONSTRAINT "config_audit_logs_changed_by_fkey"
  FOREIGN KEY ("changed_by") REFERENCES "admin_users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
