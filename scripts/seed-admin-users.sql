-- Seed admin users
-- Password hashes generated with bcrypt(10 rounds)
-- support@hiconnectgo.com: M1cr0s0ft@8!
-- rebecca.adenike@hiconnectgo.com: Welcome@#2026
-- hello@hiconnectgo.com: M1cr0s0ft@8!

INSERT INTO "AdminUser" (id, email, "passwordHash", name, role, "isActive", supervisor, "lastLogin", "createdAt", "updatedAt")
VALUES
  ('admin-support-001', 'support@hiconnectgo.com', '$2a$10$ZRQbEKgV7OG7Y5fU9OZvxOFjZqGxV8zK6X9L8M7N6O5P4Q3R2S1T0', 'Support Admin', 'supervisor', true, 'rebecca.adenike@hiconnectgo.com', NOW(), NOW(), NOW()),
  ('admin-rebecca-001', 'rebecca.adenike@hiconnectgo.com', '$2a$10$W9V8U7T6S5R4Q3P2O1N0M9L8K7J6I5H4G3F2E1D0C9B8A7Z6Y5X4', 'Rebecca Adenike', 'supervisor', true, NULL, NOW(), NOW(), NOW()),
  ('admin-inspection-001', 'hello@hiconnectgo.com', '$2a$10$ZRQbEKgV7OG7Y5fU9OZvxOFjZqGxV8zK6X9L8M7N6O5P4Q3R2S1T0', 'Inspection Centre', 'inspection_centre', true, 'rebecca.adenike@hiconnectgo.com', NOW(), NOW(), NOW())
ON CONFLICT (email) DO UPDATE SET
  "passwordHash" = EXCLUDED."passwordHash",
  name = EXCLUDED.name,
  role = EXCLUDED.role,
  "isActive" = EXCLUDED."isActive",
  supervisor = EXCLUDED.supervisor,
  "lastLogin" = NOW(),
  "updatedAt" = NOW();

-- Note: The password hashes above are examples. Use bcrypt to generate real hashes:
-- bcrypt.hash('M1cr0s0ft@8!', 10) for support and inspection
-- bcrypt.hash('Welcome@#2026', 10) for rebecca
