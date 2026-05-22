import { test, expect } from '@playwright/test';
import { PrismaClient, Role, type AdminUser, type Category, type Product } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'e2e-inquiry@x.com';
const CAT_SLUG = 'e2e-inq-cat';
const PRODUCT_SLUG = 'e2e-inq-product';
const ADMIN_PASSWORD = 'TestPass-456';

let owner: AdminUser;
let cat: Category;
let product: Product;

test.beforeAll(async () => {
  await prisma.inquiry.deleteMany({
    where: { OR: [{ name: { startsWith: 'e2e-inq-' } }, { product: { slug: PRODUCT_SLUG } }] }
  });
  await prisma.product.deleteMany({ where: { slug: PRODUCT_SLUG } });
  const existingCat = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (existingCat) await prisma.category.delete({ where: { id: existingCat.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });

  owner = await prisma.adminUser.create({
    data: {
      email: EMAIL,
      name: 'e2e-inq',
      role: Role.OWNER,
      passwordHash: await bcrypt.hash(ADMIN_PASSWORD, 12)
    }
  });
  cat = await prisma.category.create({
    data: { slug: CAT_SLUG, nameZh: '询价 E2E', nameEn: 'Inq E2E', sortOrder: 60 }
  });
  product = await prisma.product.create({
    data: {
      slug: PRODUCT_SLUG,
      titleZh: '询价测试品',
      titleEn: 'Inquiry Test',
      brand: 'InqBrand',
      categoryId: cat.id,
      price: '12000.00',
      currency: 'CNY',
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
});

test.afterAll(async () => {
  await prisma.inquiry.deleteMany({
    where: { OR: [{ name: { startsWith: 'e2e-inq-' } }, { productId: product.id }] }
  });
  await prisma.product.deleteMany({ where: { slug: PRODUCT_SLUG } });
  const c = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (c) await prisma.category.delete({ where: { id: c.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('访客从详情页提交询价 → 后台标记已读 → 删除', async ({ page }, testInfo) => {
  // Admin sidebar is desktop-only (hidden md:block); the admin half of this flow can't run on mobile.
  test.skip(testInfo.project.name === 'mobile-chrome', 'admin sidebar is desktop-only');

  // 1. 访客打开详情页 → 提交
  await page.goto(`/zh/products/${PRODUCT_SLUG}`);
  await page.getByRole('button', { name: '询价' }).click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder('您的称呼').fill('e2e-inq-Alice');
  await dialog.getByPlaceholder('电话 / 微信号').fill('13800000001');
  await dialog
    .getByPlaceholder('请简单描述您的需求或想确认的细节')
    .fill('请问还有现货吗？');
  await dialog.getByRole('button', { name: '提交' }).click();
  await expect(dialog.getByText('已收到')).toBeVisible();

  // 2. 切到后台登录
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(EMAIL);
  await page.getByLabel('密码').fill(ADMIN_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  // 3. 进询价页
  await page.getByRole('link', { name: '询价' }).click();
  await expect(page).toHaveURL(/\/admin\/inquiries/);
  const row = page.locator('tr', { hasText: 'e2e-inq-Alice' });
  await expect(row).toBeVisible();
  await expect(row.getByText('未读')).toBeVisible();
  await expect(row.getByRole('link', { name: '询价测试品' })).toBeVisible();

  // 4. 标记已读
  await row.getByRole('button', { name: '标记已读' }).click();
  await expect(row.getByText('已读')).toBeVisible();

  // 5. 删除 —— ConfirmDialog 是 <dialog> 原生元素；用 [open] 选择器把"确认"按钮限定在弹窗内
  await row.getByRole('button', { name: '删除' }).click();
  const confirmDialog = page.locator('dialog[open]');
  await expect(confirmDialog).toBeVisible();
  await confirmDialog.getByRole('button', { name: '删除' }).click();
  await expect(page.locator('tr', { hasText: 'e2e-inq-Alice' })).toHaveCount(0);
});

test('限流：同 IP 第 4 次提交被拒绝', async ({ request }) => {
  // The inquiry route keys its rate-limit bucket on the client IP from `x-forwarded-for`.
  // Use a unique-per-run synthetic IP so this test never collides with prior submissions
  // (manual testing, the submit-flow test above, or earlier playwright runs).
  const fakeIp = `10.99.${Math.floor(Math.random() * 254) + 1}.${Math.floor(Math.random() * 254) + 1}`;
  const headers = { 'x-forwarded-for': fakeIp };

  // 三次成功
  for (let i = 0; i < 3; i++) {
    const res = await request.post('/api/inquiries', {
      headers,
      data: {
        name: `e2e-inq-rate-${i}`,
        contact: 'c',
        message: 'm',
        locale: 'zh'
      }
    });
    expect(res.status()).toBe(200);
  }
  // 第四次应被拒
  const res = await request.post('/api/inquiries', {
    headers,
    data: {
      name: 'e2e-inq-rate-4',
      contact: 'c',
      message: 'm',
      locale: 'zh'
    }
  });
  expect(res.status()).toBe(429);
});
