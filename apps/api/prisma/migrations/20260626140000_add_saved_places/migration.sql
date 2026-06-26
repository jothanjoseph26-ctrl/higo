-- Add saved places JSON column for passenger home/work shortcuts
ALTER TABLE "users" ADD COLUMN "saved_places" JSONB;