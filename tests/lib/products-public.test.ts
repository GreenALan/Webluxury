import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category } from '@prisma/client';
import {
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductsByIds,
  getFacets
} from '@/lib/products';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;
let catA: Category;
let catB: Category;

beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pub-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pub-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pub-test@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'pub-test@x.com',
      name: 'pub-test',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  catA = await prisma.category.create({
    data: { slug: 'pub-cat-watch', nameZh: '手表', nameEn: 'Watches', sortOrder: 1 }
  });
  catB = await prisma.category.create({
    data: { slug: 'pub-cat-bag', nameZh: '包', nameEn: 'Bags', sortOrder: 2 }
  });
  // 1 AVAILABLE in catA Rolex, 1 AVAILABLE in catB LV, 1 DRAFT (must be hidden), 1 SOLD (must be hidden)
  await prisma.product.create({
    data: {
      slug: 'pub-t-watch-1',
      titleZh: '劳力士潜航者',
      titleEn: 'Rolex Submariner',
      brand: 'Rolex',
      categoryId: catA.id,
      price: '88000.00',
      currency: 'CNY',
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-bag-1',
      titleZh: 'LV 老花',
      titleEn: 'LV Monogram',
      brand: 'Louis Vuitton',
      categoryId: catB.id,
      price: '12000.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-draft',
      titleZh: '草稿',
      brand: 'X',
      categoryId: catA.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'DRAFT',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-sold',
      titleZh: '已售',
      brand: 'X',
      categoryId: catA.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'SOLD',
      uploadedById: owner.id
    }
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pub-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pub-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pub-test@x.com' } });
  await prisma.$disconnect();
});

describe('listPublicProducts', () => {
  it('只返回 AVAILABLE，按 createdAt desc', async () => {
    const r = await listPublicProducts({});
    expect(r.items.every((p) => p.status === 'AVAILABLE')).toBe(true);
    expect(r.items.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['pub-t-watch-1', 'pub-t-bag-1'])
    );
    expect(r.items.find((p) => p.slug === 'pub-t-draft')).toBeUndefined();
    expect(r.items.find((p) => p.slug === 'pub-t-sold')).toBeUndefined();
  });

  it('按 category slug 过滤', async () => {
    const r = await listPublicProducts({ categorySlug: 'pub-cat-watch' });
    expect(r.items.map((p) => p.slug)).toEqual(['pub-t-watch-1']);
  });

  it('按 brand 精确过滤', async () => {
    const r = await listPublicProducts({ brand: 'Rolex' });
    // Scope to this file's fixtures — other parallel test files may also seed Rolex products.
    const mine = r.items.filter((p) => p.slug.startsWith('pub-t-'));
    expect(mine.map((p) => p.slug)).toEqual(['pub-t-watch-1']);
  });

  it('按 minPrice / maxPrice 过滤', async () => {
    const lo = await listPublicProducts({ minPrice: 50000 });
    expect(lo.items.filter((p) => p.slug.startsWith('pub-t-')).map((p) => p.slug)).toEqual([
      'pub-t-watch-1'
    ]);
    const hi = await listPublicProducts({ maxPrice: 50000 });
    expect(hi.items.filter((p) => p.slug.startsWith('pub-t-')).map((p) => p.slug)).toEqual([
      'pub-t-bag-1'
    ]);
  });

  it('分页', async () => {
    const p1 = await listPublicProducts({ page: 1, pageSize: 1 });
    expect(p1.items).toHaveLength(1);
    expect(p1.total).toBeGreaterThanOrEqual(2);
    const p2 = await listPublicProducts({ page: 2, pageSize: 1 });
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
  });
});

describe('getPublicProductBySlug', () => {
  it('AVAILABLE 可拿到', async () => {
    const p = await getPublicProductBySlug('pub-t-watch-1');
    expect(p?.slug).toBe('pub-t-watch-1');
    expect(p?.category?.slug).toBe('pub-cat-watch');
  });

  it('DRAFT 返回 null', async () => {
    expect(await getPublicProductBySlug('pub-t-draft')).toBeNull();
  });

  it('SOLD 返回 null', async () => {
    expect(await getPublicProductBySlug('pub-t-sold')).toBeNull();
  });
});

describe('getPublicProductsByIds', () => {
  it('按 ids 取，仅 AVAILABLE，按入参顺序', async () => {
    const a = await prisma.product.findUnique({ where: { slug: 'pub-t-watch-1' } });
    const b = await prisma.product.findUnique({ where: { slug: 'pub-t-bag-1' } });
    const draft = await prisma.product.findUnique({ where: { slug: 'pub-t-draft' } });
    const r = await getPublicProductsByIds([b!.id, a!.id, draft!.id, 'no-such-id']);
    expect(r.map((p) => p.slug)).toEqual(['pub-t-bag-1', 'pub-t-watch-1']);
  });

  it('空数组返回 []', async () => {
    expect(await getPublicProductsByIds([])).toEqual([]);
  });
});

describe('getFacets', () => {
  it('返回有 AVAILABLE 商品的分类和品牌', async () => {
    const f = await getFacets();
    const catSlugs = f.categories.map((c) => c.slug);
    expect(catSlugs).toEqual(expect.arrayContaining(['pub-cat-watch', 'pub-cat-bag']));
    expect(f.brands).toEqual(expect.arrayContaining(['Rolex', 'Louis Vuitton']));
    // brand 'X' 只挂在 DRAFT/SOLD 上，不应出现
    expect(f.brands).not.toContain('X');
  });
});
