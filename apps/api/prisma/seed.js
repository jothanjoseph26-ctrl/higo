const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'HiGo@Admin2024';

async function main() {
  // 1. Seed Launch Zones (permitted)
  const zoneCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM zones`;
  if (zoneCount[0].count <= 1) {
    await prisma.$executeRaw`DELETE FROM zones;`;

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
      { name: 'Jabi', poly: 'POLYGON((7.44 9.06, 7.46 9.06, 7.46 9.08, 7.44 9.08, 7.44 9.06))' },
      { name: 'Maitama Ext.', poly: 'POLYGON((7.47 9.08, 7.49 9.08, 7.49 9.10, 7.47 9.10, 7.47 9.08))' },
      { name: 'Life Camp', poly: 'POLYGON((7.40 9.08, 7.42 9.08, 7.42 9.10, 7.40 9.10, 7.40 9.08))' },
      { name: 'Kubwa', poly: 'POLYGON((7.38 9.12, 7.40 9.12, 7.40 9.14, 7.38 9.14, 7.38 9.12))' },
    ];

    for (const z of launchZones) {
      await prisma.$executeRaw`
        INSERT INTO zones (id, name, zone_type, boundary, surge_multiplier, is_active, created_at)
        VALUES (
          gen_random_uuid(),
          ${z.name},
          'permitted',
          ST_GeogFromText(${`SRID=4326;${z.poly}`}),
          1.0,
          true,
          NOW()
        )
      `;
    }
    console.log(`Seeded ${launchZones.length} launch zones`);

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
          ST_GeogFromText(${`SRID=4326;${z.poly}`}),
          1.0,
          true,
          NOW()
        )
      `;
    }
    console.log(`Seeded ${restrictedZones.length} restricted zones`);
  }

  // 2. Seed Pricing Configs
  const pricingCount = await prisma.pricingConfig.count();
  if (pricingCount === 0) {
    const pricingConfigs = [
      {
        vehicleType: 'keke',
        baseFare: 50000,
        perKmFare: 12000,
        perMinFare: 1500,
        minFare: 70000,
        currency: 'NGN',
        isActive: true,
      },
      {
        vehicleType: 'car',
        baseFare: 100000,
        perKmFare: 20000,
        perMinFare: 2500,
        minFare: 150000,
        currency: 'NGN',
        isActive: true,
      },
      {
        vehicleType: 'bike',
        baseFare: 30000,
        perKmFare: 8000,
        perMinFare: 1000,
        minFare: 50000,
        currency: 'NGN',
        isActive: true,
      },
    ];

    for (const p of pricingConfigs) {
      await prisma.pricingConfig.create({ data: p });
    }
    console.log('Seeded keke, car, bike pricing configs');
  }

  // 3. Seed Super Admin (with proper bcrypt hash)
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@hiconnect.com';
  const existingAdmin = await prisma.adminUser.findUnique({
    where: { email: adminEmail },
  });
  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(ADMIN_PASSWORD, 12);
    await prisma.adminUser.create({
      data: {
        name: 'Super Admin',
        email: adminEmail,
        passwordHash,
        role: 'super_admin',
        isActive: true,
      },
    });
    console.log(`Seeded super_admin: ${adminEmail}`);
    console.log(`Password: ${ADMIN_PASSWORD}`);
    console.log('⚠️  Change this password after first login!');
  } else {
    console.log(`Admin ${adminEmail} already exists, skipping`);
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
