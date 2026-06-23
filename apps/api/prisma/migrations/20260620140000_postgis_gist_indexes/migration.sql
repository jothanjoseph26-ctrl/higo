-- GiST spatial indexes (Prisma cannot express USING GIST)

CREATE INDEX IF NOT EXISTS idx_drivers_online_location
  ON drivers USING GIST (current_location) WHERE is_online = true;

CREATE INDEX IF NOT EXISTS idx_zones_boundary
  ON zones USING GIST (boundary);

CREATE INDEX IF NOT EXISTS idx_trips_pickup_location
  ON trips USING GIST (pickup_location);

CREATE INDEX IF NOT EXISTS idx_driver_locations_location
  ON driver_locations USING GIST (location);