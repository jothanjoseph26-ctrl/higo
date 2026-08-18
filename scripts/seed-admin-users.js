const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

async function seedAdminUsers() {
  const admins = [
    {
      email: 'support@hiconnectgo.com',
      password: 'M1cr0s0ft@8!',
      name: 'Support Admin',
      role: 'supervisor',
      supervisor: 'rebecca.adenike@hiconnectgo.com',
    },
    {
      email: 'rebecca.adenike@hiconnectgo.com',
      password: 'Welcome@#2026',
      name: 'Rebecca Adenike',
      role: 'supervisor',
      supervisor: null,
    },
    {
      email: 'hello@hiconnectgo.com',
      password: 'M1cr0s0ft@8!',
      name: 'Inspection Centre',
      role: 'inspection_centre',
      supervisor: 'rebecca.adenike@hiconnectgo.com',
    },
  ];

  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 10);

    await prisma.adminUser.upsert({
      where: { email: admin.email },
      update: {
        passwordHash,
        name: admin.name,
        role: admin.role,
        isActive: true,
        supervisor: admin.supervisor,
      },
      create: {
        email: admin.email,
        passwordHash,
        name: admin.name,
        role: admin.role,
        isActive: true,
        supervisor: admin.supervisor,
      },
    });

    console.log(`Created/updated admin user: ${admin.email} (${admin.role})`);
  }

  console.log('Admin users seeded successfully');
}

seedAdminUsers()
  .catch((e) => {
    console.error('Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
