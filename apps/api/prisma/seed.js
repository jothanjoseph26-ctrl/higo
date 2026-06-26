const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'M1cr0s0ft@8!';

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
  const adminEmail = process.env.ADMIN_EMAIL || 'hiconnectgo@gmail.com';
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

  // 4. Seed test promo code
  const existingPromo = await prisma.promoCode.findUnique({
    where: { code: 'WELCOME10' },
  });
  if (!existingPromo) {
    const expiresAt = new Date();
    expiresAt.setFullYear(expiresAt.getFullYear() + 1);

    await prisma.promoCode.create({
      data: {
        code: 'WELCOME10',
        discountType: 'percent',
        discountValue: 1000,
        maxUses: 10000,
        expiresAt,
        isActive: true,
      },
    });
    console.log('Seeded promo code WELCOME10 (10% off)');
  } else {
    console.log('Promo WELCOME10 already exists, skipping');
  }

  // 5. Seed platform settings (singleton row)
  const existingSettings = await prisma.platformSettings.findUnique({
    where: { id: 'default' },
  });
  if (!existingSettings) {
    await prisma.platformSettings.create({
      data: {
        id: 'default',
        settings: {
          googleMapsOriginRestriction: false,
          smsGatewayChannel: 'firebase',
          maintenanceMode: false,
          platformCommissionRate: 0.10,
          surgeEnabled: false,
        },
      },
    });
    console.log('Seeded platform_settings (default row)');
  } else {
    console.log('Platform settings already exist, skipping');
  }

  // 6. Seed landmark database (Abuja landmarks for HCE)
  const landmarkCount = await prisma.$queryRaw`SELECT COUNT(*)::int as count FROM landmark_database`;
  if (landmarkCount[0].count <= 1) {
    const landmarks = [
      { name: 'Apo Market', aliases: '["Apo Junction", "Apo Market"]', zone: 'Apo', lat: 9.0020, lng: 7.4830, type: 'market' },
      { name: 'Galadimawa Roundabout', aliases: '["Galadima", "Galadimawa Junction"]', zone: 'Galadimawa', lat: 9.0250, lng: 7.4500, type: 'junction' },
      { name: 'Lugbe Under Bridge', aliases: '["Lugbe Bridge", "Lugbe Junction"]', zone: 'Lugbe', lat: 8.9700, lng: 7.3700, type: 'junction' },
      { name: 'Gwarimpa Estate Gate 1', aliases: '["Gwarimpa Gate", "Gwarimpa Main Gate"]', zone: 'Gwarimpa', lat: 9.1100, lng: 7.4100, type: 'estate_gate' },
      { name: 'Kubwa Market', aliases: '["Kubwa Junction", "Kubwa"]', zone: 'Kubwa', lat: 9.1300, lng: 7.3900, type: 'market' },
      { name: 'Nyanya Market', aliases: '["Nyanya Junction", "Nyanya"]', zone: 'Nyanya', lat: 9.0600, lng: 7.5100, type: 'market' },
      { name: 'Karu Market', aliases: '["Karu Junction"]', zone: 'Karu', lat: 9.0400, lng: 7.5200, type: 'market' },
      { name: 'Lokogoma Junction', aliases: '["Lokogoma Roundabout"]', zone: 'Lokogoma', lat: 9.0000, lng: 7.4300, type: 'junction' },
      { name: 'Wuse Market', aliases: '["Wuse Phase 1 Market"]', zone: 'Wuse', lat: 9.0700, lng: 7.4650, type: 'market' },
      { name: 'Gaduwa Estate', aliases: '["Gaduwa Gate"]', zone: 'Gaduwa', lat: 9.0150, lng: 7.4400, type: 'estate_gate' },
      { name: 'National Mosque', aliases: '["Abuja National Mosque", "Central Mosque"]', zone: 'Central Area', lat: 9.0600, lng: 7.4900, type: 'mosque' },
      { name: 'National Hospital', aliases: '["National Hospital Abuja"]', zone: 'Central Area', lat: 9.0550, lng: 7.4850, type: 'hospital' },
      { name: 'Bwari Junction', aliases: '["Bwari Market"]', zone: 'Bwari', lat: 9.2200, lng: 7.3800, type: 'junction' },
      { name: 'Dawaki Junction', aliases: '["Dawaki Market"]', zone: 'Dawaki', lat: 9.1400, lng: 7.4000, type: 'junction' },
    ];

    for (const lm of landmarks) {
      await prisma.$executeRaw`
        INSERT INTO landmark_database (id, name, aliases, zone, lat, lng, landmark_type, verified, usage_count, created_at)
        VALUES (
          gen_random_uuid(),
          ${lm.name},
          ${lm.aliases}::jsonb,
          ${lm.zone},
          ${lm.lat},
          ${lm.lng},
          ${lm.type},
          true,
          0,
          NOW()
        )
      `;
    }
    console.log(`Seeded ${landmarks.length} Abuja landmarks`);
  } else {
    console.log('Landmark database already has data, skipping');
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
