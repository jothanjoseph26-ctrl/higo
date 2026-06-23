const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

async function main() {
  const zoneCount = await prisma.zone.count();
  if (zoneCount <= 1) {
    // Delete placeholder if present
    await prisma.$executeRaw`DELETE FROM zones;`;

    // 1. Seed Launch Zones (permitted)
    const launchZones = [
      { name: 'Apo', poly: 'POLYGON((7.48 8.97, 7.50 8.97, 7.50 8.99, 7.48 8.99, 7.48 8.97))' },
      { name: 'Lokogoma', poly: 'POLYGON((7.42 8.99, 7.44 8.99, 7.44 9.01, 7.42 9.01, 7.42 8.99))' },
      { name: 'Lugbe', poly: 'POLYGON((7.36 8.96, 7.38 8.96, 7.38 8.98, 7.36 8.98, 7.36 8.96))' },
      { name: 'Gudu', poly: 'POLYGON((7.45 9.00, 7.47 9.00, 7.47 9.02, 7.45 9.02, 7.45 9.00))' },
      { name: 'Kaura', poly: 'POLYGON((7.43 9.01, 7.45 9.01, 7.45 9.03, 7.43 9.03, 7.43 9.01))' },
      { name: 'Games Village', poly: 'POLYGON((7.45 9.02, 7.47 9.02, 7.47 9.04, 7.45 9.04, 7.45 9.02))' },
      { name: 'Wuye', poly: 'POLYGON((7.43 9.04, 7.45 9.04, 7.45 9.06, 7.43 9.06, 7.43 9.04))' },
      { name: 'Utako', poly: 'POLYGON((7.43 9.06, 7.45 9.06, 7.45 9.08, 7.43 9.08, 7.43 9.06))' },
      { name: 'Wuse', poly: 'POLYGON((7.45 9.06, 7.48 9.06, 7.48 9.08, 7.45 9.08, 7.45 9.06))' },
      { name: 'Gwarimpa', poly: 'POLYGON((7.40 9.10, 7.43 9.10, 7.43 9.12, 7.40 9.12, 7.40 9.10))' },
    ];

    for (const z of launchZones) {
      await prisma.$executeRaw`
        INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          ${z.name},
          'permitted',
          ST_GeogFromText(${'SRID=4326;' + z.poly}),
          1.0,
          true,
          NOW()
        )
      `;
    }
    console.log('Seeded launch zones');

    // 2. Seed Restricted Zones (restricted)
    const restrictedZones = [
      { name: 'Asokoro', poly: 'POLYGON((7.51 9.02, 7.54 9.02, 7.54 9.05, 7.51 9.05, 7.51 9.02))' },
      { name: 'Maitama', poly: 'POLYGON((7.48 9.08, 7.51 9.08, 7.51 9.10, 7.48 9.10, 7.48 9.08))' },
      { name: 'Central Area', poly: 'POLYGON((7.48 9.05, 7.50 9.05, 7.50 9.07, 7.48 9.07, 7.48 9.05))' },
      { name: 'Three Arms Zone', poly: 'POLYGON((7.50 9.05, 7.52 9.05, 7.52 9.07, 7.50 9.07, 7.50 9.05))' },
      { name: 'Aso Villa Axis', poly: 'POLYGON((7.52 9.06, 7.54 9.06, 7.54 9.08, 7.52 9.08, 7.52 9.06))' },
      { name: 'Diplomatic Zone', poly: 'POLYGON((7.47 9.04, 7.49 9.04, 7.49 9.06, 7.47 9.06, 7.47 9.04))' },
    ];

    for (const z of restrictedZones) {
      await prisma.$executeRaw`
        INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          ${z.name},
          'restricted',
          ST_GeogFromText(${'SRID=4326;' + z.poly}),
          1.0,
          true,
          NOW()
        )
      `;
    }
    console.log('Seeded restricted zones');
  }

  const pricingCount = await prisma.pricingConfig.count();
  if (pricingCount === 0) {
    // Seed standard keke pricing config
    await prisma.pricingConfig.create({
      data: {
        vehicleType: 'keke',
        baseFare: 50000, // ₦500
        perKmFare: 12000, // ₦120
        perMinFare: 1500, // ₦15
        minFare: 70000, // ₦700
        currency: 'NGN',
        isActive: true,
      },
    });
    console.log('Seeded Standard Keke pricing config');
  }

  const adminEmail = 'admin@higo.local';
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    await prisma.adminUser.create({
      data: {
        name: 'HiGo Super Admin (placeholder)',
        email: adminEmail,
        passwordHash: 'PLACEHOLDER_HASH_PENDING_CLIENT_SIGN_OFF',
        role: 'super_admin',
        isActive: true,
      },
    });
    console.log('Seeded placeholder super_admin account');
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });