import { test, expect } from '@playwright/test';
import { PrismaClient, Role, type Category, type AdminUser } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'e2e-public@x.com';
const CAT_SLUG = 'e2e-pub-cat';
const SLUG = 'e2e-pub-rolex';

let owner: AdminUser;
let cat: Category;

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-pub-' } } });
  const existingCat = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (existingCat) await prisma.category.delete({ where: { id: existingCat.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });

  owner = await prisma.adminUser.create({
    data: {
      email: EMAIL,
      name: 'e2e-pub',
      role: Role.OWNER,
      passwordHash: await bcrypt.hash('TestPass-789', 12)
    }
  });
  cat = await prisma.category.create({
    data: { slug: CAT_SLUG, nameZh: '手表 E2E', nameEn: 'Watches E2E', sortOrder: 50 }
  });
  await prisma.product.create({
    data: {
      slug: SLUG,
      titleZh: '劳力士 E2E',
      titleEn: 'Rolex E2E',
      brand: 'RolexE2E',
      categoryId: cat.id,
      price: '88000.00',
      currency: 'CNY',
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-pub-' } } });
  const c = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (c) await prisma.category.delete({ where: { id: c.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('首页 → 列表 → 详情 → 收藏 → 收藏页', async ({ page }) => {
  await page.goto('/zh');
  await expect(page.getByRole('heading', { name: '精选二手奢品' })).toBeVisible();
  // Browse all
  await page.getByRole('link', { name: '浏览全部' }).first().click();
  await expect(page).toHaveURL(/\/zh\/products$/);
  await expect(page.getByRole('heading', { name: '全部商品' })).toBeVisible();

  // Detail
  await page.getByRole('link', { name: '劳力士 E2E' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/zh/products/${SLUG}$`));
  await expect(page.getByRole('heading', { name: '劳力士 E2E' })).toBeVisible();

  // Favorite
  await page.getByRole('button', { name: '收藏' }).click();
  await expect(page.getByRole('button', { name: '取消收藏' })).toBeVisible();

  // Favorites page
  await page.goto('/zh/favorites');
  await expect(page.getByRole('heading', { name: '我的收藏' })).toBeVisible();
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});

test('切换语言保留页面', async ({ page }) => {
  await page.goto(`/zh/products/${SLUG}`);
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/products/${SLUG}$`));
  await expect(page.getByRole('heading', { name: 'Rolex E2E' })).toBeVisible();
});

test('筛选按品牌过滤（桌面侧栏）', async ({ page }, testInfo) => {
  // FilterPanel renders both the desktop sidebar and a mobile drawer trigger;
  // we drive only the visible (desktop) form here. On mobile-chrome the
  // sidebar is hidden via `hidden md:block`, so skip — the URL-driven
  // navigation itself is exercised by the next test.
  test.skip(testInfo.project.name === 'mobile-chrome', 'desktop sidebar only');
  await page.goto('/zh/products');
  const visibleSelects = page.locator('select:visible');
  await visibleSelects.nth(1).selectOption('RolexE2E'); // [category, brand]
  await page.getByRole('button', { name: '应用' }).click();
  await expect(page).toHaveURL(/brand=RolexE2E/);
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});

test('移动端通过 URL 直接命中筛选', async ({ page }) => {
  await page.goto('/zh/products?brand=RolexE2E');
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});
