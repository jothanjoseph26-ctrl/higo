INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
SELECT
  gen_random_uuid(),
  'Abuja Metro',
  'permitted',
  ST_GeogFromText('SRID=4326;POLYGON((7.25 8.95, 7.55 8.95, 7.55 9.15, 7.25 9.15, 7.25 8.95))'),
  1.0,
  true,
  NOW()
WHERE NOT EXISTS (SELECT 1 FROM zones WHERE name = 'Abuja Metro');