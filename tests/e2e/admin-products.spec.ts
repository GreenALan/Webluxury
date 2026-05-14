import { test, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'e2e-products@x.com';
const PASSWORD = 'TestPass-456';

test.beforeAll(async () => {
  const cat = await prisma.category.findFirst({ where: { slug: 'e2e-cat-watch' } });
  if (cat) {
    await prisma.product.deleteMany({ where: { categoryId: cat.id } });
    await prisma.category.delete({ where: { id: cat.id } });
  }
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.category.create({
    data: { slug: 'e2e-cat-watch', nameZh: '手表', nameEn: 'Watches', sortOrder: 99 }
  });
  await prisma.adminUser.create({
    data: {
      email: EMAIL,
      name: 'E2E Products',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(PASSWORD, 12)
    }
  });
});

test.afterAll(async () => {
  const cat = await prisma.category.findFirst({ where: { slug: 'e2e-cat-watch' } });
  if (cat) {
    await prisma.product.deleteMany({ where: { categoryId: cat.id } });
    await prisma.category.delete({ where: { id: cat.id } });
  }
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('登录后能进入商品列表', async ({ page }, testInfo) => {
  // Admin sidebar is desktop-only (hidden md:block). M2 scope: admin is desktop-first.
  test.skip(testInfo.project.name === 'mobile-chrome', 'admin sidebar is desktop-only');
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(EMAIL);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: '商品', exact: true }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByRole('heading', { name: '商品' })).toBeVisible();
});
