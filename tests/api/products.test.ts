import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category } from '@prisma/client';
import { GET } from '@/app/api/products/route';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;
let cat: Category;
let availId = '';
let draftId = '';

beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pubapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pubapi-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pubapi@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'pubapi@x.com',
      name: 'pubapi',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  cat = await prisma.category.create({
    data: { slug: 'pubapi-cat-w', nameZh: '手表', nameEn: 'Watches' }
  });
  const avail = await prisma.product.create({
    data: {
      slug: 'pubapi-w1',
      titleZh: '表 A',
      brand: 'Rolex',
      categoryId: cat.id,
      price: '10000.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  const draft = await prisma.product.create({
    data: {
      slug: 'pubapi-draft',
      titleZh: '草',
      brand: 'X',
      categoryId: cat.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'DRAFT',
      uploadedById: owner.id
    }
  });
  availId = avail.id;
  draftId = draft.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pubapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pubapi-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pubapi@x.com' } });
  await prisma.$disconnect();
});

function req(url: string) {
  return new Request(`http://localhost${url}`);
}

describe('GET /api/products', () => {
  it('不带参数返回 AVAILABLE 列表', async () => {
    const res = await GET(req('/api/products'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.find((p: { slug: string }) => p.slug === 'pubapi-w1')).toBeTruthy();
    expect(json.items.find((p: { slug: string }) => p.slug === 'pubapi-draft')).toBeFalsy();
  });

  it('支持 ?ids=a,b 模式（跳过过滤参数）', async () => {
    const res = await GET(req(`/api/products?ids=${availId},${draftId},no-such`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(availId);
  });

  it('ids 为空返回 []', async () => {
    const res = await GET(req(`/api/products?ids=`));
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it('支持 category slug 过滤', async () => {
    const res = await GET(req('/api/products?category=pubapi-cat-w'));
    const json = await res.json();
    expect(json.items.every((p: { slug: string }) => p.slug.startsWith('pubapi-'))).toBe(true);
  });

  it('非法 page 退化为 1', async () => {
    const res = await GET(req('/api/products?page=abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.page).toBe(1);
  });
});
