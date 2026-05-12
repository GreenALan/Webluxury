import { describe, it, expect, beforeEach } from 'vitest';
import { RateLimiter } from '@/lib/rate-limit';

describe('RateLimiter', () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter({ windowMs: 1000, max: 3 });
  });

  it('允许窗口内 max 次请求', () => {
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
    expect(limiter.check('a')).toBe(true);
  });

  it('超过 max 后拒绝', () => {
    limiter.check('a');
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a')).toBe(false);
  });

  it('不同 key 互不干扰', () => {
    limiter.check('a');
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('b')).toBe(true);
  });

  it('窗口过期后重置', async () => {
    limiter.check('a');
    limiter.check('a');
    limiter.check('a');
    expect(limiter.check('a')).toBe(false);
    await new Promise((r) => setTimeout(r, 1100));
    expect(limiter.check('a')).toBe(true);
  });
});
