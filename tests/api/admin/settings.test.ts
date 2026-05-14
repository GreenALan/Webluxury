import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PATCH } from '@/app/api/admin/settings/route';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.setting.deleteMany({
    where: {
      key: { in: ['contact_phone', 'contact_wechat_id', 'contact_wechat_qr_url', 'brand_options'] }
    }
  });
  await prisma.$disconnect();
});

function req(body: unknown): Request {
  return new Request('http://localhost/api/admin/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });
}

describe('/api/admin/settings', () => {
  it('PATCH 写入', async () => {
    const res = await PATCH(req({ contact_phone: '13900000000', contact_wechat_id: 'mywechat' }));
    expect(res.status).toBe(200);
  });

  it('GET 读回', async () => {
    const res = await GET();
    const json = (await res.json()) as { settings: Record<string, string> };
    expect(json.settings.contact_phone).toBe('13900000000');
    expect(json.settings.contact_wechat_id).toBe('mywechat');
  });

  it('PATCH 未知 key 被忽略', async () => {
    const res = await PATCH(req({ contact_phone: '13800000000', evil_key: 'nope' }));
    expect(res.status).toBe(200);
    const got = await prisma.setting.findUnique({ where: { key: 'evil_key' } });
    expect(got).toBeNull();
  });
});
