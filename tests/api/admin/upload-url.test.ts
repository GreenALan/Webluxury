import { describe, it, expect, beforeAll } from 'vitest';
import { POST } from '@/app/api/admin/upload-url/route';

beforeAll(() => {
  process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/upload-url', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('POST /api/admin/upload-url', () => {
  it('count=3 返回 3 个 {url, key}', async () => {
    const res = await POST(req({ count: 3, contentType: 'image/jpeg' }));
    expect(res.status).toBe(200);
    const json = (await res.json()) as { items: Array<{ url: string; key: string }> };
    expect(json.items).toHaveLength(3);
    for (const it of json.items) {
      expect(it.key).toMatch(/^[a-z0-9]+\.jpg$/);
      expect(it.url).toContain(`/api/admin/upload-local?key=${it.key}`);
    }
  });

  it('count=20 超过 15 上限返回 400', async () => {
    const res = await POST(req({ count: 20, contentType: 'image/jpeg' }));
    expect(res.status).toBe(400);
  });

  it('未知 contentType 返回 400', async () => {
    const res = await POST(req({ count: 1, contentType: 'application/x-evil' }));
    expect(res.status).toBe(400);
  });

  it('count<1 返回 400', async () => {
    const res = await POST(req({ count: 0, contentType: 'image/jpeg' }));
    expect(res.status).toBe(400);
  });
});
