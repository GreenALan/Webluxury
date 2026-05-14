import { describe, it, expect } from 'vitest';
import { toSlug, ensureUniqueSlug } from '@/lib/slug';

describe('toSlug', () => {
  it('英文转 kebab-case', () => {
    expect(toSlug('Hello World')).toBe('hello-world');
  });

  it('中文转拼音', () => {
    expect(toSlug('手表')).toBe('shou-biao');
  });

  it('中英混合', () => {
    expect(toSlug('Rolex 手表 Vintage')).toBe('rolex-shou-biao-vintage');
  });

  it('特殊字符剥离', () => {
    expect(toSlug('Hello, World!@#')).toBe('hello-world');
  });

  it('空字符串 fallback', () => {
    expect(toSlug('')).toBe('item');
    expect(toSlug('!!!')).toBe('item');
  });

  it('过长截断', () => {
    expect(toSlug('a'.repeat(100)).length).toBeLessThanOrEqual(60);
  });
});

describe('ensureUniqueSlug', () => {
  it('未占用直接返回', async () => {
    const result = await ensureUniqueSlug('watch', async () => null);
    expect(result).toBe('watch');
  });

  it('已占用追加 -2', async () => {
    let calls = 0;
    const result = await ensureUniqueSlug('watch', async (s) => {
      calls += 1;
      return s === 'watch' ? { id: 'x' } : null;
    });
    expect(result).toBe('watch-2');
    expect(calls).toBe(2);
  });

  it('多次冲突递增', async () => {
    const result = await ensureUniqueSlug('watch', async (s) => {
      if (s === 'watch' || s === 'watch-2' || s === 'watch-3') return { id: 'x' };
      return null;
    });
    expect(result).toBe('watch-4');
  });
});
