import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type Category, type AdminUser } from '@prisma/client';
import { POST as createProduct } from '@/app/api/admin/products/route';
import {
  PATCH as updateProduct,
  DELETE as deleteProduct
} from '@/app/api/admin/products/[id]/route';
import { PATCH as setStatus } from '@/app/api/admin/products/[id]/status/route';
import { hashPassword, signSession, SESSION_COOKIE } from '@/lib/auth';

const prisma = new PrismaClient();
let category: Category;
let owner: AdminUser;
let cookie = '';

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
  process.env.JWT_EXPIRES_IN = '1h';

  // Clean prior leftovers: delete products in the test category first,
  // then the category itself, then the test owner.
  const stale = await prisma.category.findFirst({ where: { slug: 'ptest-cat' } });
  if (stale) {
    await prisma.product.deleteMany({ where: { categoryId: stale.id } });
    await prisma.category.delete({ where: { id: stale.id } });
  }
  await prisma.adminUser.deleteMany({ where: { email: 'ptest-owner@x.com' } });
  category = await prisma.category.create({
    data: { slug: 'ptest-cat', nameZh: '手表', nameEn: 'Watches' }
  });
  owner = await prisma.adminUser.create({
    data: {
      email: 'ptest-owner@x.com',
      name: 'ptest',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  const token = await signSession({ userId: owner.id, role: 'OWNER' });
  cookie = `${SESSION_COOKIE}=${token}`;
});

afterAll(async () => {
  const cat = await prisma.category.findFirst({ where: { slug: 'ptest-cat' } });
  if (cat) {
    await prisma.product.deleteMany({ where: { categoryId: cat.id } });
    await prisma.category.delete({ where: { id: cat.id } });
  }
  await prisma.adminUser.deleteMany({ where: { email: 'ptest-owner@x.com' } });
  await prisma.$disconnect();
});

function reqWith(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('product crud', () => {
  let createdId = '';

  it('POST 创建商品', async () => {
    const res = await createProduct(
      reqWith('POST', '/api/admin/products', {
        titleZh: '劳力士黑水鬼',
        titleEn: 'Rolex Submariner',
        brand: 'Rolex',
        categoryId: category.id,
        price: '45000.00',
        condition: 'EXCELLENT',
        status: 'DRAFT',
        images: [{ key: 'abc.jpg', publicUrl: '/uploads/abc.jpg', kind: 'PHOTO' }]
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { product: { id: string; slug: string } };
    expect(json.product.slug).toMatch(/^lao-li-shi/);
    createdId = json.product.id;
  });

  it('POST 无 cookie 返回 401', async () => {
    const r = new Request('http://localhost/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleZh: 'x',
        brand: 'Rolex',
        categoryId: category.id,
        price: '1.00',
        condition: 'EXCELLENT',
        images: []
      })
    });
    const res = await createProduct(r);
    expect(res.status).toBe(401);
  });

  it('PATCH 编辑商品', async () => {
    const res = await updateProduct(
      reqWith('PATCH', `/api/admin/products/${createdId}`, { titleZh: '劳力士黑水鬼 16610' }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got?.titleZh).toBe('劳力士黑水鬼 16610');
  });

  it('PATCH /status 切换为 SOLD 设置 soldAt', async () => {
    const res = await setStatus(
      reqWith('PATCH', `/api/admin/products/${createdId}/status`, { status: 'SOLD' }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got?.status).toBe('SOLD');
    expect(got?.soldAt).not.toBeNull();
  });

  it('DELETE 删除商品（cascade 图片）', async () => {
    const res = await deleteProduct(
      reqWith('DELETE', `/api/admin/products/${createdId}`),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got).toBeNull();
    const imgs = await prisma.image.count({ where: { productId: createdId } });
    expect(imgs).toBe(0);
  });
});
