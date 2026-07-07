CREATE TYPE "ContactSubmissionStatus" AS ENUM ('new', 'triaged', 'closed');

CREATE TABLE "contact_submissions" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "role" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'web',
    "status" "ContactSubmissionStatus" NOT NULL DEFAULT 'new',
    "metadata" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contact_submissions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "contact_submissions_status_idx" ON "contact_submissions"("status");
CREATE INDEX "contact_submissions_role_idx" ON "contact_submissions"("role");
CREATE INDEX "contact_submissions_created_at_idx" ON "contact_submissions"("created_at");
