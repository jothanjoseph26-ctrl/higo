-- Idempotent re-application of the supervisor/inspection_centre admin roles.
-- Production was observed returning "Value 'supervisor' not found in enum
-- 'AdminRole'" despite migration 20260802150000_admin_supervisor_roles
-- being recorded as applied -- re-run defensively with IF NOT EXISTS so this
-- is safe regardless of what actually landed in the database.
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'supervisor';
ALTER TYPE "AdminRole" ADD VALUE IF NOT EXISTS 'inspection_centre';

ALTER TABLE "admin_users" ADD COLUMN IF NOT EXISTS "supervisor_email" TEXT;
