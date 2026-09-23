-- Track passenger/driver liveness for beta cohort measurement
ALTER TABLE "users" ADD COLUMN "last_seen_at" TIMESTAMP(3);
ALTER TABLE "drivers" ADD COLUMN "last_seen_at" TIMESTAMP(3);
