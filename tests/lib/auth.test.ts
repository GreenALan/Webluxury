import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, signSession, verifySession } from '@/lib/auth';

beforeEach(() => {
  process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
  process.env.JWT_EXPIRES_IN = '1h';
});

describe('password hash', () => {
  it('hash + verify 通过', async () => {
    const hash = await hashPassword('hello');
    expect(await verifyPassword('hello', hash)).toBe(true);
  });

  it('错误密码 verify 失败', async () => {
    const hash = await hashPassword('hello');
    expect(await verifyPassword('world', hash)).toBe(false);
  });

  it('每次 hash 不同（salt 随机）', async () => {
    const a = await hashPassword('hello');
    const b = await hashPassword('hello');
    expect(a).not.toBe(b);
  });
});

describe('JWT session', () => {
  it('sign + verify 取回 payload', async () => {
    const token = await signSession({ userId: 'u1', role: 'ADMIN' });
    const payload = await verifySession(token);
    expect(payload).not.toBeNull();
    expect(payload!.userId).toBe('u1');
    expect(payload!.role).toBe('ADMIN');
  });

  it('错误 token verify 返回 null', async () => {
    expect(await verifySession('not-a-token')).toBeNull();
  });

  it('被改动的 token verify 返回 null', async () => {
    const token = await signSession({ userId: 'u1', role: 'ADMIN' });
    const tampered = token.slice(0, -2) + 'xx';
    expect(await verifySession(tampered)).toBeNull();
  });
});
