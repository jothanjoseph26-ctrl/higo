-- AlterTable
ALTER TABLE "drivers"
  ADD COLUMN "auto_accept_threshold" DECIMAL(10,2),
  ADD COLUMN "auto_counter_threshold" DECIMAL(10,2),
  ADD COLUMN "auto_counter_amount" DECIMAL(10,2),
  ADD COLUMN "max_negotiation_dist_km" DECIMAL(5,1),
  ADD COLUMN "max_pickup_time_min" INTEGER;
