import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, POST } from '@/app/api/admin/users/route';
import { PATCH } from '@/app/api/admin/users/[id]/route';

const prisma = new PrismaClient();

beforeAll(async () => {
  process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
  await prisma.adminUser.deleteMany({ where: { email: { contains: 'usertest-' } } });
});

afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: { contains: 'usertest-' } } });
  await prisma.$disconnect();
});

function jsonReq(method: string, body?: unknown): Request {
  return new Request('http://localhost/api/admin/users', {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('/api/admin/users', () => {
  let createdId = '';
  it('POST 邀请新管理员，返回临时密码', async () => {
    const res = await POST(jsonReq('POST', { email: 'usertest-a@x.com', name: 'A' }));
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; user: { id: string }; tempPassword: string };
    expect(json.user.id).toBeDefined();
    expect(json.tempPassword).toHaveLength(12);
    createdId = json.user.id;
  });

  it('GET 列表包含刚创建', async () => {
    const res = await GET();
    const json = (await res.json()) as { users: Array<{ email: string }> };
    expect(json.users.some((u) => u.email === 'usertest-a@x.com')).toBe(true);
  });

  it('PATCH 改名', async () => {
    const res = await PATCH(
      new Request(`http://localhost/api/admin/users/${createdId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Alice' })
      }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.adminUser.findUnique({ where: { id: createdId } });
    expect(got?.name).toBe('Alice');
  });

  it('POST 重复 email 返回 409', async () => {
    const res = await POST(jsonReq('POST', { email: 'usertest-a@x.com', name: 'A2' }));
    expect(res.status).toBe(409);
  });
});
