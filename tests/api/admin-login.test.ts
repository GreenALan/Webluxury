import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, verifySession, SESSION_COOKIE } from '@/lib/auth';
import { POST } from '@/app/api/admin/login/route';

// 这组集成测需要本地 PostgreSQL（M1 暂未启动 Docker）。
// 在 DB 可用前，可用 `pnpm test -- --reporter verbose` 看到 skip 详情。
// 当 Docker / TencentDB 就绪后，去掉 describe.skip 即可启用。

const prisma = new PrismaClient();
const HAS_DB = Boolean(process.env.DATABASE_URL_TEST_ENABLED);

describe.skipIf(!HAS_DB)('POST /api/admin/login (integration, needs DB)', () => {
  beforeAll(async () => {
    process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
    process.env.JWT_EXPIRES_IN = '1h';
    await prisma.adminUser.deleteMany({ where: { email: 'login-test@x.com' } });
    await prisma.adminUser.create({
      data: {
        email: 'login-test@x.com',
        name: 'Test',
        role: Role.ADMIN,
        passwordHash: await hashPassword('correct')
      }
    });
  });

  afterAll(async () => {
    await prisma.adminUser.deleteMany({ where: { email: 'login-test@x.com' } });
    await prisma.$disconnect();
  });

  function makeReq(body: unknown, ip = '1.2.3.4'): Request {
    return new Request('http://localhost/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-forwarded-for': ip },
      body: JSON.stringify(body)
    });
  }

  it('正确凭证返回 200 + 设置 session cookie', async () => {
    const res = await POST(makeReq({ email: 'login-test@x.com', password: 'correct' }));
    expect(res.status).toBe(200);
    const cookie = res.headers.get('set-cookie') ?? '';
    expect(cookie).toContain(SESSION_COOKIE);
    const tokenMatch = cookie.match(new RegExp(`${SESSION_COOKIE}=([^;]+)`));
    expect(tokenMatch).not.toBeNull();
    const session = await verifySession(tokenMatch![1]);
    expect(session?.role).toBe('ADMIN');
  });

  it('错误密码返回 401', async () => {
    const res = await POST(makeReq({ email: 'login-test@x.com', password: 'wrong' }, '2.2.2.2'));
    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.code).toBe('UNAUTHORIZED');
  });

  it('不存在的邮箱返回 401（不泄漏存在性）', async () => {
    const res = await POST(makeReq({ email: 'nope@x.com', password: 'whatever' }, '3.3.3.3'));
    expect(res.status).toBe(401);
  });

  it('字段缺失返回 400', async () => {
    const res = await POST(makeReq({ email: 'a@b.c' }, '4.4.4.4'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.code).toBe('INVALID_INPUT');
  });
});
