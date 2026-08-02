const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const admins = [
  {
    email: 'support@hiconnectgo.com',
    password: 'M1cr0s0ft@8!',
    name: 'Support Admin',
    role: 'supervisor',
    supervisorEmail: 'rebecca.adenike@hiconnectgo.com',
  },
  {
    email: 'rebecca.adenike@hiconnectgo.com',
    password: 'Welcome@#2026',
    name: 'Rebecca Adenike',
    role: 'supervisor',
    supervisorEmail: null,
  },
  {
    email: 'hello@hiconnectgo.com',
    password: 'M1cr0s0ft@8!',
    name: 'Inspection Centre',
    role: 'inspection_centre',
    supervisorEmail: 'rebecca.adenike@hiconnectgo.com',
  },
];

async function main() {
  for (const admin of admins) {
    const passwordHash = await bcrypt.hash(admin.password, 10);
    await prisma.adminUser.upsert({
      where: { email: admin.email },
      update: {
        passwordHash,
        name: admin.name,
        role: admin.role,
        isActive: true,
        supervisorEmail: admin.supervisorEmail,
      },
      create: {
        email: admin.email,
        passwordHash,
        name: admin.name,
        role: admin.role,
        isActive: true,
        supervisorEmail: admin.supervisorEmail,
      },
    });
    console.log(`seeded ${admin.email}`);
  }
}

main()
  .catch((e) => {
    console.error('admin seed failed:', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
