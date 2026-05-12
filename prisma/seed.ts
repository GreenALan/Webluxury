import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com';
  const tempPassword = crypto.randomBytes(9).toString('base64url');

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Owner ${email} 已存在，跳过 seed。`);
    return;
  }

  await prisma.adminUser.create({
    data: {
      email,
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: await hashPassword(tempPassword)
    }
  });

  console.log('============================================');
  console.log(' 初始 OWNER 账号已创建');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${tempPassword}`);
  console.log(' 请立即登录并修改密码。');
  console.log('============================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
