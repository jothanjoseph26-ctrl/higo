const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

const prisma = new PrismaClient();

const email = process.env.ADMIN_EMAIL || 'hiconnectgo@gmail.com';
const password = process.env.ADMIN_PASSWORD || 'M1cr0s0ft@8!';

async function main() {
  const passwordHash = await bcrypt.hash(password, 12);
  const existing = await prisma.adminUser.findFirst({
    orderBy: { createdAt: 'asc' },
  });

  if (existing) {
    await prisma.adminUser.update({
      where: { id: existing.id },
      data: { email, passwordHash, isActive: true, name: 'HiGo Admin' },
    });
    console.log(`Updated admin user ${existing.id} -> ${email}`);
    return;
  }

  await prisma.adminUser.create({
    data: {
      name: 'HiGo Admin',
      email,
      passwordHash,
      role: 'super_admin',
      isActive: true,
    },
  });
  console.log(`Created super_admin: ${email}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });