import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category, type Product } from '@prisma/client';
import { POST } from '@/app/api/inquiries/route';
import { hashPassword } from '@/lib/auth';
import { inquiryLimiter } from '@/lib/rate-limit';

const prisma = new PrismaClient();
let owner: AdminUser;
let cat: Category;
let availProduct: Product;
let draftProduct: Product;

beforeAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inqapi-' } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'inqapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'inqapi-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'inqapi@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'inqapi@x.com',
      name: 'inqapi',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  cat = await prisma.category.create({
    data: { slug: 'inqapi-cat', nameZh: '表', nameEn: 'W' }
  });
  availProduct = await prisma.product.create({
    data: {
      slug: 'inqapi-avail',
      titleZh: '在售',
      brand: 'X',
      categoryId: cat.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  draftProduct = await prisma.product.create({
    data: {
      slug: 'inqapi-draft',
      titleZh: '草稿',
      brand: 'X',
      categoryId: cat.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'DRAFT',
      uploadedById: owner.id
    }
  });
});

beforeEach(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inqapi-' } } });
  // 限流是进程内单例，确保每个 case 用独立 IP，必要时主动 reset
});

afterAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'inqapi-' } } });
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'inqapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'inqapi-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'inqapi@x.com' } });
  await prisma.$disconnect();
});

function req(body: unknown, ip: string): Request {
  return new Request('http://localhost/api/inquiries', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify(body)
  });
}

describe('POST /api/inquiries', () => {
  it('合法提交（带 productId）返回 200 + 写入 NEW', async () => {
    const ip = '10.0.0.1';
    inquiryLimiter.reset(ip);
    const res = await POST(
      req(
        {
          name: 'inqapi-A',
          contact: '13900000000',
          message: '请问还在吗',
          locale: 'zh',
          productId: availProduct.id
        },
        ip
      )
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const row = await prisma.inquiry.findFirst({ where: { name: 'inqapi-A' } });
    expect(row?.status).toBe('NEW');
    expect(row?.productId).toBe(availProduct.id);
    expect(row?.ipHash).toMatch(/^[a-f0-9]{16}$/);
  });

  it('合法提交（无 productId，站点级）返回 200', async () => {
    const ip = '10.0.0.2';
    inquiryLimiter.reset(ip);
    const res = await POST(
      req(
        { name: 'inqapi-B', contact: 'wx', message: '通用咨询', locale: 'en' },
        ip
      )
    );
    expect(res.status).toBe(200);
    const row = await prisma.inquiry.findFirst({ where: { name: 'inqapi-B' } });
    expect(row?.productId).toBeNull();
    expect(row?.locale).toBe('en');
  });

  it('字段缺失返回 400 INVALID_INPUT', async () => {
    const ip = '10.0.0.3';
    inquiryLimiter.reset(ip);
    const res = await POST(req({ name: '', contact: '', message: '', locale: 'zh' }, ip));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_INPUT');
  });

  it('message 超长返回 400', async () => {
    const ip = '10.0.0.4';
    inquiryLimiter.reset(ip);
    const res = await POST(
      req(
        {
          name: 'A',
          contact: 'B',
          message: 'x'.repeat(1001),
          locale: 'zh'
        },
        ip
      )
    );
    expect(res.status).toBe(400);
  });

  it('productId 指向非 AVAILABLE 商品返回 400', async () => {
    const ip = '10.0.0.5';
    inquiryLimiter.reset(ip);
    const res = await POST(
      req(
        {
          name: 'inqapi-D',
          contact: 'c',
          message: 'm',
          locale: 'zh',
          productId: draftProduct.id
        },
        ip
      )
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_INPUT');
  });

  it('productId 不存在返回 400', async () => {
    const ip = '10.0.0.6';
    inquiryLimiter.reset(ip);
    const res = await POST(
      req(
        {
          name: 'inqapi-E',
          contact: 'c',
          message: 'm',
          locale: 'zh',
          productId: 'cnotarealidxxxxxxxxxxx'
        },
        ip
      )
    );
    expect(res.status).toBe(400);
  });

  it('同 IP 5 分钟内第 4 次返回 429 RATE_LIMITED', async () => {
    const ip = '10.0.0.7';
    inquiryLimiter.reset(ip);
    const make = () =>
      POST(
        req(
          {
            name: 'inqapi-F',
            contact: 'c',
            message: 'm',
            locale: 'zh'
          },
          ip
        )
      );
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(200);
    expect((await make()).status).toBe(200);
    const res = await make();
    expect(res.status).toBe(429);
    const json = await res.json();
    expect(json.code).toBe('RATE_LIMITED');
  });
});
