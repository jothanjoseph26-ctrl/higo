import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function seedAdminUsers() {
  const admins = [
    {
      email: 'support@hiconnectgo.com',
      password: 'M1cr0s0ft@8!',
      name: 'Support Admin',
      role: 'supervisor',
      supervisor: 'rebecca.adenike@hiconnectgo.com',
      isActive: true,
    },
    {
      email: 'rebecca.adenike@hiconnectgo.com',
      password: 'Welcome@#2026',
      name: 'Rebecca Adenike',
      role: 'supervisor',
      supervisor: undefined,
      isActive: true,
    },
    {
      email: 'hello@hiconnectgo.com',
      password: 'M1cr0s0ft@8!',
      name: 'Inspection Centre',
      role: 'inspection_centre',
      supervisor: 'rebecca.adenike@hiconnectgo.com',
      isActive: true,
    },
  ];

  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 10);

    // Delete existing if present
    await prisma.adminUser.deleteMany({
      where: { email: admin.email },
    });

    const created = await prisma.adminUser.create({
      data: {
        email: admin.email,
        passwordHash,
        name: admin.name,
        role: admin.role,
        isActive: admin.isActive,
        supervisor: admin.supervisor || null,
        lastLogin: new Date(),
      },
    });

    console.log(`✅ Created admin user: ${admin.email} (${admin.role})`);
  }

  console.log('✅ Admin users seeded successfully');
}

seedAdminUsers()
  .catch((e) => {
    console.error('❌ Seeding failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
