import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category, type Product } from '@prisma/client';
import {
  createInquiry,
  listInquiriesAdmin,
  markInquiryRead,
  removeInquiry,
  hashIp
} from '@/lib/inquiries';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;
let cat: Category;
let product: Product;

beforeAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inq-t-' } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'inq-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'inq-t-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'inq-test@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'inq-test@x.com',
      name: 'inq-test',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  cat = await prisma.category.create({
    data: { slug: 'inq-t-watch', nameZh: '表', nameEn: 'W', sortOrder: 99 }
  });
  product = await prisma.product.create({
    data: {
      slug: 'inq-t-rolex',
      titleZh: '劳力士 inq-t',
      brand: 'Rolex',
      categoryId: cat.id,
      price: '10000.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
});

beforeEach(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inq-t-' } } });
});

afterAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inq-t-' } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'inq-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'inq-t-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'inq-test@x.com' } });
  await prisma.$disconnect();
});

describe('hashIp', () => {
  it('同一 IP 得到稳定 16 hex', () => {
    const a = hashIp('1.2.3.4');
    const b = hashIp('1.2.3.4');
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
  });
  it('不同 IP 得到不同 hash', () => {
    expect(hashIp('1.2.3.4')).not.toBe(hashIp('5.6.7.8'));
  });
  it('unknown 也能 hash', () => {
    expect(hashIp('unknown')).toMatch(/^[a-f0-9]{16}$/);
  });
});

describe('createInquiry', () => {
  it('能挂在商品上', async () => {
    const row = await createInquiry({
      name: 'inq-t-1',
      contact: '13800000000',
      message: '请问还在吗？',
      locale: 'zh',
      productId: product.id,
      ipHash: hashIp('9.9.9.9')
    });
    expect(row.id).toBeTruthy();
    expect(row.productId).toBe(product.id);
    expect(row.status).toBe('NEW');
  });

  it('productId 为空时存站点级询价', async () => {
    const row = await createInquiry({
      name: 'inq-t-2',
      contact: 'wx_abc',
      message: '通用咨询',
      locale: 'en',
      productId: null,
      ipHash: hashIp('1.1.1.1')
    });
    expect(row.productId).toBeNull();
  });
});

describe('listInquiriesAdmin', () => {
  it('按 createdAt desc 返回', async () => {
    await createInquiry({
      name: 'inq-t-a',
      contact: 'c',
      message: 'm1',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    await new Promise((r) => setTimeout(r, 10));
    await createInquiry({
      name: 'inq-t-b',
      contact: 'c',
      message: 'm2',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    const all = await listInquiriesAdmin({});
    const subset = all.items.filter((i) => i.name.startsWith('inq-t-'));
    expect(subset[0].name).toBe('inq-t-b');
    expect(subset[1].name).toBe('inq-t-a');
  });

  it('按 status 过滤', async () => {
    const a = await createInquiry({
      name: 'inq-t-new',
      contact: 'c',
      message: 'm',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    await prisma.inquiry.update({ where: { id: a.id }, data: { status: 'READ' } });
    await createInquiry({
      name: 'inq-t-unread',
      contact: 'c',
      message: 'm',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    const onlyNew = await listInquiriesAdmin({ status: 'NEW' });
    const names = onlyNew.items.filter((i) => i.name.startsWith('inq-t-')).map((i) => i.name);
    expect(names).toContain('inq-t-unread');
    expect(names).not.toContain('inq-t-new');
  });

  it('包含 product 关联（仅必要字段）', async () => {
    await createInquiry({
      name: 'inq-t-rel',
      contact: 'c',
      message: 'm',
      locale: 'zh',
      productId: product.id,
      ipHash: 'h'
    });
    const r = await listInquiriesAdmin({});
    const row = r.items.find((i) => i.name === 'inq-t-rel');
    expect(row?.product?.slug).toBe('inq-t-rolex');
    expect(row?.product?.titleZh).toBe('劳力士 inq-t');
  });
});

describe('markInquiryRead / removeInquiry', () => {
  it('markInquiryRead 把 NEW 变成 READ', async () => {
    const row = await createInquiry({
      name: 'inq-t-mr',
      contact: 'c',
      message: 'm',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    const updated = await markInquiryRead(row.id);
    expect(updated.status).toBe('READ');
  });

  it('removeInquiry 物理删除', async () => {
    const row = await createInquiry({
      name: 'inq-t-rm',
      contact: 'c',
      message: 'm',
      locale: 'zh',
      productId: null,
      ipHash: 'h'
    });
    await removeInquiry(row.id);
    const found = await prisma.inquiry.findUnique({ where: { id: row.id } });
    expect(found).toBeNull();
  });
});
