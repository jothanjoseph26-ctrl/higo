-- Add supervisor and inspection_centre roles to AdminRole enum
ALTER TYPE "AdminRole" ADD VALUE 'supervisor';
ALTER TYPE "AdminRole" ADD VALUE 'inspection_centre';

-- Add supervisor_email to track reporting lines between admin users
ALTER TABLE "admin_users" ADD COLUMN "supervisor_email" TEXT;
