type Bucket = { count: number; resetAt: number };

export class RateLimiter {
  private buckets = new Map<string, Bucket>();
  constructor(private opts: { windowMs: number; max: number }) {}

  check(key: string): boolean {
    const now = Date.now();
    const b = this.buckets.get(key);
    if (!b || b.resetAt <= now) {
      this.buckets.set(key, { count: 1, resetAt: now + this.opts.windowMs });
      this.gc(now);
      return true;
    }
    if (b.count >= this.opts.max) return false;
    b.count += 1;
    return true;
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  private gc(now: number): void {
    if (this.buckets.size < 1000) return;
    for (const [k, v] of this.buckets) if (v.resetAt <= now) this.buckets.delete(k);
  }
}

export const inquiryLimiter = new RateLimiter({ windowMs: 5 * 60_000, max: 3 });
export const loginLimiter = new RateLimiter({ windowMs: 15 * 60_000, max: 5 });
