import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role, type AdminUser } from '@prisma/client';
import { GET as listGET } from '@/app/api/admin/inquiries/route';
import { PATCH as itemPATCH, DELETE as itemDELETE } from '@/app/api/admin/inquiries/[id]/route';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;

beforeAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'adm-inq-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'adm-inq@x.com' } });
  owner = await prisma.adminUser.create({
    data: {
      email: 'adm-inq@x.com',
      name: 'adm-inq',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
});

beforeEach(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'adm-inq-' } } });
});

afterAll(async () => {
  await prisma.inquiry.deleteMany({ where: { name: { startsWith: 'adm-inq-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'adm-inq@x.com' } });
  await prisma.$disconnect();
});

function makeInquiry(name: string, status: 'NEW' | 'READ' = 'NEW') {
  return prisma.inquiry.create({
    data: {
      name,
      contact: 'c',
      message: 'm',
      locale: 'zh',
      ipHash: 'x',
      status
    }
  });
}

describe('GET /api/admin/inquiries', () => {
  it('不带参数返回全部，按 createdAt desc', async () => {
    await makeInquiry('adm-inq-1');
    await new Promise((r) => setTimeout(r, 5));
    await makeInquiry('adm-inq-2');
    const res = await listGET(new Request('http://localhost/api/admin/inquiries'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    const subset = json.items.filter((i: { name: string }) =>
      i.name.startsWith('adm-inq-')
    );
    expect(subset[0].name).toBe('adm-inq-2');
  });

  it('按 status 过滤', async () => {
    await makeInquiry('adm-inq-N');
    await makeInquiry('adm-inq-R', 'READ');
    const res = await listGET(
      new Request('http://localhost/api/admin/inquiries?status=NEW')
    );
    const json = await res.json();
    const names = json.items
      .filter((i: { name: string }) => i.name.startsWith('adm-inq-'))
      .map((i: { name: string }) => i.name);
    expect(names).toContain('adm-inq-N');
    expect(names).not.toContain('adm-inq-R');
  });
});

describe('PATCH /api/admin/inquiries/[id]', () => {
  it('把 NEW 改成 READ 返回 200', async () => {
    const row = await makeInquiry('adm-inq-P');
    const res = await itemPATCH(
      new Request(`http://localhost/api/admin/inquiries/${row.id}`, { method: 'PATCH' }),
      { params: Promise.resolve({ id: row.id }) }
    );
    expect(res.status).toBe(200);
    const after = await prisma.inquiry.findUnique({ where: { id: row.id } });
    expect(after?.status).toBe('READ');
  });

  it('不存在返回 404', async () => {
    const res = await itemPATCH(
      new Request('http://localhost/api/admin/inquiries/nope', { method: 'PATCH' }),
      { params: Promise.resolve({ id: 'cnopenopenopenopenopenope' }) }
    );
    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/admin/inquiries/[id]', () => {
  it('删除并返回 200', async () => {
    const row = await makeInquiry('adm-inq-D');
    const res = await itemDELETE(
      new Request(`http://localhost/api/admin/inquiries/${row.id}`, { method: 'DELETE' }),
      { params: Promise.resolve({ id: row.id }) }
    );
    expect(res.status).toBe(200);
    expect(await prisma.inquiry.findUnique({ where: { id: row.id } })).toBeNull();
  });
});
