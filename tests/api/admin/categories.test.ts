import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET as listGet, POST as listPost } from '@/app/api/admin/categories/route';
import { PATCH as itemPatch, DELETE as itemDelete } from '@/app/api/admin/categories/[id]/route';
import { POST as reorderPost } from '@/app/api/admin/categories/reorder/route';

const prisma = new PrismaClient();

function jsonReq(url: string, method: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
}

beforeAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'test-cat-' } } });
});

afterAll(async () => {
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'test-cat-' } } });
  await prisma.$disconnect();
});

describe('/api/admin/categories', () => {
  let createdId = '';

  it('POST 创建分类', async () => {
    const res = await listPost(
      jsonReq('/api/admin/categories', 'POST', {
        slug: 'test-cat-watch',
        nameZh: '手表',
        nameEn: 'Watches',
        sortOrder: 1
      })
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { ok: boolean; category: { id: string; slug: string } };
    expect(json.category.slug).toBe('test-cat-watch');
    createdId = json.category.id;
  });

  it('GET 列表包含刚创建', async () => {
    const res = await listGet();
    const json = (await res.json()) as { ok: boolean; categories: Array<{ slug: string }> };
    expect(json.categories.some((c) => c.slug === 'test-cat-watch')).toBe(true);
  });

  it('PATCH 改名', async () => {
    const res = await itemPatch(
      jsonReq(`/api/admin/categories/${createdId}`, 'PATCH', { nameZh: '腕表' }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.category.findUnique({ where: { id: createdId } });
    expect(got?.nameZh).toBe('腕表');
  });

  it('POST 重复 slug 返回 409', async () => {
    const res = await listPost(
      jsonReq('/api/admin/categories', 'POST', {
        slug: 'test-cat-watch',
        nameZh: 'X',
        nameEn: 'X'
      })
    );
    expect(res.status).toBe(409);
  });

  it('reorder 批量改 sortOrder', async () => {
    const c2 = await prisma.category.create({
      data: { slug: 'test-cat-bag', nameZh: '包包', nameEn: 'Bags', sortOrder: 0 }
    });
    const res = await reorderPost(
      jsonReq('/api/admin/categories/reorder', 'POST', {
        items: [
          { id: createdId, sortOrder: 10 },
          { id: c2.id, sortOrder: 20 }
        ]
      })
    );
    expect(res.status).toBe(200);
    const w = await prisma.category.findUnique({ where: { id: createdId } });
    expect(w?.sortOrder).toBe(10);
  });

  it('DELETE 删除', async () => {
    const res = await itemDelete(jsonReq(`/api/admin/categories/${createdId}`, 'DELETE'), {
      params: Promise.resolve({ id: createdId })
    });
    expect(res.status).toBe(200);
    const got = await prisma.category.findUnique({ where: { id: createdId } });
    expect(got).toBeNull();
  });
});
