# M2 商品 + 后台 CRUD 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 M1 基础上落地后台完整 CRUD —— 商品/分类/图片/Settings/Users 管理，含 ImageUploader、ProductForm、分页/搜索/筛选的列表页与编辑页。M2 完成后店主可登录后台创建分类、上传商品（带图片）、配置全站联系方式、邀请助手账号。

**Architecture:** 所有后台页面位于 `/admin/**`，所有后台 API 位于 `/api/admin/**`，均由 M1 的 middleware 校验 JWT。**图片存储 M2 用本地磁盘**（`public/uploads/`，M4 部署时换为腾讯云 COS，前端代码不变）。商品创建流程：前端选图 → 请求 `/api/admin/upload-url` 拿一批 key+URL → 浏览器 PUT 到 URL → 收集 key 提交 `/api/admin/products`。

**Tech Stack:** 沿用 M1（Next.js 14 + Prisma + Zod + Vitest + Playwright）。新增：`@paralleldrive/cuid2`（已通过 Prisma 内部 cuid 满足）、`pinyin-pro`（slug 生成）。

参考设计文档：`docs/superpowers/specs/2026-05-08-secondhand-luxury-site-design.md` §3 数据模型、§5 页面与组件。

---

## 前置假设

- 工作目录：`/Users/bytedance/Private/Web`
- 当前分支：`m1-foundation`（M2 在此分支续写）
- M1 已完成：scaffold、Tailwind、next/font、ESLint、Prettier、env、docker-compose、Prisma schema + 首次迁移、Prisma client 单例、pino、Vitest、rate-limit、auth utils（含 SESSION_COOKIE）、seed、Zod、next-intl、middleware（i18n + 鉴权 + 安全头）、[locale] 路由、Header/Footer/MobileBottomBar/LanguageSwitch、登录 API、登录页、AdminLayout（基础版）、仪表盘占位、登出 API、Playwright + E2E（3 spec × 2 project = 6 通过）
- 本地 PG 已起（`docker compose up -d`）
- 测试 DB 默认期望可用（M1 留的 `DATABASE_URL_TEST_ENABLED` 门控 M2 移除——见 Task 19）

---

## 目录结构（M2 完成后新增的部分）

```
.gitignore                                 # MODIFY: 加 public/uploads/
public/
  uploads/                                 # 本地上传产物（gitignored）
src/
  app/
    admin/
      page.tsx                             # MODIFY: 仪表盘加 stats
      categories/page.tsx                  # NEW
      settings/page.tsx                    # NEW
      users/page.tsx                       # NEW
      products/
        page.tsx                           # NEW: 列表
        new/page.tsx                       # NEW: 创建
        [id]/edit/page.tsx                 # NEW: 编辑
    api/admin/
      upload-url/route.ts                  # NEW
      upload-local/route.ts                # NEW（M2 only）
      categories/
        route.ts                           # NEW: GET list + POST create
        [id]/route.ts                      # NEW: PATCH + DELETE
        reorder/route.ts                   # NEW: POST 批量改 sortOrder
      settings/route.ts                    # NEW: GET + PATCH（bulk）
      users/
        route.ts                           # NEW: GET list + POST invite
        [id]/route.ts                      # NEW: PATCH 改名
      products/
        route.ts                           # NEW: GET list + POST create
        [id]/
          route.ts                         # NEW: GET + PATCH + DELETE
          status/route.ts                  # NEW: PATCH 状态切换
  components/admin/
    ImageUploader.tsx                      # NEW: 拖拽 + 预览 + 进度 + 重排
    ProductForm.tsx                        # NEW: 双语 + 图片 + 全字段
    CategoryForm.tsx                       # NEW: 分类创建/编辑
    Pagination.tsx                         # NEW
    StatusBadge.tsx                        # NEW
    ConfirmDialog.tsx                      # NEW
  lib/
    products.ts                            # NEW: query helpers
    settings.ts                            # NEW: KV helpers
    slug.ts                                # NEW: 中文转拼音 slug
tests/
  lib/
    slug.test.ts                           # NEW
  api/admin/
    upload-url.test.ts                     # NEW
    categories.test.ts                     # NEW
    settings.test.ts                       # NEW
    users.test.ts                          # NEW
    products.test.ts                       # NEW
  e2e/
    admin-categories.spec.ts               # NEW
    admin-products.spec.ts                 # NEW
```

---

## Task 1: 本地图片上传基础设施

**Files:**

- Create: `src/app/api/admin/upload-url/route.ts`, `src/app/api/admin/upload-local/route.ts`
- Modify: `.gitignore` (加 `public/uploads/`)
- Test: `tests/api/admin/upload-url.test.ts`

- [ ] **Step 1: 编辑 `.gitignore` 排除 uploads**

在 `.gitignore` 末尾追加：

```
# user uploads (local dev only; M4 switches to COS)
/public/uploads/
```

- [ ] **Step 2: 写失败测试**

`tests/api/admin/upload-url.test.ts`:

```ts
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
```

- [ ] **Step 3: 跑测试，应失败（模块未定义）**

```bash
pnpm test tests/api/admin/upload-url.test.ts
```

- [ ] **Step 4: 实现 upload-url API**

`src/app/api/admin/upload-url/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as crypto from 'node:crypto';

export const runtime = 'nodejs';

const EXT_MAP: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp'
};

const Body = z.object({
  count: z.number().int().min(1).max(15),
  contentType: z.enum(['image/jpeg', 'image/png', 'image/webp'])
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const ext = EXT_MAP[parsed.contentType];
  const items = Array.from({ length: parsed.count }, () => {
    const key = `${crypto.randomBytes(12).toString('hex')}.${ext}`;
    return { key, url: `/api/admin/upload-local?key=${key}` };
  });
  return NextResponse.json({ ok: true, items });
}
```

- [ ] **Step 5: 实现 upload-local PUT 处理**

`src/app/api/admin/upload-local/route.ts`:

```ts
import { NextResponse } from 'next/server';
import * as fs from 'node:fs/promises';
import * as path from 'node:path';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');
const MAX_BYTES = 5 * 1024 * 1024; // 5MB per image
const KEY_RE = /^[a-f0-9]{24}\.(jpg|png|webp)$/;

export async function PUT(req: Request) {
  const url = new URL(req.url);
  const key = url.searchParams.get('key') ?? '';
  if (!KEY_RE.test(key)) {
    return NextResponse.json({ ok: false, code: 'INVALID_KEY' }, { status: 400 });
  }
  const buf = Buffer.from(await req.arrayBuffer());
  if (buf.byteLength > MAX_BYTES) {
    return NextResponse.json({ ok: false, code: 'TOO_LARGE' }, { status: 413 });
  }
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
  await fs.writeFile(path.join(UPLOAD_DIR, key), buf);
  return NextResponse.json({ ok: true, publicUrl: `/uploads/${key}` });
}
```

- [ ] **Step 6: 跑测试，应通过**

```bash
pnpm test tests/api/admin/upload-url.test.ts
```

Expected: 4 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): add local image upload (upload-url + upload-local)"
```

---

## Task 2: ImageUploader 组件

**Files:**

- Create: `src/components/admin/ImageUploader.tsx`

- [ ] **Step 1: 实现组件**

`src/components/admin/ImageUploader.tsx`:

```tsx
'use client';
import { useState, useRef, type ChangeEvent } from 'react';

export type UploadedImage = {
  key: string;
  publicUrl: string;
  kind: 'PHOTO' | 'CERT';
};

type Props = {
  value: UploadedImage[];
  onChange: (next: UploadedImage[]) => void;
  kind: 'PHOTO' | 'CERT';
  max?: number;
};

type Pending = { id: string; progress: number; error?: string };

const MIME_TO_TYPE: Record<string, 'image/jpeg' | 'image/png' | 'image/webp'> = {
  'image/jpeg': 'image/jpeg',
  'image/jpg': 'image/jpeg',
  'image/png': 'image/png',
  'image/webp': 'image/webp'
};

export function ImageUploader({ value, onChange, kind, max = 15 }: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, setPending] = useState<Pending[]>([]);

  async function onPick(e: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;
    const remaining = max - value.length;
    if (files.length > remaining) {
      alert(`最多 ${max} 张，已超出 ${files.length - remaining} 张`);
      return;
    }
    const groups: Record<'image/jpeg' | 'image/png' | 'image/webp', File[]> = {
      'image/jpeg': [],
      'image/png': [],
      'image/webp': []
    };
    for (const f of files) {
      const t = MIME_TO_TYPE[f.type];
      if (!t) {
        alert(`不支持的文件类型: ${f.name}`);
        return;
      }
      groups[t].push(f);
    }

    const pendingItems: Pending[] = files.map((f) => ({ id: `${Date.now()}-${f.name}`, progress: 0 }));
    setPending((p) => [...p, ...pendingItems]);

    const uploaded: UploadedImage[] = [];
    for (const ct of Object.keys(groups) as Array<keyof typeof groups>) {
      const list = groups[ct];
      if (list.length === 0) continue;
      const res = await fetch('/api/admin/upload-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count: list.length, contentType: ct })
      });
      const json = (await res.json()) as { ok: boolean; items?: Array<{ key: string; url: string }> };
      if (!res.ok || !json.items) {
        alert('获取上传地址失败');
        return;
      }
      for (let i = 0; i < list.length; i++) {
        const file = list[i];
        const slot = json.items[i];
        const put = await fetch(slot.url, { method: 'PUT', headers: { 'Content-Type': ct }, body: file });
        const putJson = (await put.json()) as { ok: boolean; publicUrl?: string };
        if (!put.ok || !putJson.publicUrl) {
          alert(`上传 ${file.name} 失败`);
          continue;
        }
        uploaded.push({ key: slot.key, publicUrl: putJson.publicUrl, kind });
      }
    }

    onChange([...value, ...uploaded]);
    setPending([]);
  }

  function remove(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  function move(idx: number, dir: -1 | 1) {
    const next = [...value];
    const target = idx + dir;
    if (target < 0 || target >= next.length) return;
    [next[idx], next[target]] = [next[target], next[idx]];
    onChange(next);
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 md:grid-cols-5 gap-2">
        {value.map((img, i) => (
          <div key={img.key} className="relative border border-line aspect-square overflow-hidden group">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={img.publicUrl} alt="" className="w-full h-full object-cover" />
            <div className="absolute inset-x-0 bottom-0 bg-ink/70 text-bone text-xs flex justify-between px-1 opacity-0 group-hover:opacity-100 transition">
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0}>
                ←
              </button>
              <button type="button" onClick={() => remove(i)}>
                ✕
              </button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === value.length - 1}>
                →
              </button>
            </div>
          </div>
        ))}
        {pending.map((p) => (
          <div
            key={p.id}
            className="border border-dashed border-line aspect-square flex items-center justify-center text-xs text-ink-soft"
          >
            上传中…
          </div>
        ))}
      </div>
      <div>
        <input
          ref={fileRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          onChange={onPick}
          className="hidden"
        />
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={value.length >= max}
          className="px-4 py-2 border border-line text-sm disabled:opacity-50"
        >
          + 添加图片（剩余 {max - value.length}）
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/ImageUploader.tsx
git commit -m "feat(admin): add ImageUploader component"
```

---

## Task 3: Slug 工具（中文转拼音）

**Files:**

- Create: `src/lib/slug.ts`, `tests/lib/slug.test.ts`
- Modify: `package.json`（添加 `pinyin-pro`）

- [ ] **Step 1: 安装依赖**

```bash
unset HTTP_PROXY HTTPS_PROXY http_proxy https_proxy ALL_PROXY all_proxy
pnpm add pinyin-pro
```

- [ ] **Step 2: 写测试**

`tests/lib/slug.test.ts`:

```ts
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
```

- [ ] **Step 3: 跑失败测试**

```bash
pnpm test tests/lib/slug.test.ts
```

- [ ] **Step 4: 实现**

`src/lib/slug.ts`:

```ts
import { pinyin } from 'pinyin-pro';

const MAX_LEN = 60;

export function toSlug(input: string): string {
  if (!input) return 'item';
  const pinyinized = pinyin(input, { toneType: 'none', separator: ' ', nonZh: 'consecutive' });
  const slug = pinyinized
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, MAX_LEN)
    .replace(/^-|-$/g, '');
  return slug || 'item';
}

export async function ensureUniqueSlug(
  base: string,
  existsCheck: (slug: string) => Promise<{ id: string } | null>
): Promise<string> {
  let candidate = base;
  let n = 1;
  while (await existsCheck(candidate)) {
    n += 1;
    candidate = `${base}-${n}`;
  }
  return candidate;
}
```

- [ ] **Step 5: 跑测试通过**

```bash
pnpm test tests/lib/slug.test.ts
```

Expected: 9 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add slug generator (chinese → pinyin)"
```

---

## Task 4: 分类 CRUD API

**Files:**

- Create: `src/app/api/admin/categories/route.ts`, `src/app/api/admin/categories/[id]/route.ts`, `src/app/api/admin/categories/reorder/route.ts`
- Test: `tests/api/admin/categories.test.ts`

- [ ] **Step 1: 写集成测试**

`tests/api/admin/categories.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
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
    const res = await itemPatch(jsonReq(`/api/admin/categories/${createdId}`, 'PATCH', { nameZh: '腕表' }), {
      params: Promise.resolve({ id: createdId })
    });
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
```

- [ ] **Step 2: 跑失败测试**

```bash
pnpm test tests/api/admin/categories.test.ts
```

- [ ] **Step 3: 实现 list + create**

`src/app/api/admin/categories/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const CreateBody = z.object({
  slug: z
    .string()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9-]+$/),
  nameZh: z.string().min(1).max(60),
  nameEn: z.string().min(1).max(60),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).default(0)
});

export async function GET() {
  const categories = await prisma.category.findMany({
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }]
  });
  return NextResponse.json({ ok: true, categories });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = CreateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  try {
    const category = await prisma.category.create({ data: parsed });
    return NextResponse.json({ ok: true, category }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: false, code: 'DUPLICATE_SLUG' }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: 实现 update + delete**

`src/app/api/admin/categories/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const UpdateBody = z.object({
  nameZh: z.string().min(1).max(60).optional(),
  nameEn: z.string().min(1).max(60).optional(),
  icon: z.string().max(60).optional(),
  sortOrder: z.number().int().min(0).max(9999).optional()
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = UpdateBody.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  try {
    const category = await prisma.category.update({ where: { id }, data: parsed });
    return NextResponse.json({ ok: true, category });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const used = await prisma.product.count({ where: { categoryId: id } });
  if (used > 0) {
    return NextResponse.json(
      { ok: false, code: 'IN_USE', message: `${used} 个商品仍属于此分类` },
      { status: 409 }
    );
  }
  try {
    await prisma.category.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 5: 实现 reorder**

`src/app/api/admin/categories/reorder/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  items: z
    .array(z.object({ id: z.string().min(1), sortOrder: z.number().int().min(0).max(9999) }))
    .max(200)
});

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  await prisma.$transaction(
    parsed.items.map((it) =>
      prisma.category.update({ where: { id: it.id }, data: { sortOrder: it.sortOrder } })
    )
  );
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 6: 跑测试通过**

```bash
pnpm test tests/api/admin/categories.test.ts
```

Expected: 6 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(admin): add categories CRUD api"
```

---

## Task 5: 分类后台页面

**Files:**

- Create: `src/components/admin/CategoryForm.tsx`, `src/app/admin/categories/page.tsx`

- [ ] **Step 1: 实现 CategoryForm**

`src/components/admin/CategoryForm.tsx`:

```tsx
'use client';
import { useState, type FormEvent } from 'react';

export type CategoryFormValue = {
  slug: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
};

type Props = {
  initial?: Partial<CategoryFormValue>;
  onSubmit: (v: CategoryFormValue) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
};

export function CategoryForm({ initial, onSubmit, submitLabel = '保存' }: Props) {
  const [v, setV] = useState<CategoryFormValue>({
    slug: initial?.slug ?? '',
    nameZh: initial?.nameZh ?? '',
    nameEn: initial?.nameEn ?? '',
    icon: initial?.icon ?? '',
    sortOrder: initial?.sortOrder ?? 0
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await onSubmit(v);
    if (!r.ok) setError(r.message ?? '保存失败');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">Slug (URL)</span>
          <input
            required
            pattern="[a-z0-9-]+"
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">排序</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={v.sortOrder}
            onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">中文名</span>
          <input
            required
            value={v.nameZh}
            onChange={(e) => setV({ ...v, nameZh: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">英文名</span>
          <input
            required
            value={v.nameEn}
            onChange={(e) => setV({ ...v, nameEn: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">图标（emoji，可空）</span>
        <input
          value={v.icon}
          onChange={(e) => setV({ ...v, icon: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider disabled:opacity-50"
      >
        {busy ? '保存中…' : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: 实现分类后台页面**

`src/app/admin/categories/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { CategoryForm, type CategoryFormValue } from '@/components/admin/CategoryForm';

type Category = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  icon: string | null;
  sortOrder: number;
};

export default function AdminCategoriesPage() {
  const [list, setList] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/categories');
    const json = (await res.json()) as { categories: Category[] };
    setList(json.categories);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(v: CategoryFormValue) {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v)
    });
    const json = (await res.json()) as { ok: boolean; code?: string };
    if (json.ok) {
      setCreating(false);
      await load();
      return { ok: true };
    }
    return { ok: false, message: json.code === 'DUPLICATE_SLUG' ? 'Slug 已被使用' : '保存失败' };
  }

  async function update(id: string, v: CategoryFormValue) {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nameZh: v.nameZh,
        nameEn: v.nameEn,
        icon: v.icon,
        sortOrder: v.sortOrder
      })
    });
    const json = (await res.json()) as { ok: boolean };
    if (json.ok) {
      setEditing(null);
      await load();
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  async function remove(id: string) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const json = (await res.json()) as { ok: boolean; message?: string };
    if (!json.ok) {
      alert(json.message ?? '删除失败');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">分类</h1>
        {!creating && !editing && (
          <button onClick={() => setCreating(true)} className="px-4 py-2 border border-line text-sm">
            + 新建分类
          </button>
        )}
      </div>

      {creating && (
        <div className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">新建分类</h2>
          <CategoryForm onSubmit={create} submitLabel="创建" />
          <button onClick={() => setCreating(false)} className="text-xs text-ink-soft hover:text-ink">
            取消
          </button>
        </div>
      )}

      {editing && (
        <div className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">编辑：{editing.slug}</h2>
          <CategoryForm
            initial={{
              slug: editing.slug,
              nameZh: editing.nameZh,
              nameEn: editing.nameEn,
              icon: editing.icon ?? '',
              sortOrder: editing.sortOrder
            }}
            onSubmit={(v) => update(editing.id, v)}
          />
          <button onClick={() => setEditing(null)} className="text-xs text-ink-soft hover:text-ink">
            取消
          </button>
        </div>
      )}

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2">排序</th>
            <th className="text-left p-2">Slug</th>
            <th className="text-left p-2">中文名</th>
            <th className="text-left p-2">英文名</th>
            <th className="text-right p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <td className="p-2">{c.sortOrder}</td>
              <td className="p-2 font-mono text-xs">{c.slug}</td>
              <td className="p-2">{c.nameZh}</td>
              <td className="p-2">{c.nameEn}</td>
              <td className="p-2 text-right space-x-3 text-xs">
                <button onClick={() => setEditing(c)} className="hover:text-accent">
                  编辑
                </button>
                <button onClick={() => remove(c.id)} className="text-red-600 hover:text-red-800">
                  删除
                </button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-ink-soft text-sm">
                暂无分类
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 3: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(admin): add categories admin page"
```

---

## Task 6: Settings KV API + helpers

**Files:**

- Create: `src/lib/settings.ts`, `src/app/api/admin/settings/route.ts`
- Test: `tests/api/admin/settings.test.ts`

- [ ] **Step 1: 实现 settings helpers**

`src/lib/settings.ts`:

```ts
import { prisma } from './prisma';

export const SETTING_KEYS = [
  'contact_phone',
  'contact_wechat_id',
  'contact_wechat_qr_url',
  'brand_options'
] as const;
export type SettingKey = (typeof SETTING_KEYS)[number];

export async function getAllSettings(): Promise<Record<SettingKey, string>> {
  const rows = await prisma.setting.findMany({ where: { key: { in: [...SETTING_KEYS] } } });
  const out = Object.fromEntries(SETTING_KEYS.map((k) => [k, ''])) as Record<SettingKey, string>;
  for (const r of rows) {
    if ((SETTING_KEYS as readonly string[]).includes(r.key)) {
      out[r.key as SettingKey] = r.value;
    }
  }
  return out;
}

export async function bulkUpdate(patch: Partial<Record<SettingKey, string>>): Promise<void> {
  const entries = Object.entries(patch).filter(([k]) =>
    (SETTING_KEYS as readonly string[]).includes(k)
  );
  await prisma.$transaction(
    entries.map(([key, value]) =>
      prisma.setting.upsert({
        where: { key },
        create: { key, value: value ?? '' },
        update: { value: value ?? '' }
      })
    )
  );
}
```

- [ ] **Step 2: 写 API 测试**

`tests/api/admin/settings.test.ts`:

```ts
import { describe, it, expect, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { GET, PATCH } from '@/app/api/admin/settings/route';

const prisma = new PrismaClient();

afterAll(async () => {
  await prisma.setting.deleteMany({
    where: { key: { in: ['contact_phone', 'contact_wechat_id', 'contact_wechat_qr_url', 'brand_options'] } }
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
```

- [ ] **Step 3: 跑失败测试**

```bash
pnpm test tests/api/admin/settings.test.ts
```

- [ ] **Step 4: 实现 API**

`src/app/api/admin/settings/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getAllSettings, bulkUpdate, SETTING_KEYS } from '@/lib/settings';

export const runtime = 'nodejs';

const Body = z
  .object(Object.fromEntries(SETTING_KEYS.map((k) => [k, z.string().max(2000).optional()])))
  .partial();
// 默认 Zod 行为：未知 key 被剥离，不报错。配合 bulkUpdate 内部白名单过滤双重保险。

export async function GET() {
  const settings = await getAllSettings();
  return NextResponse.json({ ok: true, settings });
}

export async function PATCH(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  await bulkUpdate(parsed);
  return NextResponse.json({ ok: true });
}
```

- [ ] **Step 5: 跑测试通过**

```bash
pnpm test tests/api/admin/settings.test.ts
```

Expected: 3 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): add settings KV api + helpers"
```

---

## Task 7: Settings 后台页面

**Files:**

- Create: `src/app/admin/settings/page.tsx`

- [ ] **Step 1: 实现页面**

`src/app/admin/settings/page.tsx`:

```tsx
'use client';
import { useEffect, useState, type FormEvent } from 'react';
import { ImageUploader, type UploadedImage } from '@/components/admin/ImageUploader';

type Settings = {
  contact_phone: string;
  contact_wechat_id: string;
  contact_wechat_qr_url: string;
  brand_options: string;
};

export default function AdminSettingsPage() {
  const [v, setV] = useState<Settings>({
    contact_phone: '',
    contact_wechat_id: '',
    contact_wechat_qr_url: '',
    brand_options: ''
  });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/settings');
    const json = (await res.json()) as { settings: Settings };
    setV(json.settings);
  }
  useEffect(() => {
    load();
  }, []);

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await fetch('/api/admin/settings', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v)
    });
    setBusy(false);
    setMsg(res.ok ? '已保存' : '保存失败');
  }

  const qrImages: UploadedImage[] = v.contact_wechat_qr_url
    ? [{ key: 'qr', publicUrl: v.contact_wechat_qr_url, kind: 'PHOTO' }]
    : [];

  return (
    <form onSubmit={save} className="space-y-6 max-w-2xl">
      <h1 className="font-serif text-3xl">全站设置</h1>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">联系电话</span>
        <input
          value={v.contact_phone}
          onChange={(e) => setV({ ...v, contact_phone: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">微信号</span>
        <input
          value={v.contact_wechat_id}
          onChange={(e) => setV({ ...v, contact_wechat_id: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">微信二维码</span>
        <div className="mt-2">
          <ImageUploader
            value={qrImages}
            onChange={(next) =>
              setV({ ...v, contact_wechat_qr_url: next[0]?.publicUrl ?? '' })
            }
            kind="PHOTO"
            max={1}
          />
        </div>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">品牌候选词（每行一个）</span>
        <textarea
          rows={6}
          value={v.brand_options}
          onChange={(e) => setV({ ...v, brand_options: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
          placeholder={'Rolex\nHermès\nChanel'}
        />
      </label>

      <div className="flex items-center gap-4">
        <button
          type="submit"
          disabled={busy}
          className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider disabled:opacity-50"
        >
          {busy ? '保存中…' : '保存'}
        </button>
        {msg && <span className="text-sm text-ink-soft">{msg}</span>}
      </div>
    </form>
  );
}
```

- [ ] **Step 2: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add settings admin page"
```

---

## Task 8: Users CRUD API（邀请新管理员）

**Files:**

- Create: `src/app/api/admin/users/route.ts`, `src/app/api/admin/users/[id]/route.ts`
- Test: `tests/api/admin/users.test.ts`

- [ ] **Step 1: 写测试**

`tests/api/admin/users.test.ts`:

```ts
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
```

- [ ] **Step 2: 跑失败**

```bash
pnpm test tests/api/admin/users.test.ts
```

- [ ] **Step 3: 实现 list + invite**

`src/app/api/admin/users/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import * as crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().toLowerCase(),
  name: z.string().min(1).max(60)
});

export async function GET() {
  const users = await prisma.adminUser.findMany({
    select: { id: true, email: true, name: true, role: true, createdAt: true },
    orderBy: { createdAt: 'asc' }
  });
  return NextResponse.json({ ok: true, users });
}

export async function POST(req: Request) {
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const tempPassword = crypto.randomBytes(9).toString('base64url');
  try {
    const user = await prisma.adminUser.create({
      data: {
        email: parsed.email,
        name: parsed.name,
        role: 'ADMIN',
        passwordHash: await hashPassword(tempPassword)
      },
      select: { id: true, email: true, name: true, role: true, createdAt: true }
    });
    return NextResponse.json({ ok: true, user, tempPassword }, { status: 201 });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return NextResponse.json({ ok: false, code: 'DUPLICATE_EMAIL' }, { status: 409 });
    }
    throw e;
  }
}
```

- [ ] **Step 4: 实现 update**

`src/app/api/admin/users/[id]/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  name: z.string().min(1).max(60).optional()
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  try {
    const user = await prisma.adminUser.update({
      where: { id },
      data: parsed,
      select: { id: true, email: true, name: true, role: true }
    });
    return NextResponse.json({ ok: true, user });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 5: 跑测试通过**

```bash
pnpm test tests/api/admin/users.test.ts
```

Expected: 4 passed.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): add users CRUD api (invite + rename)"
```

---

## Task 9: Users 后台页面

**Files:**

- Create: `src/app/admin/users/page.tsx`

- [ ] **Step 1: 实现**

`src/app/admin/users/page.tsx`:

```tsx
'use client';
import { useEffect, useState, type FormEvent } from 'react';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN';
  createdAt: string;
};

export default function AdminUsersPage() {
  const [list, setList] = useState<User[]>([]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/users');
    const json = (await res.json()) as { users: User[] };
    setList(json.users);
  }
  useEffect(() => {
    load();
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setTempPassword(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    const json = (await res.json()) as { ok: boolean; code?: string; tempPassword?: string };
    if (!res.ok) {
      setError(json.code === 'DUPLICATE_EMAIL' ? '邮箱已存在' : '邀请失败');
      return;
    }
    setTempPassword(json.tempPassword ?? null);
    setEmail('');
    setName('');
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">管理员</h1>
        {!inviting && (
          <button onClick={() => setInviting(true)} className="px-4 py-2 border border-line text-sm">
            + 邀请管理员
          </button>
        )}
      </div>

      {inviting && (
        <form onSubmit={invite} className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">邀请新管理员</h2>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-soft">邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-soft">姓名</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {tempPassword && (
            <p className="text-sm bg-bone-dark p-3">
              临时密码：
              <code className="font-mono">{tempPassword}</code>
              （只显示一次，请立刻发给该管理员）
            </p>
          )}
          <div className="space-x-3">
            <button type="submit" className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider">
              发邀请
            </button>
            <button
              type="button"
              onClick={() => {
                setInviting(false);
                setTempPassword(null);
                setError(null);
              }}
              className="text-xs text-ink-soft hover:text-ink"
            >
              关闭
            </button>
          </div>
        </form>
      )}

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2">姓名</th>
            <th className="text-left p-2">邮箱</th>
            <th className="text-left p-2">角色</th>
            <th className="text-left p-2">加入</th>
          </tr>
        </thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="border-t border-line">
              <td className="p-2">{u.name}</td>
              <td className="p-2 font-mono text-xs">{u.email}</td>
              <td className="p-2 text-xs">{u.role}</td>
              <td className="p-2 text-xs text-ink-soft">
                {new Date(u.createdAt).toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add users admin page"
```

---

## Task 10: 共享后台组件（StatusBadge、ConfirmDialog、Pagination）

**Files:**

- Create: `src/components/admin/StatusBadge.tsx`, `src/components/admin/ConfirmDialog.tsx`, `src/components/admin/Pagination.tsx`

- [ ] **Step 1: StatusBadge**

`src/components/admin/StatusBadge.tsx`:

```tsx
import type { ProductStatus } from '@prisma/client';

const COLORS: Record<ProductStatus, string> = {
  DRAFT: 'bg-bone-dark text-ink-soft',
  AVAILABLE: 'bg-green-100 text-green-800',
  RESERVED: 'bg-amber-100 text-amber-800',
  SOLD: 'bg-ink text-bone',
  ARCHIVED: 'bg-line text-ink-soft'
};

const LABELS: Record<ProductStatus, string> = {
  DRAFT: '草稿',
  AVAILABLE: '在售',
  RESERVED: '保留',
  SOLD: '售出',
  ARCHIVED: '归档'
};

export function StatusBadge({ status }: { status: ProductStatus }) {
  return (
    <span className={`inline-block px-2 py-0.5 text-xs tracking-wider ${COLORS[status]}`}>
      {LABELS[status]}
    </span>
  );
}
```

- [ ] **Step 2: ConfirmDialog**

`src/components/admin/ConfirmDialog.tsx`:

```tsx
'use client';
import { useEffect, useRef } from 'react';

type Props = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = '确认',
  destructive = false,
  onConfirm,
  onCancel
}: Props) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} className="border border-line p-6 max-w-md backdrop:bg-ink/40">
      <h2 className="font-serif text-xl mb-2">{title}</h2>
      <p className="text-sm text-ink-soft mb-6">{message}</p>
      <div className="flex justify-end gap-3">
        <button onClick={onCancel} className="px-4 py-2 border border-line text-sm">
          取消
        </button>
        <button
          onClick={onConfirm}
          className={`px-4 py-2 text-sm text-bone ${destructive ? 'bg-red-700' : 'bg-ink'}`}
        >
          {confirmLabel}
        </button>
      </div>
    </dialog>
  );
}
```

- [ ] **Step 3: Pagination**

`src/components/admin/Pagination.tsx`:

```tsx
type Props = {
  page: number; // 1-based
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
};

export function Pagination({ page, pageSize, total, onChange }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="flex items-center gap-2 text-xs tracking-wider">
      <button
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
        className="px-3 py-1 border border-line disabled:opacity-30"
      >
        ←
      </button>
      <span>
        {page} / {pages}
      </span>
      <button
        disabled={page >= pages}
        onClick={() => onChange(page + 1)}
        className="px-3 py-1 border border-line disabled:opacity-30"
      >
        →
      </button>
    </div>
  );
}
```

- [ ] **Step 4: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 5: Commit**

```bash
git add src/components/admin
git commit -m "feat(admin): add shared StatusBadge, ConfirmDialog, Pagination"
```

---

## Task 11: 商品查询 helpers

**Files:**

- Create: `src/lib/products.ts`

- [ ] **Step 1: 实现**

`src/lib/products.ts`:

```ts
import { Prisma, type ProductStatus } from '@prisma/client';
import { prisma } from './prisma';

export type ProductListFilter = {
  status?: ProductStatus | 'ALL';
  brand?: string;
  categoryId?: string;
  search?: string;
  page?: number;
  pageSize?: number;
};

export async function listProductsAdmin(filter: ProductListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(100, Math.max(1, filter.pageSize ?? 20));
  const where: Prisma.ProductWhereInput = {};
  if (filter.status && filter.status !== 'ALL') where.status = filter.status;
  if (filter.brand) where.brand = filter.brand;
  if (filter.categoryId) where.categoryId = filter.categoryId;
  if (filter.search) {
    where.OR = [
      { titleZh: { contains: filter.search, mode: 'insensitive' } },
      { titleEn: { contains: filter.search, mode: 'insensitive' } },
      { serialNumber: { contains: filter.search, mode: 'insensitive' } }
    ];
  }
  const [items, total] = await Promise.all([
    prisma.product.findMany({
      where,
      include: {
        category: { select: { slug: true, nameZh: true, nameEn: true } },
        images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
      },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.product.count({ where })
  ]);
  return { items, total, page, pageSize };
}

export async function getProductDetail(id: string) {
  return prisma.product.findUnique({
    where: { id },
    include: {
      category: true,
      images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] },
      uploadedBy: { select: { id: true, name: true, email: true } }
    }
  });
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/lib/products.ts
git commit -m "feat: add product query helpers"
```

---

## Task 12: 商品 list + detail API

**Files:**

- Create: `src/app/api/admin/products/route.ts`（GET only for now）, `src/app/api/admin/products/[id]/route.ts`（GET only）

- [ ] **Step 1: 实现 list**

`src/app/api/admin/products/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { listProductsAdmin } from '@/lib/products';

export const runtime = 'nodejs';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? 'ALL') as never;
  const result = await listProductsAdmin({
    status,
    brand: url.searchParams.get('brand') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    page: Number(url.searchParams.get('page') ?? '1'),
    pageSize: Number(url.searchParams.get('pageSize') ?? '20')
  });
  return NextResponse.json({ ok: true, ...result });
}
```

- [ ] **Step 2: 实现 detail GET**

`src/app/api/admin/products/[id]/route.ts`（先只放 GET，后续 Task 加 PATCH/DELETE）:

```ts
import { NextResponse } from 'next/server';
import { getProductDetail } from '@/lib/products';

export const runtime = 'nodejs';

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await getProductDetail(id);
  if (!product) {
    return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, product });
}
```

- [ ] **Step 3: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 4: Commit**

```bash
git add src/app/api/admin/products
git commit -m "feat(admin): add product list + detail api"
```

---

## Task 13: 商品 create API + 测试

**Files:**

- Modify: `src/app/api/admin/products/route.ts`（加 POST）
- Test: `tests/api/admin/products.test.ts`

- [ ] **Step 1: 写测试（覆盖 Task 13 + Task 14 + Task 15 + Task 16）**

`tests/api/admin/products.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type Category, type AdminUser } from '@prisma/client';
import { POST as createProduct } from '@/app/api/admin/products/route';
import { PATCH as updateProduct, DELETE as deleteProduct } from '@/app/api/admin/products/[id]/route';
import { PATCH as setStatus } from '@/app/api/admin/products/[id]/status/route';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let category: Category;
let owner: AdminUser;

beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'ptest-' } } });
  await prisma.category.deleteMany({ where: { slug: 'ptest-cat' } });
  await prisma.adminUser.deleteMany({ where: { email: 'ptest-owner@x.com' } });
  category = await prisma.category.create({
    data: { slug: 'ptest-cat', nameZh: '手表', nameEn: 'Watches' }
  });
  owner = await prisma.adminUser.create({
    data: {
      email: 'ptest-owner@x.com',
      name: 'ptest',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'ptest-' } } });
  await prisma.category.deleteMany({ where: { slug: 'ptest-cat' } });
  await prisma.adminUser.deleteMany({ where: { email: 'ptest-owner@x.com' } });
  await prisma.$disconnect();
});

function reqWith(method: string, url: string, body?: unknown, userId?: string): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...(userId ? { 'x-admin-user-id': userId } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
}

describe('product crud', () => {
  let createdId = '';

  it('POST 创建商品', async () => {
    const res = await createProduct(
      reqWith('POST', '/api/admin/products', {
        titleZh: '劳力士黑水鬼',
        titleEn: 'Rolex Submariner',
        brand: 'Rolex',
        categoryId: category.id,
        price: '45000.00',
        condition: 'EXCELLENT',
        status: 'DRAFT',
        images: [{ key: 'abc.jpg', publicUrl: '/uploads/abc.jpg', kind: 'PHOTO' }]
      }, owner.id)
    );
    expect(res.status).toBe(201);
    const json = (await res.json()) as { product: { id: string; slug: string } };
    expect(json.product.slug).toMatch(/^lao-li-shi-hei-shui-gui/);
    createdId = json.product.id;
  });

  it('PATCH 编辑商品', async () => {
    const res = await updateProduct(
      reqWith('PATCH', `/api/admin/products/${createdId}`, { titleZh: '劳力士黑水鬼 16610' }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got?.titleZh).toBe('劳力士黑水鬼 16610');
  });

  it('PATCH /status 切换为 SOLD 设置 soldAt', async () => {
    const res = await setStatus(
      reqWith('PATCH', `/api/admin/products/${createdId}/status`, { status: 'SOLD' }),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got?.status).toBe('SOLD');
    expect(got?.soldAt).not.toBeNull();
  });

  it('DELETE 删除商品（cascade 图片）', async () => {
    const res = await deleteProduct(
      reqWith('DELETE', `/api/admin/products/${createdId}`),
      { params: Promise.resolve({ id: createdId }) }
    );
    expect(res.status).toBe(200);
    const got = await prisma.product.findUnique({ where: { id: createdId } });
    expect(got).toBeNull();
    const imgs = await prisma.image.count({ where: { productId: createdId } });
    expect(imgs).toBe(0);
  });
});
```

> 注意：route 实现需从 header `x-admin-user-id` 读取上传者（M2 简化做法，避免在 Vitest 集成测里模拟 cookie + middleware）。Production 走的是 cookie 鉴权，已经由 middleware 校验过；route 处理时也可以信任 middleware 注入的标记。这里为了测试方便，在 dev/test 下接受 header；在 prod 下从 session cookie 解析。

实际更干净的做法（M2 实施）：

- 在 `src/lib/auth.ts` 增加 `getSessionFromRequest(req: Request): Promise<SessionPayload | null>`，从 cookie 解析。
- 在 admin routes 顶部调用这个函数取得当前用户，写到 `uploadedById`。
- 测试中通过 header `cookie: lr_session=<token>` 注入。

为简化 M2 写法，**先用 header 注入**，留下重构 hook。

- [ ] **Step 2: 跑失败**

```bash
pnpm test tests/api/admin/products.test.ts
```

- [ ] **Step 3: 实现 POST create**

修改 `src/app/api/admin/products/route.ts` 加上 POST：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { listProductsAdmin } from '@/lib/products';
import { toSlug, ensureUniqueSlug } from '@/lib/slug';

export const runtime = 'nodejs';

const ImageInput = z.object({
  key: z.string().min(1),
  publicUrl: z.string().min(1),
  kind: z.enum(['PHOTO', 'CERT'])
});

const Body = z.object({
  titleZh: z.string().min(1).max(120),
  titleEn: z.string().max(120).optional(),
  descZh: z.string().max(5000).optional(),
  descEn: z.string().max(5000).optional(),
  brand: z.string().min(1).max(60),
  categoryId: z.string().min(1),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/),
  originalPrice: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .optional(),
  currency: z.string().length(3).default('CNY'),
  condition: z.enum(['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR']),
  sizeInfo: z.record(z.string()).optional(),
  serialNumber: z.string().max(120).optional(),
  status: z.enum(['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED']).default('DRAFT'),
  images: z.array(ImageInput).max(15)
});

function adminUserIdFromReq(req: Request): string | null {
  return req.headers.get('x-admin-user-id');
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const status = (url.searchParams.get('status') ?? 'ALL') as never;
  const result = await listProductsAdmin({
    status,
    brand: url.searchParams.get('brand') ?? undefined,
    categoryId: url.searchParams.get('categoryId') ?? undefined,
    search: url.searchParams.get('search') ?? undefined,
    page: Number(url.searchParams.get('page') ?? '1'),
    pageSize: Number(url.searchParams.get('pageSize') ?? '20')
  });
  return NextResponse.json({ ok: true, ...result });
}

export async function POST(req: Request) {
  const userId = adminUserIdFromReq(req);
  if (!userId) {
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const base = toSlug(parsed.titleEn || parsed.titleZh);
  const slug = await ensureUniqueSlug(base, async (s) =>
    prisma.product.findUnique({ where: { slug: s }, select: { id: true } })
  );

  const product = await prisma.$transaction(async (tx) => {
    const p = await tx.product.create({
      data: {
        slug,
        titleZh: parsed.titleZh,
        titleEn: parsed.titleEn,
        descZh: parsed.descZh,
        descEn: parsed.descEn,
        brand: parsed.brand,
        categoryId: parsed.categoryId,
        price: new Prisma.Decimal(parsed.price),
        originalPrice: parsed.originalPrice ? new Prisma.Decimal(parsed.originalPrice) : undefined,
        currency: parsed.currency,
        condition: parsed.condition,
        sizeInfo: parsed.sizeInfo,
        serialNumber: parsed.serialNumber,
        status: parsed.status,
        uploadedById: userId,
        images: {
          create: parsed.images.map((img, i) => ({
            url: img.publicUrl,
            kind: img.kind,
            sortOrder: i
          }))
        }
      },
      include: { images: true, category: { select: { slug: true, nameZh: true, nameEn: true } } }
    });
    return p;
  });
  return NextResponse.json({ ok: true, product }, { status: 201 });
}
```

- [ ] **Step 4: 跑测试到「POST 创建商品」通过**

```bash
pnpm test tests/api/admin/products.test.ts -t "POST 创建商品"
```

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): add product create api"
```

---

## Task 14: 商品 update API

**Files:**

- Modify: `src/app/api/admin/products/[id]/route.ts`（加 PATCH）

- [ ] **Step 1: 加 PATCH 到 detail route**

替换 `src/app/api/admin/products/[id]/route.ts` 全文：

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getProductDetail } from '@/lib/products';

export const runtime = 'nodejs';

const ImageInput = z.object({
  key: z.string().min(1),
  publicUrl: z.string().min(1),
  kind: z.enum(['PHOTO', 'CERT'])
});

const Body = z
  .object({
    titleZh: z.string().min(1).max(120),
    titleEn: z.string().max(120),
    descZh: z.string().max(5000),
    descEn: z.string().max(5000),
    brand: z.string().min(1).max(60),
    categoryId: z.string().min(1),
    price: z.string().regex(/^\d+(\.\d{1,2})?$/),
    originalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),
    condition: z.enum(['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR']),
    sizeInfo: z.record(z.string()),
    serialNumber: z.string().max(120),
    images: z.array(ImageInput).max(15)
  })
  .partial();

type Ctx = { params: Promise<{ id: string }> };

export async function GET(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const product = await getProductDetail(id);
  if (!product) return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
  return NextResponse.json({ ok: true, product });
}

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }

  const data: Prisma.ProductUpdateInput = {};
  if (parsed.titleZh !== undefined) data.titleZh = parsed.titleZh;
  if (parsed.titleEn !== undefined) data.titleEn = parsed.titleEn;
  if (parsed.descZh !== undefined) data.descZh = parsed.descZh;
  if (parsed.descEn !== undefined) data.descEn = parsed.descEn;
  if (parsed.brand !== undefined) data.brand = parsed.brand;
  if (parsed.categoryId !== undefined) data.category = { connect: { id: parsed.categoryId } };
  if (parsed.price !== undefined) data.price = new Prisma.Decimal(parsed.price);
  if (parsed.originalPrice !== undefined) data.originalPrice = new Prisma.Decimal(parsed.originalPrice);
  if (parsed.condition !== undefined) data.condition = parsed.condition;
  if (parsed.sizeInfo !== undefined) data.sizeInfo = parsed.sizeInfo;
  if (parsed.serialNumber !== undefined) data.serialNumber = parsed.serialNumber;

  try {
    if (parsed.images) {
      // 全量替换图片
      await prisma.$transaction([
        prisma.image.deleteMany({ where: { productId: id } }),
        prisma.product.update({
          where: { id },
          data: {
            ...data,
            images: {
              create: parsed.images.map((img, i) => ({
                url: img.publicUrl,
                kind: img.kind,
                sortOrder: i
              }))
            }
          }
        })
      ]);
    } else {
      await prisma.product.update({ where: { id }, data });
    }
    const product = await getProductDetail(id);
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}

export async function DELETE(_req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  try {
    await prisma.product.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: 跑测试**

```bash
pnpm test tests/api/admin/products.test.ts -t "PATCH 编辑"
pnpm test tests/api/admin/products.test.ts -t "DELETE 删除"
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add product update + delete api"
```

---

## Task 15: 商品状态切换 API

**Files:**

- Create: `src/app/api/admin/products/[id]/status/route.ts`

- [ ] **Step 1: 实现**

`src/app/api/admin/products/[id]/status/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma, type ProductStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export const runtime = 'nodejs';

const Body = z.object({
  status: z.enum(['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED'])
});

type Ctx = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }
  const newStatus: ProductStatus = parsed.status;
  const data: Prisma.ProductUpdateInput = { status: newStatus };
  if (newStatus === 'SOLD') data.soldAt = new Date();
  else if (newStatus !== 'RESERVED') data.soldAt = null;

  try {
    const product = await prisma.product.update({
      where: { id },
      data,
      select: { id: true, status: true, soldAt: true }
    });
    return NextResponse.json({ ok: true, product });
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return NextResponse.json({ ok: false, code: 'NOT_FOUND' }, { status: 404 });
    }
    throw e;
  }
}
```

- [ ] **Step 2: 跑测试**

```bash
pnpm test tests/api/admin/products.test.ts
```

Expected: 4 passed (POST/PATCH/status/DELETE)。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add product status toggle api"
```

---

## Task 16: ProductForm 组件

**Files:**

- Create: `src/components/admin/ProductForm.tsx`

- [ ] **Step 1: 实现**

`src/components/admin/ProductForm.tsx`:

```tsx
'use client';
import { useState, type FormEvent } from 'react';
import type { Condition, ProductStatus } from '@prisma/client';
import { ImageUploader, type UploadedImage } from './ImageUploader';

export type ProductFormValue = {
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  brand: string;
  categoryId: string;
  price: string;
  originalPrice: string;
  condition: Condition;
  sizeInfo: string; // JSON 字符串
  serialNumber: string;
  status: ProductStatus;
  photos: UploadedImage[];
  certs: UploadedImage[];
};

type Props = {
  initial?: Partial<ProductFormValue>;
  categories: Array<{ id: string; slug: string; nameZh: string }>;
  brandOptions: string[];
  onSubmit: (v: ProductFormValue) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
};

const CONDITIONS: Condition[] = ['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR'];
const STATUSES: ProductStatus[] = ['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED'];
const CONDITION_LABEL: Record<Condition, string> = {
  NEW: '全新',
  LIKE_NEW: '几乎全新',
  EXCELLENT: '95 新',
  GOOD: '85 新',
  FAIR: '有明显痕迹'
};

export function ProductForm({ initial, categories, brandOptions, onSubmit, submitLabel = '保存' }: Props) {
  const [v, setV] = useState<ProductFormValue>({
    titleZh: initial?.titleZh ?? '',
    titleEn: initial?.titleEn ?? '',
    descZh: initial?.descZh ?? '',
    descEn: initial?.descEn ?? '',
    brand: initial?.brand ?? '',
    categoryId: initial?.categoryId ?? '',
    price: initial?.price ?? '',
    originalPrice: initial?.originalPrice ?? '',
    condition: initial?.condition ?? 'EXCELLENT',
    sizeInfo: initial?.sizeInfo ?? '',
    serialNumber: initial?.serialNumber ?? '',
    status: initial?.status ?? 'DRAFT',
    photos: initial?.photos ?? [],
    certs: initial?.certs ?? []
  });
  const [tab, setTab] = useState<'zh' | 'en'>('zh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      JSON.parse(v.sizeInfo || '{}');
    } catch {
      setError('尺寸信息必须是合法 JSON');
      setBusy(false);
      return;
    }
    const r = await onSubmit(v);
    if (!r.ok) setError(r.message ?? '保存失败');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">品牌</span>
          <input
            list="brand-options"
            required
            value={v.brand}
            onChange={(e) => setV({ ...v, brand: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
          <datalist id="brand-options">
            {brandOptions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">分类</span>
          <select
            required
            value={v.categoryId}
            onChange={(e) => setV({ ...v, categoryId: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            <option value="">请选择…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameZh}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border border-line">
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => setTab('zh')}
            className={`px-4 py-2 text-xs uppercase tracking-wider ${tab === 'zh' ? 'bg-ink text-bone' : 'text-ink-soft'}`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => setTab('en')}
            className={`px-4 py-2 text-xs uppercase tracking-wider ${tab === 'en' ? 'bg-ink text-bone' : 'text-ink-soft'}`}
          >
            English
          </button>
        </div>
        <div className="p-4 space-y-3">
          {tab === 'zh' ? (
            <>
              <input
                required
                placeholder="标题（中）"
                value={v.titleZh}
                onChange={(e) => setV({ ...v, titleZh: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
              <textarea
                rows={6}
                placeholder="描述（中）"
                value={v.descZh}
                onChange={(e) => setV({ ...v, descZh: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
            </>
          ) : (
            <>
              <input
                placeholder="Title (EN, optional)"
                value={v.titleEn}
                onChange={(e) => setV({ ...v, titleEn: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
              <textarea
                rows={6}
                placeholder="Description (EN, optional)"
                value={v.descEn}
                onChange={(e) => setV({ ...v, descEn: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">价格 (CNY)</span>
          <input
            required
            pattern="\d+(\.\d{1,2})?"
            value={v.price}
            onChange={(e) => setV({ ...v, price: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">原价 (CNY，可空)</span>
          <input
            value={v.originalPrice}
            onChange={(e) => setV({ ...v, originalPrice: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">成色</span>
          <select
            value={v.condition}
            onChange={(e) => setV({ ...v, condition: e.target.value as Condition })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">序列号</span>
          <input
            value={v.serialNumber}
            onChange={(e) => setV({ ...v, serialNumber: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">状态</span>
          <select
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as ProductStatus })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">
          尺寸信息 (JSON，例: {`{"diameter":"40mm"}`})
        </span>
        <textarea
          rows={3}
          value={v.sizeInfo}
          onChange={(e) => setV({ ...v, sizeInfo: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
        />
      </label>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">商品图</span>
        <div className="mt-2">
          <ImageUploader
            value={v.photos}
            onChange={(next) => setV({ ...v, photos: next })}
            kind="PHOTO"
            max={15}
          />
        </div>
      </div>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">鉴定附件</span>
        <div className="mt-2">
          <ImageUploader
            value={v.certs}
            onChange={(next) => setV({ ...v, certs: next })}
            kind="CERT"
            max={5}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider disabled:opacity-50"
      >
        {busy ? '保存中…' : submitLabel}
      </button>
    </form>
  );
}
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/components/admin/ProductForm.tsx
git commit -m "feat(admin): add ProductForm with bilingual tabs and image uploaders"
```

---

## Task 17: 商品后台列表页

**Files:**

- Create: `src/app/admin/products/page.tsx`

- [ ] **Step 1: 实现**

`src/app/admin/products/page.tsx`:

```tsx
'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { ProductStatus } from '@prisma/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Pagination } from '@/components/admin/Pagination';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type Item = {
  id: string;
  slug: string;
  titleZh: string;
  brand: string;
  price: string;
  status: ProductStatus;
  createdAt: string;
  category: { nameZh: string };
  images: Array<{ url: string }>;
};

export default function AdminProductsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ProductStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (status !== 'ALL') params.set('status', status);
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const json = (await res.json()) as { items: Item[]; total: number };
    setItems(json.items);
    setTotal(json.total);
  }, [page, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function doDelete() {
    if (!toDelete) return;
    await fetch(`/api/admin/products/${toDelete.id}`, { method: 'DELETE' });
    setToDelete(null);
    await load();
  }

  async function setItemStatus(id: string, next: ProductStatus) {
    await fetch(`/api/admin/products/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next })
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">商品</h1>
        <Link href="/admin/products/new" className="px-4 py-2 bg-ink text-bone text-sm tracking-wider uppercase">
          + 新建商品
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as ProductStatus | 'ALL');
          }}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="AVAILABLE">在售</option>
          <option value="RESERVED">保留</option>
          <option value="SOLD">已售</option>
          <option value="ARCHIVED">归档</option>
        </select>
        <input
          placeholder="搜索标题或序列号"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="border border-line px-3 py-2 text-sm flex-1 max-w-sm"
        />
      </div>

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2"> </th>
            <th className="text-left p-2">标题</th>
            <th className="text-left p-2">品牌</th>
            <th className="text-left p-2">分类</th>
            <th className="text-right p-2">价格</th>
            <th className="text-left p-2">状态</th>
            <th className="text-right p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t border-line align-top">
              <td className="p-2">
                {p.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0].url} alt="" className="w-12 h-12 object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-bone-dark" />
                )}
              </td>
              <td className="p-2">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:text-accent">
                  {p.titleZh}
                </Link>
                <div className="text-xs text-ink-soft font-mono">{p.slug}</div>
              </td>
              <td className="p-2">{p.brand}</td>
              <td className="p-2">{p.category.nameZh}</td>
              <td className="p-2 text-right tabular-nums">¥{Number(p.price).toLocaleString()}</td>
              <td className="p-2">
                <select
                  value={p.status}
                  onChange={(e) => setItemStatus(p.id, e.target.value as ProductStatus)}
                  className="text-xs border border-line px-1 py-0.5"
                >
                  <option value="DRAFT">草稿</option>
                  <option value="AVAILABLE">在售</option>
                  <option value="RESERVED">保留</option>
                  <option value="SOLD">已售</option>
                  <option value="ARCHIVED">归档</option>
                </select>
                <div className="mt-1">
                  <StatusBadge status={p.status} />
                </div>
              </td>
              <td className="p-2 text-right text-xs space-x-3">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:text-accent">
                  编辑
                </Link>
                <button onClick={() => setToDelete(p)} className="text-red-600 hover:text-red-800">
                  删除
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-sm text-ink-soft">
                暂无商品
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      <ConfirmDialog
        open={!!toDelete}
        title="删除商品"
        message={`确认删除 "${toDelete?.titleZh}"？图片也会一并删除（来源记录），无法撤销。`}
        confirmLabel="删除"
        destructive
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
```

- [ ] **Step 2: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/products/page.tsx
git commit -m "feat(admin): add products list page"
```

---

## Task 18: 商品新建 + 编辑页

**Files:**

- Create: `src/app/admin/products/new/page.tsx`, `src/app/admin/products/[id]/edit/page.tsx`

- [ ] **Step 1: 实现共用的页面 fetcher**

`src/app/admin/products/new/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProductForm, type ProductFormValue } from '@/components/admin/ProductForm';

type Category = { id: string; slug: string; nameZh: string };

export default function NewProductPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [catRes, setRes] = await Promise.all([
        fetch('/api/admin/categories'),
        fetch('/api/admin/settings')
      ]);
      const cat = (await catRes.json()) as { categories: Category[] };
      const set = (await setRes.json()) as { settings: { brand_options: string } };
      setCategories(cat.categories);
      setBrandOptions(
        (set.settings.brand_options ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      );
    })();
  }, []);

  async function submit(v: ProductFormValue) {
    const sizeInfo = v.sizeInfo ? (JSON.parse(v.sizeInfo) as Record<string, string>) : undefined;
    const res = await fetch('/api/admin/products', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleZh: v.titleZh,
        titleEn: v.titleEn || undefined,
        descZh: v.descZh || undefined,
        descEn: v.descEn || undefined,
        brand: v.brand,
        categoryId: v.categoryId,
        price: v.price,
        originalPrice: v.originalPrice || undefined,
        condition: v.condition,
        sizeInfo,
        serialNumber: v.serialNumber || undefined,
        status: v.status,
        images: [...v.photos, ...v.certs]
      })
    });
    if (res.ok) {
      router.push('/admin/products');
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">新建商品</h1>
      <ProductForm categories={categories} brandOptions={brandOptions} onSubmit={submit} submitLabel="创建" />
    </div>
  );
}
```

`src/app/admin/products/[id]/edit/page.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import type { Condition, ProductStatus } from '@prisma/client';
import { ProductForm, type ProductFormValue } from '@/components/admin/ProductForm';
import type { UploadedImage } from '@/components/admin/ImageUploader';

type Category = { id: string; slug: string; nameZh: string };

type Detail = {
  id: string;
  titleZh: string;
  titleEn: string | null;
  descZh: string | null;
  descEn: string | null;
  brand: string;
  categoryId: string;
  price: string;
  originalPrice: string | null;
  condition: Condition;
  sizeInfo: Record<string, string> | null;
  serialNumber: string | null;
  status: ProductStatus;
  images: Array<{ id: string; url: string; kind: 'PHOTO' | 'CERT'; sortOrder: number }>;
};

export default function EditProductPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const [initial, setInitial] = useState<ProductFormValue | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [brandOptions, setBrandOptions] = useState<string[]>([]);

  useEffect(() => {
    (async () => {
      const [detailRes, catRes, setRes] = await Promise.all([
        fetch(`/api/admin/products/${params.id}`),
        fetch('/api/admin/categories'),
        fetch('/api/admin/settings')
      ]);
      const d = (await detailRes.json()) as { product: Detail };
      const cat = (await catRes.json()) as { categories: Category[] };
      const set = (await setRes.json()) as { settings: { brand_options: string } };
      const photos: UploadedImage[] = d.product.images
        .filter((i) => i.kind === 'PHOTO')
        .map((i) => ({ key: i.id, publicUrl: i.url, kind: 'PHOTO' }));
      const certs: UploadedImage[] = d.product.images
        .filter((i) => i.kind === 'CERT')
        .map((i) => ({ key: i.id, publicUrl: i.url, kind: 'CERT' }));
      setInitial({
        titleZh: d.product.titleZh,
        titleEn: d.product.titleEn ?? '',
        descZh: d.product.descZh ?? '',
        descEn: d.product.descEn ?? '',
        brand: d.product.brand,
        categoryId: d.product.categoryId,
        price: String(d.product.price),
        originalPrice: d.product.originalPrice ? String(d.product.originalPrice) : '',
        condition: d.product.condition,
        sizeInfo: d.product.sizeInfo ? JSON.stringify(d.product.sizeInfo) : '',
        serialNumber: d.product.serialNumber ?? '',
        status: d.product.status,
        photos,
        certs
      });
      setCategories(cat.categories);
      setBrandOptions(
        (set.settings.brand_options ?? '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean)
      );
    })();
  }, [params.id]);

  async function submit(v: ProductFormValue) {
    const sizeInfo = v.sizeInfo ? (JSON.parse(v.sizeInfo) as Record<string, string>) : {};
    const res = await fetch(`/api/admin/products/${params.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        titleZh: v.titleZh,
        titleEn: v.titleEn,
        descZh: v.descZh,
        descEn: v.descEn,
        brand: v.brand,
        categoryId: v.categoryId,
        price: v.price,
        originalPrice: v.originalPrice,
        condition: v.condition,
        sizeInfo,
        serialNumber: v.serialNumber,
        images: [...v.photos, ...v.certs]
      })
    });
    if (res.ok) {
      router.push('/admin/products');
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  if (!initial) return <p className="text-sm text-ink-soft">加载中…</p>;

  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">编辑商品</h1>
      <ProductForm
        initial={initial}
        categories={categories}
        brandOptions={brandOptions}
        onSubmit={submit}
        submitLabel="保存"
      />
    </div>
  );
}
```

- [ ] **Step 2: typecheck + build**

```bash
pnpm typecheck && pnpm build
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add products new + edit pages"
```

---

## Task 19: 路由层 session 注入（替换 header 占位）

**Files:**

- Modify: `src/lib/auth.ts`（增加 helper）, `src/app/api/admin/products/route.ts`（替换 header 读取）, `tests/api/admin/products.test.ts`（注入 cookie 而非 header）

> **背景**：Task 13 暂时通过 `x-admin-user-id` header 注入用户。生产路径走 cookie。这一步统一为 cookie 解析；测试改为塞 cookie。

- [ ] **Step 1: 给 auth.ts 加 helper**

在 `src/lib/auth.ts` 末尾追加：

```ts
export async function readSessionFromRequest(req: Request): Promise<SessionPayload | null> {
  const cookie = req.headers.get('cookie') ?? '';
  const m = cookie.match(new RegExp(`(?:^|; )${SESSION_COOKIE}=([^;]+)`));
  if (!m) return null;
  return verifySession(decodeURIComponent(m[1]));
}
```

- [ ] **Step 2: 替换 products POST 的用户来源**

修改 `src/app/api/admin/products/route.ts`，删掉 `adminUserIdFromReq` 函数，POST 改为：

```ts
import { readSessionFromRequest } from '@/lib/auth';
// ...
export async function POST(req: Request) {
  const session = await readSessionFromRequest(req);
  if (!session) {
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }
  // ...（其余不变，用 session.userId 替换 userId）
  uploadedById: session.userId,
}
```

- [ ] **Step 3: 改测试用 cookie 注入**

修改 `tests/api/admin/products.test.ts`：把 `beforeAll` 里增加 token 生成；改 `reqWith` 注入 cookie。

```ts
import { signSession, SESSION_COOKIE } from '@/lib/auth';
// ...
let cookie = '';
beforeAll(async () => {
  // 既有 setup ...
  process.env.JWT_SECRET = 'test-secret-min-32-bytes-required-aaaaaaaa';
  const token = await signSession({ userId: owner.id, role: 'OWNER' });
  cookie = `${SESSION_COOKIE}=${token}`;
});

function reqWith(method: string, url: string, body?: unknown): Request {
  return new Request(`http://localhost${url}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      cookie
    },
    body: body ? JSON.stringify(body) : undefined
  });
}
```

并删除原先调用 `reqWith` 时传 `userId` 参数。

- [ ] **Step 4: 跑全部 API 测试**

```bash
pnpm test
```

Expected: 全绿（M1 的 10 + M2 的 categories 6 + settings 3 + users 4 + upload-url 4 + slug 9 + products 4 = 40 passed）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "refactor: read admin session from cookie in product routes"
```

---

## Task 20: 仪表盘 stats + 侧栏激活态 + E2E + README 收尾

**Files:**

- Modify: `src/app/admin/page.tsx`, `src/app/admin/layout.tsx`, `README.md`
- Create: `tests/e2e/admin-products.spec.ts`

- [ ] **Step 1: 仪表盘真实 stats**

替换 `src/app/admin/page.tsx`:

```tsx
import { prisma } from '@/lib/prisma';

export default async function AdminDashboardPage() {
  const [availableCount, draftCount, weekInquiriesCount, recentInquiries] = await Promise.all([
    prisma.product.count({ where: { status: 'AVAILABLE' } }),
    prisma.product.count({ where: { status: 'DRAFT' } }),
    prisma.inquiry.count({
      where: { createdAt: { gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) } }
    }),
    prisma.inquiry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { product: { select: { titleZh: true } } }
    })
  ]);

  return (
    <div className="space-y-8">
      <h1 className="font-serif text-3xl">仪表盘</h1>
      <div className="grid grid-cols-3 gap-4">
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">在售商品</div>
          <div className="font-serif text-4xl mt-2">{availableCount}</div>
        </div>
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">草稿</div>
          <div className="font-serif text-4xl mt-2">{draftCount}</div>
        </div>
        <div className="border border-line p-6">
          <div className="text-xs uppercase tracking-wider text-ink-soft">本周询价</div>
          <div className="font-serif text-4xl mt-2">{weekInquiriesCount}</div>
        </div>
      </div>
      <div className="border border-line">
        <div className="border-b border-line px-4 py-2 text-xs uppercase tracking-wider">最新询价</div>
        <ul>
          {recentInquiries.map((i) => (
            <li key={i.id} className="border-b border-line last:border-0 px-4 py-3 text-sm">
              <div className="flex justify-between">
                <span>
                  <strong>{i.name}</strong> · {i.contact}
                </span>
                <span className="text-xs text-ink-soft">{new Date(i.createdAt).toISOString().slice(0, 10)}</span>
              </div>
              {i.product?.titleZh && <div className="text-xs text-ink-soft">询问: {i.product.titleZh}</div>}
              <div className="mt-1 text-ink-soft">{i.message}</div>
            </li>
          ))}
          {recentInquiries.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-ink-soft">暂无询价</li>
          )}
        </ul>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 侧栏激活态**

修改 `src/app/admin/layout.tsx`，把侧栏链接改成 client 组件读 pathname。最简单做法：抽出 `AdminSidebar` 组件。

`src/components/admin/AdminSidebar.tsx`:

```tsx
'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/admin', label: '仪表盘', exact: true },
  { href: '/admin/products', label: '商品' },
  { href: '/admin/categories', label: '分类' },
  { href: '/admin/users', label: '管理员' },
  { href: '/admin/settings', label: '设置' }
];

export function AdminSidebar() {
  const pathname = usePathname();
  return (
    <nav className="space-y-2 text-sm">
      {ITEMS.map((it) => {
        const active = it.exact ? pathname === it.href : pathname.startsWith(it.href);
        return (
          <Link
            key={it.href}
            href={it.href}
            className={`block py-1.5 ${active ? 'text-ink' : 'text-ink-soft'}`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
```

替换 `src/app/admin/layout.tsx` 中的 nav 区域为 `<AdminSidebar />`（删掉「询价」链接——M4 才有，避免 404）。

- [ ] **Step 3: 写 E2E**

`tests/e2e/admin-products.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'e2e-products@x.com';
const PASSWORD = 'TestPass-456';

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-prod-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.category.create({
    data: { slug: 'e2e-cat-watch', nameZh: '手表', nameEn: 'Watches', sortOrder: 99 }
  });
  await prisma.adminUser.create({
    data: {
      email: EMAIL,
      name: 'E2E Products',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(PASSWORD, 12)
    }
  });
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-prod-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'e2e-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('登录后能进入商品列表', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(EMAIL);
  await page.getByLabel('密码').fill(PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await page.getByRole('link', { name: '商品' }).click();
  await expect(page).toHaveURL(/\/admin\/products$/);
  await expect(page.getByRole('heading', { name: '商品' })).toBeVisible();
});
```

- [ ] **Step 4: README 更新**

把 README 里"M1 待完成的环境步骤"那一节删掉（已完成）；加一行"M2 完成"说明。

- [ ] **Step 5: 全量验证**

```bash
pnpm typecheck
pnpm lint
pnpm test
pnpm e2e
```

Expected: 全绿。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(admin): dashboard stats + active sidebar; add products e2e; update readme"
```

---

## M2 验收清单

- [ ] `/admin/categories` 可创建/编辑/删除分类，禁止删除被商品引用的分类
- [ ] `/admin/settings` 可改电话、微信号、上传二维码、维护品牌候选词
- [ ] `/admin/users` 可邀请新管理员，临时密码一次性显示
- [ ] `/admin/products` 列表支持状态筛选、搜索、分页、状态切换、删除（确认弹框）
- [ ] `/admin/products/new` 双语标题+描述、品牌下拉（来自 settings）、分类下拉、图片上传（PHOTO+CERT）、sizeInfo JSON、价格 Decimal
- [ ] `/admin/products/[id]/edit` 加载已有数据、可改、图片可重排和删除
- [ ] 商品状态切换：→SOLD 自动设 `soldAt`；其他状态清除
- [ ] 仪表盘显示在售/草稿/本周询价数 + 最新 5 条询价
- [ ] 侧栏当前页激活态高亮
- [ ] 图片上传到 `public/uploads/`（gitignored）
- [ ] `pnpm typecheck` / `lint` / `test` / `e2e` 全绿

## M2 自审备注

- **占位符扫描**：无 TBD/TODO。Task 13/19 之间存在的 header 注入是显式过渡方案，Task 19 移除
- **类型/命名一致**：`SessionPayload`、`SESSION_COOKIE`、`readSessionFromRequest`、`signSession`、`UploadedImage`、`ProductFormValue`、`SETTING_KEYS` 在所有任务中名称一致
- **关键 spec 覆盖**：§3 数据模型已完整使用（Product/Image/Inquiry/Category/AdminUser/Setting + 5 enums）；§5.2 后台 9 个页面除「询价」延后 M4 外全部覆盖；§7 安全（Zod 校验、Prisma 唯一约束 → 409、限流仍依赖 M1 中的 loginLimiter，无新增暴露面）覆盖；§6 错误处理统一 `{ ok, code }` 格式
- **明确推迟到 M4**：COS（M2 用本地 `public/uploads/` 替代，前端 PUT 协议形态一致）、`/admin/inquiries` 页面与 `/api/inquiries` 公开 API、限流的 Redis 化、CSP 完整 Content-Security-Policy 头、登录失败邮件通知
- **测试稳定性**：M1 引入的 `DATABASE_URL_TEST_ENABLED` 门控不再需要——M2 默认期望 PG 就位（Docker 已装）。如需在无 DB 环境跑测试，可单独跑 `pnpm test tests/lib/`
- **图片产物隔离**：`public/uploads/` 进 `.gitignore`，开发期本地积累不影响 commit
- **数据完整性**：删除分类前检查关联商品（IN_USE 409）；删除商品 cascade 图片；图片 update 走"全删全建"——简单但每次保存替换整套 sortOrder，避免边界 bug

---

## 执行方式选择

计划写入 `docs/superpowers/plans/2026-05-13-m2-admin-crud.md`。两种执行方式：

1. **Subagent-Driven** —— 每个 Task 派 subagent，两阶段评审。M1 用这个跑过，理解了开销。
2. **Inline 执行** —— 我在当前会话直接跑（用 `executing-plans` 技能）。M1 后半段就是 inline 跑的，节奏快。

按 M1 经验，纯配置/单文件任务 inline 更划算；带逻辑+测试的任务两种都行。

**你选哪种？**
