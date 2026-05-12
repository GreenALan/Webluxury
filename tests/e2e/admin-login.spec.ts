import { test, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const TEST_EMAIL = 'e2e-login@x.com';
const TEST_PASSWORD = 'TestPass-123';

test.beforeAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.adminUser.create({
    data: {
      email: TEST_EMAIL,
      name: 'E2E',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 12)
    }
  });
});

test.afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

test('未登录访问 /admin 跳到 /admin/login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: '后台登录' })).toBeVisible();
});

test('正确凭证可登录并进入仪表盘', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(TEST_EMAIL);
  await page.getByLabel('密码').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
});

test('错误密码显示错误信息', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(TEST_EMAIL);
  await page.getByLabel('密码').fill('wrong');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByText('邮箱或密码错误')).toBeVisible();
});
