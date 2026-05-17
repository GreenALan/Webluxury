# M3 Public Site Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the bilingual mobile-first public-facing site — Home, Products list (with filters + pagination), Product detail (image gallery + bilingual copy + cert appendix), Favorites (localStorage), About, Contact — backed by a public products API and reusing M1/M2 design tokens, i18n, and admin libs.

**Architecture:** Server-render every page that doesn't need interactivity; one public `/api/products` endpoint that powers both filter-driven browsing and `?ids=` lookups for favorites. Filter state lives in URL `searchParams`, so server components own the data flow; favorites and the gallery are the only client islands. All pages live under `src/app/[locale]/...` so next-intl supplies locale + messages.

**Tech Stack:** Next.js 14 App Router, next-intl, Prisma (PostgreSQL), Tailwind (design tokens from M1), Zod, Vitest, Playwright.

---

## 前置假设

- M1 + M2 已合并：`Header` / `Footer` / `MobileBottomBar` / `LanguageSwitch` 已存在；`src/i18n/config.ts`、`messages/{zh,en}.json` 已建立；`src/lib/products.ts` 已有 `listProductsAdmin` / `getProductDetail`；`src/lib/settings.ts` 已有 `getAllSettings`；管理员可上传商品并改状态。
- 图片来源：M2 本地 `public/uploads/`（dev）以及 `*.myqcloud.com`（M4 COS）。`next.config.mjs` 已配置 remotePatterns；本地路径无需配置。
- 询价（InquiryDialog / `/api/inquiries`）属于 M4，本次只保留 CTA 占位（链接到 `/[locale]/contact`），**不**实现弹窗或公开 API。
- 公开 API 路由（`/api/products`）走 `middleware.ts` 现有的"非 admin = 透传 + 安全头"分支；不需要鉴权。
- 收藏：纯客户端 localStorage（key=`lr_favorites`，值=逗号分隔的 productId）。无服务端状态。

## 目录结构（M3 完成后新增的部分）

```
src/
  app/
    [locale]/
      page.tsx                     # 重写：Hero + 分类入口 + 最新上架
      products/
        page.tsx                   # 列表（server，读 searchParams）
        [slug]/page.tsx            # 详情（server）
      favorites/page.tsx           # 收藏夹（server shell + client list）
      about/page.tsx               # 关于
      contact/page.tsx             # 联系
    api/products/route.ts          # 公共列表 / by-ids
  components/public/
    ProductCard.tsx                # 卡片（server）
    PriceTag.tsx                   # 价格 + 原价划线
    ConditionBadge.tsx             # 成色徽章
    LocaleLink.tsx                 # 自动注入当前 locale 前缀的 <Link>
    PublicPagination.tsx           # URL-based 翻页（与 admin 的 callback 版分开）
    FilterPanel.tsx                # mobile drawer + desktop sidebar（client，提交即 push URL）
    ImageGallery.tsx               # 详情图片轮播（client）
    FavoriteButton.tsx             # 心形按钮（client，写 localStorage）
    FavoritesList.tsx              # 收藏页客户端组件，读 localStorage → fetch
    ContactCard.tsx                # 电话 + 微信 + 二维码
    HomeHero.tsx                   # 首页 Hero
    CategoryGrid.tsx               # 首页分类入口
    LatestStrip.tsx                # 首页最新上架横滚
  lib/
    products.ts                    # 扩：listPublicProducts / getPublicProductBySlug / getPublicProductsByIds / getFacets
    format.ts                      # 价格 / 日期格式化（locale-aware）
    favorites.ts                   # localStorage 读写 + 自定义事件
tests/
  lib/
    products-public.test.ts        # 公共查询过滤行为
  api/
    products.test.ts               # 公共列表 / ids 端点
  e2e/
    public-site.spec.ts            # 首页 → 列表 → 详情 → 收藏 烟雾测试
```

## 共享约定

- **状态过滤**：公开侧只能看到 `status='AVAILABLE'`。`RESERVED` / `SOLD` / `DRAFT` / `ARCHIVED` 永远不出现在公共 API 或页面查询里。
- **多语言取文**：列表/详情/卡片显示标题与描述时，按 `locale === 'en' ? (titleEn || titleZh) : titleZh` 回退；描述同理。
- **URL Filter 参数**：`?category=<slug>&brand=<name>&minPrice=<n>&maxPrice=<n>&page=<n>`。空字符串与缺省等价。`page` 默认 1，`pageSize` 固定 12。
- **图片**：`next/image` `fill` + `sizes` 配置 + `unoptimized={false}`。`/uploads/*.{jpg,png,webp}` 与 COS 远端都生效。
- **错误格式**：API 统一 `{ ok, code, message? }`，与 M1/M2 一致。
- **货币显示**：M3 只展示 CNY，格式 `¥12,345`（`Intl.NumberFormat('zh-CN', { style:'currency', currency:'CNY', maximumFractionDigits:0 })`）。

---

## Task 1: 公共商品查询 helpers

**Files:**

- Modify: `src/lib/products.ts`
- Create: `tests/lib/products-public.test.ts`

> **背景**：公共侧不能看到 DRAFT/SOLD/RESERVED/ARCHIVED，只能看 AVAILABLE。把读取逻辑封装在 `lib/products.ts` 里，所有页面与 API 都走它，避免在多处复制 `status: 'AVAILABLE'`。

- [ ] **Step 1: 写失败的测试**

创建 `tests/lib/products-public.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category } from '@prisma/client';
import {
  listPublicProducts,
  getPublicProductBySlug,
  getPublicProductsByIds,
  getFacets
} from '@/lib/products';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;
let catA: Category;
let catB: Category;

beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pub-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pub-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pub-test@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'pub-test@x.com',
      name: 'pub-test',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  catA = await prisma.category.create({
    data: { slug: 'pub-cat-watch', nameZh: '手表', nameEn: 'Watches', sortOrder: 1 }
  });
  catB = await prisma.category.create({
    data: { slug: 'pub-cat-bag', nameZh: '包', nameEn: 'Bags', sortOrder: 2 }
  });
  // 1 AVAILABLE in catA Rolex, 1 AVAILABLE in catB LV, 1 DRAFT (must be hidden), 1 SOLD (must be hidden)
  await prisma.product.create({
    data: {
      slug: 'pub-t-watch-1',
      titleZh: '劳力士潜航者',
      titleEn: 'Rolex Submariner',
      brand: 'Rolex',
      categoryId: catA.id,
      price: '88000.00',
      currency: 'CNY',
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-bag-1',
      titleZh: 'LV 老花',
      titleEn: 'LV Monogram',
      brand: 'Louis Vuitton',
      categoryId: catB.id,
      price: '12000.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-draft',
      titleZh: '草稿',
      brand: 'X',
      categoryId: catA.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'DRAFT',
      uploadedById: owner.id
    }
  });
  await prisma.product.create({
    data: {
      slug: 'pub-t-sold',
      titleZh: '已售',
      brand: 'X',
      categoryId: catA.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'SOLD',
      uploadedById: owner.id
    }
  });
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pub-t-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pub-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pub-test@x.com' } });
  await prisma.$disconnect();
});

describe('listPublicProducts', () => {
  it('只返回 AVAILABLE，按 createdAt desc', async () => {
    const r = await listPublicProducts({});
    expect(r.items.every((p) => p.status === 'AVAILABLE')).toBe(true);
    expect(r.items.map((p) => p.slug)).toEqual(
      expect.arrayContaining(['pub-t-watch-1', 'pub-t-bag-1'])
    );
    expect(r.items.find((p) => p.slug === 'pub-t-draft')).toBeUndefined();
    expect(r.items.find((p) => p.slug === 'pub-t-sold')).toBeUndefined();
  });

  it('按 category slug 过滤', async () => {
    const r = await listPublicProducts({ categorySlug: 'pub-cat-watch' });
    expect(r.items.map((p) => p.slug)).toEqual(['pub-t-watch-1']);
  });

  it('按 brand 精确过滤', async () => {
    const r = await listPublicProducts({ brand: 'Rolex' });
    expect(r.items.map((p) => p.slug)).toEqual(['pub-t-watch-1']);
  });

  it('按 minPrice / maxPrice 过滤', async () => {
    const lo = await listPublicProducts({ minPrice: 50000 });
    expect(lo.items.map((p) => p.slug)).toEqual(['pub-t-watch-1']);
    const hi = await listPublicProducts({ maxPrice: 50000 });
    expect(hi.items.map((p) => p.slug)).toEqual(['pub-t-bag-1']);
  });

  it('分页', async () => {
    const p1 = await listPublicProducts({ page: 1, pageSize: 1 });
    expect(p1.items).toHaveLength(1);
    expect(p1.total).toBeGreaterThanOrEqual(2);
    const p2 = await listPublicProducts({ page: 2, pageSize: 1 });
    expect(p2.items).toHaveLength(1);
    expect(p2.items[0].id).not.toBe(p1.items[0].id);
  });
});

describe('getPublicProductBySlug', () => {
  it('AVAILABLE 可拿到', async () => {
    const p = await getPublicProductBySlug('pub-t-watch-1');
    expect(p?.slug).toBe('pub-t-watch-1');
    expect(p?.category?.slug).toBe('pub-cat-watch');
  });

  it('DRAFT 返回 null', async () => {
    expect(await getPublicProductBySlug('pub-t-draft')).toBeNull();
  });

  it('SOLD 返回 null', async () => {
    expect(await getPublicProductBySlug('pub-t-sold')).toBeNull();
  });
});

describe('getPublicProductsByIds', () => {
  it('按 ids 取，仅 AVAILABLE，按入参顺序', async () => {
    const a = await prisma.product.findUnique({ where: { slug: 'pub-t-watch-1' } });
    const b = await prisma.product.findUnique({ where: { slug: 'pub-t-bag-1' } });
    const draft = await prisma.product.findUnique({ where: { slug: 'pub-t-draft' } });
    const r = await getPublicProductsByIds([b!.id, a!.id, draft!.id, 'no-such-id']);
    expect(r.map((p) => p.slug)).toEqual(['pub-t-bag-1', 'pub-t-watch-1']);
  });

  it('空数组返回 []', async () => {
    expect(await getPublicProductsByIds([])).toEqual([]);
  });
});

describe('getFacets', () => {
  it('返回有 AVAILABLE 商品的分类和品牌', async () => {
    const f = await getFacets();
    const catSlugs = f.categories.map((c) => c.slug);
    expect(catSlugs).toEqual(expect.arrayContaining(['pub-cat-watch', 'pub-cat-bag']));
    expect(f.brands).toEqual(expect.arrayContaining(['Rolex', 'Louis Vuitton']));
    // brand 'X' 只挂在 DRAFT/SOLD 上，不应出现
    expect(f.brands).not.toContain('X');
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test tests/lib/products-public.test.ts
```

Expected: FAIL — `listPublicProducts`, `getPublicProductBySlug`, `getPublicProductsByIds`, `getFacets` 都不存在。

- [ ] **Step 3: 扩展 `src/lib/products.ts`**

把 `src/lib/products.ts` 整体替换为：

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

// ---------------- Public read helpers ----------------

export type PublicListFilter = {
  categorySlug?: string;
  brand?: string;
  minPrice?: number;
  maxPrice?: number;
  page?: number;
  pageSize?: number;
};

const PUBLIC_PAGE_SIZE = 12;

export async function listPublicProducts(filter: PublicListFilter) {
  const page = Math.max(1, filter.page ?? 1);
  const pageSize = Math.min(48, Math.max(1, filter.pageSize ?? PUBLIC_PAGE_SIZE));
  const where: Prisma.ProductWhereInput = { status: 'AVAILABLE' };
  if (filter.categorySlug) where.category = { slug: filter.categorySlug };
  if (filter.brand) where.brand = filter.brand;
  if (filter.minPrice != null || filter.maxPrice != null) {
    where.price = {
      ...(filter.minPrice != null ? { gte: new Prisma.Decimal(filter.minPrice) } : {}),
      ...(filter.maxPrice != null ? { lte: new Prisma.Decimal(filter.maxPrice) } : {})
    };
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

export async function getPublicProductBySlug(slug: string) {
  const p = await prisma.product.findUnique({
    where: { slug },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { orderBy: [{ kind: 'asc' }, { sortOrder: 'asc' }] }
    }
  });
  if (!p || p.status !== 'AVAILABLE') return null;
  return p;
}

export async function getPublicProductsByIds(ids: string[]) {
  if (ids.length === 0) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, status: 'AVAILABLE' },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
    }
  });
  const byId = new Map(rows.map((r) => [r.id, r]));
  return ids.map((id) => byId.get(id)).filter((v): v is (typeof rows)[number] => Boolean(v));
}

export async function getFacets() {
  const [cats, brandRows] = await Promise.all([
    prisma.category.findMany({
      where: { products: { some: { status: 'AVAILABLE' } } },
      select: { slug: true, nameZh: true, nameEn: true, sortOrder: true },
      orderBy: [{ sortOrder: 'asc' }, { nameZh: 'asc' }]
    }),
    prisma.product.findMany({
      where: { status: 'AVAILABLE' },
      select: { brand: true },
      distinct: ['brand'],
      orderBy: { brand: 'asc' }
    })
  ]);
  return {
    categories: cats,
    brands: brandRows.map((r) => r.brand)
  };
}

export async function listLatestPublic(take = 8) {
  return prisma.product.findMany({
    where: { status: 'AVAILABLE' },
    include: {
      category: { select: { slug: true, nameZh: true, nameEn: true } },
      images: { where: { kind: 'PHOTO' }, orderBy: { sortOrder: 'asc' }, take: 1 }
    },
    orderBy: { createdAt: 'desc' },
    take
  });
}
```

- [ ] **Step 4: 跑测试，确认通过**

```bash
pnpm test tests/lib/products-public.test.ts
```

Expected: PASS（5 个 describe，13 个 it）。

- [ ] **Step 5: 跑全量 lib 测试，确认未回归**

```bash
pnpm test tests/lib/
```

Expected: 全绿（M1 + M2 lib 测试 + 新增）。

- [ ] **Step 6: Commit**

```bash
git add src/lib/products.ts tests/lib/products-public.test.ts
git commit -m "feat: add public product query helpers (list/by-slug/by-ids/facets/latest)"
```

---

## Task 2: 公共 `/api/products` 端点

**Files:**

- Create: `src/app/api/products/route.ts`
- Create: `tests/api/products.test.ts`

> **背景**：服务端组件直接走 `lib/products.ts` 不需要 API；这个端点专门为客户端 `FavoritesList` 提供 `?ids=a,b,c` 查询。同时为将来无 SSR 的场景（脚本、SEO 工具）暴露列表查询。

- [ ] **Step 1: 写失败的测试**

创建 `tests/api/products.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient, Role, type AdminUser, type Category } from '@prisma/client';
import { GET } from '@/app/api/products/route';
import { hashPassword } from '@/lib/auth';

const prisma = new PrismaClient();
let owner: AdminUser;
let cat: Category;
let availId = '';
let draftId = '';

beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pubapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pubapi-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pubapi@x.com' } });

  owner = await prisma.adminUser.create({
    data: {
      email: 'pubapi@x.com',
      name: 'pubapi',
      role: Role.OWNER,
      passwordHash: await hashPassword('secret123')
    }
  });
  cat = await prisma.category.create({
    data: { slug: 'pubapi-cat-w', nameZh: '手表', nameEn: 'Watches' }
  });
  const avail = await prisma.product.create({
    data: {
      slug: 'pubapi-w1',
      titleZh: '表 A',
      brand: 'Rolex',
      categoryId: cat.id,
      price: '10000.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
  const draft = await prisma.product.create({
    data: {
      slug: 'pubapi-draft',
      titleZh: '草',
      brand: 'X',
      categoryId: cat.id,
      price: '1.00',
      currency: 'CNY',
      condition: 'GOOD',
      status: 'DRAFT',
      uploadedById: owner.id
    }
  });
  availId = avail.id;
  draftId = draft.id;
});

afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'pubapi-' } } });
  await prisma.category.deleteMany({ where: { slug: { startsWith: 'pubapi-cat-' } } });
  await prisma.adminUser.deleteMany({ where: { email: 'pubapi@x.com' } });
  await prisma.$disconnect();
});

function req(url: string) {
  return new Request(`http://localhost${url}`);
}

describe('GET /api/products', () => {
  it('不带参数返回 AVAILABLE 列表', async () => {
    const res = await GET(req('/api/products'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items.find((p: { slug: string }) => p.slug === 'pubapi-w1')).toBeTruthy();
    expect(json.items.find((p: { slug: string }) => p.slug === 'pubapi-draft')).toBeFalsy();
  });

  it('支持 ?ids=a,b 模式（跳过过滤参数）', async () => {
    const res = await GET(req(`/api/products?ids=${availId},${draftId},no-such`));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.items).toHaveLength(1);
    expect(json.items[0].id).toBe(availId);
  });

  it('ids 为空返回 []', async () => {
    const res = await GET(req(`/api/products?ids=`));
    const json = await res.json();
    expect(json.items).toEqual([]);
  });

  it('支持 category slug 过滤', async () => {
    const res = await GET(req('/api/products?category=pubapi-cat-w'));
    const json = await res.json();
    expect(json.items.every((p: { slug: string }) => p.slug.startsWith('pubapi-'))).toBe(true);
  });

  it('非法 page 退化为 1', async () => {
    const res = await GET(req('/api/products?page=abc'));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.page).toBe(1);
  });
});
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
pnpm test tests/api/products.test.ts
```

Expected: FAIL — 模块 `@/app/api/products/route` 不存在。

- [ ] **Step 3: 实现 `src/app/api/products/route.ts`**

```ts
import { NextResponse } from 'next/server';
import { listPublicProducts, getPublicProductsByIds } from '@/lib/products';

function toPosInt(v: string | null, fallback: number): number {
  if (!v) return fallback;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : fallback;
}

function toNonNegNumber(v: string | null): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

function serialize(p: {
  id: string;
  slug: string;
  titleZh: string;
  titleEn: string | null;
  brand: string;
  price: { toString(): string };
  originalPrice: { toString(): string } | null;
  currency: string;
  condition: string;
  status: string;
  createdAt: Date;
  category: { slug: string; nameZh: string; nameEn: string };
  images: Array<{ url: string }>;
}) {
  return {
    id: p.id,
    slug: p.slug,
    titleZh: p.titleZh,
    titleEn: p.titleEn,
    brand: p.brand,
    price: p.price.toString(),
    originalPrice: p.originalPrice?.toString() ?? null,
    currency: p.currency,
    condition: p.condition,
    status: p.status,
    createdAt: p.createdAt.toISOString(),
    category: p.category,
    image: p.images[0]?.url ?? null
  };
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const idsParam = url.searchParams.get('ids');
  if (idsParam !== null) {
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const rows = await getPublicProductsByIds(ids);
    return NextResponse.json({ ok: true, items: rows.map(serialize) });
  }

  const page = toPosInt(url.searchParams.get('page'), 1);
  const pageSize = toPosInt(url.searchParams.get('pageSize'), 12);
  const result = await listPublicProducts({
    categorySlug: url.searchParams.get('category') ?? undefined,
    brand: url.searchParams.get('brand') ?? undefined,
    minPrice: toNonNegNumber(url.searchParams.get('minPrice')),
    maxPrice: toNonNegNumber(url.searchParams.get('maxPrice')),
    page,
    pageSize
  });
  return NextResponse.json({
    ok: true,
    items: result.items.map(serialize),
    total: result.total,
    page: result.page,
    pageSize: result.pageSize
  });
}
```

- [ ] **Step 4: 跑测试**

```bash
pnpm test tests/api/products.test.ts
```

Expected: PASS（5 个 it）。

- [ ] **Step 5: Commit**

```bash
git add src/app/api/products/route.ts tests/api/products.test.ts
git commit -m "feat: add public /api/products endpoint (list + by-ids)"
```

---

## Task 3: 工具 — `lib/format.ts` 和 `lib/favorites.ts`

**Files:**

- Create: `src/lib/format.ts`
- Create: `src/lib/favorites.ts`

> **背景**：价格/日期格式化在多个组件复用；favorites 客户端操作集中在一个文件里（localStorage 读写 + 一个用于跨组件同步的自定义事件 `lr:favorites-change`）。

- [ ] **Step 1: 写 `src/lib/format.ts`**

```ts
import type { Locale } from '@/i18n/config';

export function formatPriceCNY(value: string | number | null | undefined): string {
  if (value == null) return '';
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) return '';
  return new Intl.NumberFormat('zh-CN', {
    style: 'currency',
    currency: 'CNY',
    maximumFractionDigits: 0
  }).format(n);
}

export function pickLocalized(
  zh: string,
  en: string | null | undefined,
  locale: Locale | string
): string {
  if (locale === 'en') return en && en.trim() ? en : zh;
  return zh;
}

export function formatDate(d: Date | string, locale: Locale | string): string {
  const date = typeof d === 'string' ? new Date(d) : d;
  return new Intl.DateTimeFormat(locale === 'en' ? 'en-US' : 'zh-CN', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}
```

- [ ] **Step 2: 写 `src/lib/favorites.ts`**

```ts
'use client';

const KEY = 'lr_favorites';
const EVENT = 'lr:favorites-change';

function read(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return [];
    return raw.split(',').filter(Boolean);
  } catch {
    return [];
  }
}

function write(ids: string[]) {
  if (typeof window === 'undefined') return;
  try {
    if (ids.length === 0) window.localStorage.removeItem(KEY);
    else window.localStorage.setItem(KEY, ids.join(','));
    window.dispatchEvent(new CustomEvent(EVENT));
  } catch {
    // localStorage 不可用（隐私模式等）直接忽略
  }
}

export function getFavorites(): string[] {
  return read();
}

export function isFavorite(id: string): boolean {
  return read().includes(id);
}

export function toggleFavorite(id: string): boolean {
  const cur = read();
  const idx = cur.indexOf(id);
  if (idx >= 0) {
    cur.splice(idx, 1);
    write(cur);
    return false;
  }
  cur.push(id);
  write(cur);
  return true;
}

export function clearFavorites(): void {
  write([]);
}

export function setFavorites(ids: string[]): void {
  write(ids);
}

export function onFavoritesChange(cb: () => void): () => void {
  if (typeof window === 'undefined') return () => {};
  const handler = () => cb();
  window.addEventListener(EVENT, handler);
  window.addEventListener('storage', handler);
  return () => {
    window.removeEventListener(EVENT, handler);
    window.removeEventListener('storage', handler);
  };
}
```

- [ ] **Step 3: 验证 TS**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add src/lib/format.ts src/lib/favorites.ts
git commit -m "feat: add format helpers and favorites localStorage module"
```

---

## Task 4: i18n 文案扩展

**Files:**

- Modify: `messages/zh.json`, `messages/en.json`

> **背景**：M3 增加大量公开侧文案。集中加在 `public.*` 命名空间下，避免与 `nav.*` / `site.*` / `admin.*` 冲突。

- [ ] **Step 1: 替换 `messages/zh.json`**

```json
{
  "site": {
    "name": "二手奢侈品",
    "tagline": "精选二手奢品"
  },
  "nav": {
    "home": "首页",
    "products": "商品",
    "favorites": "收藏",
    "about": "关于",
    "contact": "联系"
  },
  "language": "语言",
  "footer": {
    "copyright": "© 2026 二手奢侈品。保留所有权利。"
  },
  "admin": {
    "loginTitle": "后台登录",
    "email": "邮箱",
    "password": "密码",
    "submit": "登录",
    "errorInvalid": "邮箱或密码错误",
    "errorLocked": "失败次数过多，请稍后再试",
    "dashboard": "仪表盘"
  },
  "public": {
    "home": {
      "heroTitle": "精选二手奢品",
      "heroSub": "经验证、可信赖、可议价。",
      "browseAll": "浏览全部",
      "latest": "最新上架",
      "categories": "分类",
      "viewAll": "查看全部"
    },
    "list": {
      "title": "全部商品",
      "empty": "暂无在售商品",
      "filter": "筛选",
      "apply": "应用",
      "reset": "重置",
      "category": "分类",
      "brand": "品牌",
      "anyCategory": "全部",
      "anyBrand": "全部",
      "minPrice": "最低价",
      "maxPrice": "最高价",
      "showing": "共 {total} 件",
      "page": "第 {page} / {pages} 页"
    },
    "detail": {
      "backToList": "返回列表",
      "brand": "品牌",
      "condition": "成色",
      "serial": "编号",
      "size": "尺寸",
      "originalPrice": "原价",
      "soldNote": "如商品当前不可购买，请联系我们了解最新状态。",
      "inquireCTA": "询价",
      "favorite": "收藏",
      "unfavorite": "取消收藏",
      "certs": "鉴定附件",
      "descTitle": "商品描述",
      "noDesc": "暂无描述"
    },
    "favorites": {
      "title": "我的收藏",
      "empty": "尚未收藏任何商品。",
      "clearAll": "清空收藏",
      "removed": "商品已下架，自动清理"
    },
    "about": {
      "title": "关于我们",
      "intro": "我们是一家专注于二手奢侈品的工作室，所有商品均经资深鉴定师把关。",
      "trustTitle": "为什么选择我们",
      "trust": [
        "经验证：每件商品配真伪鉴定附件",
        "可议价：透明价格，欢迎沟通",
        "可追溯：来源清晰，售后无忧"
      ]
    },
    "contact": {
      "title": "联系我们",
      "subtitle": "随时通过以下方式联系，我们会尽快回复。",
      "phone": "电话",
      "wechat": "微信号",
      "wechatQr": "微信二维码",
      "noContact": "联系方式尚未配置。",
      "formNote": "在线询价将于后续上线，目前请先用上方联系方式。"
    },
    "condition": {
      "NEW": "全新",
      "LIKE_NEW": "近全新",
      "EXCELLENT": "极佳",
      "GOOD": "良好",
      "FAIR": "一般"
    }
  }
}
```

- [ ] **Step 2: 替换 `messages/en.json`**

```json
{
  "site": {
    "name": "Luxury Resale",
    "tagline": "Curated pre-owned luxury"
  },
  "nav": {
    "home": "Home",
    "products": "Shop",
    "favorites": "Favorites",
    "about": "About",
    "contact": "Contact"
  },
  "language": "Language",
  "footer": {
    "copyright": "© 2026 Luxury Resale. All rights reserved."
  },
  "admin": {
    "loginTitle": "Admin Login",
    "email": "Email",
    "password": "Password",
    "submit": "Sign in",
    "errorInvalid": "Wrong email or password",
    "errorLocked": "Too many attempts, try again later",
    "dashboard": "Dashboard"
  },
  "public": {
    "home": {
      "heroTitle": "Curated pre-owned luxury",
      "heroSub": "Authenticated, trusted, negotiable.",
      "browseAll": "Browse all",
      "latest": "New arrivals",
      "categories": "Categories",
      "viewAll": "View all"
    },
    "list": {
      "title": "All products",
      "empty": "Nothing in stock right now.",
      "filter": "Filter",
      "apply": "Apply",
      "reset": "Reset",
      "category": "Category",
      "brand": "Brand",
      "anyCategory": "Any",
      "anyBrand": "Any",
      "minPrice": "Min price",
      "maxPrice": "Max price",
      "showing": "{total} items",
      "page": "Page {page} of {pages}"
    },
    "detail": {
      "backToList": "Back to list",
      "brand": "Brand",
      "condition": "Condition",
      "serial": "Serial",
      "size": "Size",
      "originalPrice": "Original",
      "soldNote": "If this item is unavailable, contact us for current status.",
      "inquireCTA": "Inquire",
      "favorite": "Save",
      "unfavorite": "Saved",
      "certs": "Authentication docs",
      "descTitle": "Description",
      "noDesc": "No description."
    },
    "favorites": {
      "title": "My favorites",
      "empty": "You haven't saved anything yet.",
      "clearAll": "Clear all",
      "removed": "Some saved items are no longer available and were removed."
    },
    "about": {
      "title": "About",
      "intro": "We are a studio specialising in pre-owned luxury, every piece vetted by senior authenticators.",
      "trustTitle": "Why us",
      "trust": [
        "Authenticated: every item ships with an authentication record",
        "Negotiable: transparent pricing, happy to discuss",
        "Traceable: clear provenance, after-sales support"
      ]
    },
    "contact": {
      "title": "Contact",
      "subtitle": "Reach out through any of the channels below.",
      "phone": "Phone",
      "wechat": "WeChat ID",
      "wechatQr": "WeChat QR",
      "noContact": "Contact details not yet configured.",
      "formNote": "Online inquiries are coming soon. For now, please reach out via the channels above."
    },
    "condition": {
      "NEW": "New",
      "LIKE_NEW": "Like New",
      "EXCELLENT": "Excellent",
      "GOOD": "Good",
      "FAIR": "Fair"
    }
  }
}
```

- [ ] **Step 3: 验证 typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add messages/zh.json messages/en.json
git commit -m "i18n: add public-site message keys (home/list/detail/favorites/about/contact/condition)"
```

---

## Task 5: `LocaleLink` + `ConditionBadge` + `PriceTag` 工具组件

**Files:**

- Create: `src/components/public/LocaleLink.tsx`
- Create: `src/components/public/ConditionBadge.tsx`
- Create: `src/components/public/PriceTag.tsx`

- [ ] **Step 1: 写 `LocaleLink.tsx`**

```tsx
import Link from 'next/link';
import { useLocale } from 'next-intl';
import type { ComponentProps } from 'react';

type Props = Omit<ComponentProps<typeof Link>, 'href'> & { href: string };

export function LocaleLink({ href, ...rest }: Props) {
  const locale = useLocale();
  const prefixed = href.startsWith('/') ? `/${locale}${href === '/' ? '' : href}` : href;
  return <Link href={prefixed} {...rest} />;
}
```

- [ ] **Step 2: 写 `ConditionBadge.tsx`**

```tsx
import { useTranslations } from 'next-intl';
import type { Condition } from '@prisma/client';

type Props = { condition: Condition; className?: string };

const TONE: Record<Condition, string> = {
  NEW: 'bg-bone-dark text-ink',
  LIKE_NEW: 'bg-bone-dark text-ink',
  EXCELLENT: 'border border-accent text-accent',
  GOOD: 'border border-line text-ink-soft',
  FAIR: 'border border-line text-ink-soft'
};

export function ConditionBadge({ condition, className = '' }: Props) {
  const t = useTranslations('public.condition');
  return (
    <span
      className={`inline-block text-[10px] tracking-widest uppercase px-2 py-0.5 ${TONE[condition]} ${className}`}
    >
      {t(condition)}
    </span>
  );
}
```

- [ ] **Step 3: 写 `PriceTag.tsx`**

```tsx
import { formatPriceCNY } from '@/lib/format';

type Props = {
  price: string | number;
  originalPrice?: string | number | null;
  size?: 'sm' | 'lg';
  className?: string;
};

export function PriceTag({ price, originalPrice, size = 'sm', className = '' }: Props) {
  const big = size === 'lg';
  return (
    <div className={`flex items-baseline gap-2 ${className}`}>
      <span
        className={`tabular-nums ${big ? 'font-serif text-2xl' : 'text-sm'} text-ink`}
      >
        {formatPriceCNY(price)}
      </span>
      {originalPrice && Number(originalPrice) > Number(price) && (
        <span
          className={`tabular-nums line-through text-ink-soft ${big ? 'text-base' : 'text-xs'}`}
        >
          {formatPriceCNY(originalPrice)}
        </span>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 验证 typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 5: Commit**

```bash
git add src/components/public/LocaleLink.tsx src/components/public/ConditionBadge.tsx src/components/public/PriceTag.tsx
git commit -m "feat(public): add LocaleLink, ConditionBadge, PriceTag"
```

---

## Task 6: `ProductCard` 组件

**Files:**

- Create: `src/components/public/ProductCard.tsx`

> **背景**：所有列表（首页"最新"、商品列表、收藏页）共用同一张卡片。Server component；图像用 `next/image`；标题按 locale 取，价格用 `PriceTag`。

- [ ] **Step 1: 写组件**

`src/components/public/ProductCard.tsx`:

```tsx
import Image from 'next/image';
import { useLocale } from 'next-intl';
import { LocaleLink } from './LocaleLink';
import { PriceTag } from './PriceTag';
import { pickLocalized } from '@/lib/format';

export type ProductCardData = {
  slug: string;
  titleZh: string;
  titleEn: string | null;
  brand: string;
  price: string | number;
  originalPrice?: string | number | null;
  image: string | null;
};

export function ProductCard({ product }: { product: ProductCardData }) {
  const locale = useLocale();
  const title = pickLocalized(product.titleZh, product.titleEn, locale);
  return (
    <LocaleLink
      href={`/products/${product.slug}`}
      className="group block"
      aria-label={title}
    >
      <div className="relative aspect-square bg-bone-dark overflow-hidden">
        {product.image ? (
          <Image
            src={product.image}
            alt={title}
            fill
            sizes="(max-width: 768px) 50vw, 25vw"
            className="object-cover transition-transform duration-500 group-hover:scale-[1.03]"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-xs text-ink-soft">
            no image
          </div>
        )}
      </div>
      <div className="mt-2 space-y-1">
        <div className="text-[10px] uppercase tracking-widest text-ink-soft">{product.brand}</div>
        <div className="text-sm leading-snug line-clamp-2">{title}</div>
        <PriceTag price={product.price} originalPrice={product.originalPrice} />
      </div>
    </LocaleLink>
  );
}
```

- [ ] **Step 2: 验证**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add src/components/public/ProductCard.tsx
git commit -m "feat(public): add ProductCard"
```

---

## Task 7: `PublicPagination` 组件（基于 URL 链接）

**Files:**

- Create: `src/components/public/PublicPagination.tsx`

> **背景**：admin 版的 `Pagination` 用 callback 改 React state；公开侧用 server-rendered 链接，刷新可分享。两者并存，名字区分。

- [ ] **Step 1: 写组件**

`src/components/public/PublicPagination.tsx`:

```tsx
import { LocaleLink } from './LocaleLink';

type Props = {
  page: number;
  pageSize: number;
  total: number;
  pathname: string;        // 不含 locale，例 "/products"
  searchParams: Record<string, string | undefined>;
};

function buildHref(
  pathname: string,
  base: Record<string, string | undefined>,
  page: number
): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) {
    if (v && k !== 'page') sp.set(k, v);
  }
  if (page > 1) sp.set('page', String(page));
  const qs = sp.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export function PublicPagination({ page, pageSize, total, pathname, searchParams }: Props) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  const prev = Math.max(1, page - 1);
  const next = Math.min(pages, page + 1);
  return (
    <nav className="flex items-center justify-center gap-3 text-xs tracking-wider mt-8">
      {page > 1 ? (
        <LocaleLink
          href={buildHref(pathname, searchParams, prev)}
          className="px-3 py-1 border border-line hover:bg-bone-dark"
        >
          ←
        </LocaleLink>
      ) : (
        <span className="px-3 py-1 border border-line opacity-30">←</span>
      )}
      <span className="tabular-nums">
        {page} / {pages}
      </span>
      {page < pages ? (
        <LocaleLink
          href={buildHref(pathname, searchParams, next)}
          className="px-3 py-1 border border-line hover:bg-bone-dark"
        >
          →
        </LocaleLink>
      ) : (
        <span className="px-3 py-1 border border-line opacity-30">→</span>
      )}
    </nav>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/public/PublicPagination.tsx
git commit -m "feat(public): add URL-based PublicPagination"
```

---

## Task 8: `FilterPanel`（移动抽屉 + 桌面侧栏）

**Files:**

- Create: `src/components/public/FilterPanel.tsx`

> **背景**：用一个 client component 同时承担桌面侧栏（始终可见）与移动抽屉（按钮触发）。提交时构造 querystring 走 `router.push`，让 server 组件重新渲染列表。

- [ ] **Step 1: 写组件**

`src/components/public/FilterPanel.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useTranslations } from 'next-intl';

export type FilterFacets = {
  categories: Array<{ slug: string; nameZh: string; nameEn: string }>;
  brands: string[];
};

type Props = {
  facets: FilterFacets;
  initial: {
    category?: string;
    brand?: string;
    minPrice?: string;
    maxPrice?: string;
  };
  locale: 'zh' | 'en';
};

export function FilterPanel({ facets, initial, locale }: Props) {
  const t = useTranslations('public.list');
  const router = useRouter();
  const pathname = usePathname();
  const [pending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  const [category, setCategory] = useState(initial.category ?? '');
  const [brand, setBrand] = useState(initial.brand ?? '');
  const [minPrice, setMinPrice] = useState(initial.minPrice ?? '');
  const [maxPrice, setMaxPrice] = useState(initial.maxPrice ?? '');

  function apply() {
    const sp = new URLSearchParams();
    if (category) sp.set('category', category);
    if (brand) sp.set('brand', brand);
    if (minPrice) sp.set('minPrice', minPrice);
    if (maxPrice) sp.set('maxPrice', maxPrice);
    const qs = sp.toString();
    startTransition(() => {
      router.push(qs ? `${pathname}?${qs}` : pathname);
    });
    setOpen(false);
  }

  function reset() {
    setCategory('');
    setBrand('');
    setMinPrice('');
    setMaxPrice('');
    startTransition(() => router.push(pathname));
    setOpen(false);
  }

  const form = (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        apply();
      }}
      className="space-y-4"
    >
      <label className="block text-xs tracking-widest uppercase text-ink-soft">
        {t('category')}
      </label>
      <select
        value={category}
        onChange={(e) => setCategory(e.target.value)}
        className="w-full border border-line px-3 py-2 text-sm bg-bone"
      >
        <option value="">{t('anyCategory')}</option>
        {facets.categories.map((c) => (
          <option key={c.slug} value={c.slug}>
            {locale === 'en' ? c.nameEn : c.nameZh}
          </option>
        ))}
      </select>

      <label className="block text-xs tracking-widest uppercase text-ink-soft">{t('brand')}</label>
      <select
        value={brand}
        onChange={(e) => setBrand(e.target.value)}
        className="w-full border border-line px-3 py-2 text-sm bg-bone"
      >
        <option value="">{t('anyBrand')}</option>
        {facets.brands.map((b) => (
          <option key={b} value={b}>
            {b}
          </option>
        ))}
      </select>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs tracking-widest uppercase text-ink-soft">
            {t('minPrice')}
          </label>
          <input
            inputMode="numeric"
            value={minPrice}
            onChange={(e) => setMinPrice(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-xs tracking-widest uppercase text-ink-soft">
            {t('maxPrice')}
          </label>
          <input
            inputMode="numeric"
            value={maxPrice}
            onChange={(e) => setMaxPrice(e.target.value.replace(/[^\d]/g, ''))}
            className="w-full border border-line px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="flex gap-2 pt-2">
        <button
          type="submit"
          disabled={pending}
          className="flex-1 bg-ink text-bone py-2 text-xs tracking-widest uppercase disabled:opacity-50"
        >
          {t('apply')}
        </button>
        <button
          type="button"
          onClick={reset}
          className="px-4 border border-line text-xs tracking-widest uppercase"
        >
          {t('reset')}
        </button>
      </div>
    </form>
  );

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden md:block w-56 shrink-0 border border-line p-4 sticky top-20 self-start">
        <div className="text-xs uppercase tracking-widest text-ink-soft mb-3">{t('filter')}</div>
        {form}
      </aside>

      {/* Mobile trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="md:hidden inline-flex items-center gap-2 border border-line px-3 py-2 text-xs tracking-widest uppercase"
      >
        {t('filter')}
      </button>

      {open && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="close"
            className="absolute inset-0 bg-black/40"
            onClick={() => setOpen(false)}
          />
          <div className="relative ml-auto w-80 max-w-full bg-bone h-full p-5 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <span className="text-xs uppercase tracking-widest">{t('filter')}</span>
              <button onClick={() => setOpen(false)} className="text-lg leading-none">
                ×
              </button>
            </div>
            {form}
          </div>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
pnpm typecheck
```

Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add src/components/public/FilterPanel.tsx
git commit -m "feat(public): add FilterPanel (mobile drawer + desktop sidebar)"
```

---

## Task 9: 商品列表页 `/[locale]/products`

**Files:**

- Create: `src/app/[locale]/products/page.tsx`

> **背景**：纯 server component。读 `searchParams` → 调 `listPublicProducts` + `getFacets` → 渲染 `FilterPanel` + 网格 + `PublicPagination`。

- [ ] **Step 1: 写页面**

`src/app/[locale]/products/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { listPublicProducts, getFacets } from '@/lib/products';
import { ProductCard } from '@/components/public/ProductCard';
import { FilterPanel } from '@/components/public/FilterPanel';
import { PublicPagination } from '@/components/public/PublicPagination';
import type { Locale } from '@/i18n/config';

type Search = {
  category?: string;
  brand?: string;
  minPrice?: string;
  maxPrice?: string;
  page?: string;
};

function toNum(v: string | undefined): number | undefined {
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
}

export default async function ProductsListPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: Locale }>;
  searchParams: Promise<Search>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const sp = await searchParams;
  const t = await getTranslations('public.list');

  const page = Math.max(1, Number(sp.page) || 1);
  const [result, facets] = await Promise.all([
    listPublicProducts({
      categorySlug: sp.category,
      brand: sp.brand,
      minPrice: toNum(sp.minPrice),
      maxPrice: toNum(sp.maxPrice),
      page,
      pageSize: 12
    }),
    getFacets()
  ]);

  const pages = Math.max(1, Math.ceil(result.total / result.pageSize));

  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <header className="flex items-end justify-between mb-6">
        <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
        <div className="text-xs text-ink-soft">
          {t('showing', { total: result.total })}
        </div>
      </header>

      <div className="md:flex md:gap-8">
        <FilterPanel
          facets={facets}
          initial={{
            category: sp.category,
            brand: sp.brand,
            minPrice: sp.minPrice,
            maxPrice: sp.maxPrice
          }}
          locale={locale}
        />
        <div className="md:flex-1 md:min-w-0 mt-4 md:mt-0">
          {result.items.length === 0 ? (
            <p className="text-center text-ink-soft py-16">{t('empty')}</p>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
                {result.items.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={{
                      slug: p.slug,
                      titleZh: p.titleZh,
                      titleEn: p.titleEn,
                      brand: p.brand,
                      price: p.price.toString(),
                      originalPrice: p.originalPrice?.toString() ?? null,
                      image: p.images[0]?.url ?? null
                    }}
                  />
                ))}
              </div>
              <div className="text-center text-xs text-ink-soft mt-6">
                {t('page', { page: result.page, pages })}
              </div>
              <PublicPagination
                page={result.page}
                pageSize={result.pageSize}
                total={result.total}
                pathname="/products"
                searchParams={{
                  category: sp.category,
                  brand: sp.brand,
                  minPrice: sp.minPrice,
                  maxPrice: sp.maxPrice
                }}
              />
            </>
          )}
        </div>
      </div>
    </section>
  );
}
```

> **注意**：`FilterPanel` 内部同时渲染桌面侧栏（`hidden md:block`）与移动触发按钮（`md:hidden`），所以**整个页面只渲染一次**即可。容器在桌面切到 `md:flex`，让 `<aside>` 与右侧网格成为同行的 flex item；在移动则是普通 block，触发按钮和网格上下排布。

- [ ] **Step 2: 启动 dev 服并人工核对**

```bash
pnpm dev
```

打开 http://localhost:3000/zh/products。

- 看到标题 "全部商品"、商品数计数、桌面侧栏筛选。
- 选筛选 → URL 出现参数 → 页面只显示匹配项。
- 切到 EN：http://localhost:3000/en/products，标题变 "All products"。

完成验证后 Ctrl-C 停服。

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/products/page.tsx
git commit -m "feat(public): add products list page with filters and pagination"
```

---

## Task 10: 首页 `/[locale]` 重写

**Files:**

- Modify: `src/app/[locale]/page.tsx`
- Create: `src/components/public/HomeHero.tsx`
- Create: `src/components/public/CategoryGrid.tsx`
- Create: `src/components/public/LatestStrip.tsx`

> **背景**：Spec §5.1 首页 = Hero + 分类入口 + 最新上架横滚 + 全部入口。

- [ ] **Step 1: 写 `HomeHero.tsx`**

`src/components/public/HomeHero.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { LocaleLink } from './LocaleLink';

export function HomeHero() {
  const t = useTranslations('public.home');
  return (
    <section className="container mx-auto px-4 py-16 md:py-28 text-center">
      <h1 className="font-serif text-4xl md:text-6xl tracking-wider">{t('heroTitle')}</h1>
      <p className="mt-4 text-ink-soft tracking-wide">{t('heroSub')}</p>
      <LocaleLink
        href="/products"
        className="inline-block mt-8 px-6 py-3 bg-ink text-bone text-xs tracking-widest uppercase hover:bg-accent"
      >
        {t('browseAll')}
      </LocaleLink>
    </section>
  );
}
```

- [ ] **Step 2: 写 `CategoryGrid.tsx`**

`src/components/public/CategoryGrid.tsx`:

```tsx
import { useLocale, useTranslations } from 'next-intl';
import { LocaleLink } from './LocaleLink';

type Cat = { slug: string; nameZh: string; nameEn: string };

export function CategoryGrid({ categories }: { categories: Cat[] }) {
  const locale = useLocale();
  const t = useTranslations('public.home');
  if (categories.length === 0) return null;
  return (
    <section className="container mx-auto px-4 py-10">
      <h2 className="font-serif text-2xl mb-6">{t('categories')}</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {categories.map((c) => (
          <LocaleLink
            key={c.slug}
            href={`/products?category=${encodeURIComponent(c.slug)}`}
            className="border border-line py-8 text-center hover:bg-bone-dark transition-colors"
          >
            <span className="text-sm tracking-wider">
              {locale === 'en' ? c.nameEn : c.nameZh}
            </span>
          </LocaleLink>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 3: 写 `LatestStrip.tsx`**

`src/components/public/LatestStrip.tsx`:

```tsx
import { useTranslations } from 'next-intl';
import { ProductCard, type ProductCardData } from './ProductCard';
import { LocaleLink } from './LocaleLink';

export function LatestStrip({ items }: { items: ProductCardData[] }) {
  const t = useTranslations('public.home');
  if (items.length === 0) return null;
  return (
    <section className="container mx-auto px-4 py-10">
      <div className="flex items-end justify-between mb-6">
        <h2 className="font-serif text-2xl">{t('latest')}</h2>
        <LocaleLink href="/products" className="text-xs tracking-widest uppercase text-ink-soft">
          {t('viewAll')} →
        </LocaleLink>
      </div>
      <div className="flex gap-4 overflow-x-auto pb-2 -mx-4 px-4 snap-x snap-mandatory md:grid md:grid-cols-4 md:overflow-visible md:snap-none">
        {items.map((p) => (
          <div key={p.slug} className="w-56 shrink-0 snap-start md:w-auto">
            <ProductCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
```

- [ ] **Step 4: 重写 `src/app/[locale]/page.tsx`**

```tsx
import { setRequestLocale } from 'next-intl/server';
import { getFacets, listLatestPublic } from '@/lib/products';
import { HomeHero } from '@/components/public/HomeHero';
import { CategoryGrid } from '@/components/public/CategoryGrid';
import { LatestStrip } from '@/components/public/LatestStrip';
import type { Locale } from '@/i18n/config';

export default async function HomePage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const [facets, latest] = await Promise.all([getFacets(), listLatestPublic(8)]);
  return (
    <>
      <HomeHero />
      <CategoryGrid categories={facets.categories} />
      <LatestStrip
        items={latest.map((p) => ({
          slug: p.slug,
          titleZh: p.titleZh,
          titleEn: p.titleEn,
          brand: p.brand,
          price: p.price.toString(),
          originalPrice: p.originalPrice?.toString() ?? null,
          image: p.images[0]?.url ?? null
        }))}
      />
    </>
  );
}
```

- [ ] **Step 5: 启动 dev 服检查**

```bash
pnpm dev
```

访问 http://localhost:3000/zh：Hero + 分类格 + 最新上架横滚。
访问 http://localhost:3000/en：英文版。

Ctrl-C 退出。

- [ ] **Step 6: Commit**

```bash
git add src/app/[locale]/page.tsx src/components/public/HomeHero.tsx src/components/public/CategoryGrid.tsx src/components/public/LatestStrip.tsx
git commit -m "feat(public): rewrite home with hero, categories, latest strip"
```

---

## Task 11: `ImageGallery` 组件（详情页轮播）

**Files:**

- Create: `src/components/public/ImageGallery.tsx`

> **背景**：客户端组件。主图 + 缩略图条；左右键、缩略图点击切换；移动端横滑（CSS scroll-snap）。

- [ ] **Step 1: 写组件**

`src/components/public/ImageGallery.tsx`:

```tsx
'use client';
import Image from 'next/image';
import { useState, useEffect } from 'react';

type Img = { id: string; url: string };

export function ImageGallery({ images, alt }: { images: Img[]; alt: string }) {
  const [idx, setIdx] = useState(0);
  useEffect(() => setIdx(0), [images]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (images.length <= 1) return;
      if (e.key === 'ArrowLeft') setIdx((i) => (i - 1 + images.length) % images.length);
      if (e.key === 'ArrowRight') setIdx((i) => (i + 1) % images.length);
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [images.length]);

  if (images.length === 0) {
    return <div className="aspect-square bg-bone-dark flex items-center justify-center text-ink-soft text-sm">no image</div>;
  }

  return (
    <div className="space-y-3">
      <div className="relative aspect-square bg-bone-dark overflow-hidden">
        <Image
          key={images[idx].id}
          src={images[idx].url}
          alt={alt}
          fill
          sizes="(max-width: 768px) 100vw, 50vw"
          priority
          className="object-cover"
        />
        {images.length > 1 && (
          <>
            <button
              type="button"
              aria-label="prev"
              onClick={() => setIdx((i) => (i - 1 + images.length) % images.length)}
              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-bone/80 backdrop-blur border border-line text-sm"
            >
              ‹
            </button>
            <button
              type="button"
              aria-label="next"
              onClick={() => setIdx((i) => (i + 1) % images.length)}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 bg-bone/80 backdrop-blur border border-line text-sm"
            >
              ›
            </button>
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[10px] tracking-wider bg-bone/80 px-2 py-0.5 border border-line tabular-nums">
              {idx + 1} / {images.length}
            </div>
          </>
        )}
      </div>
      {images.length > 1 && (
        <div className="flex gap-2 overflow-x-auto">
          {images.map((img, i) => (
            <button
              key={img.id}
              type="button"
              onClick={() => setIdx(i)}
              className={`relative w-16 h-16 shrink-0 border ${
                i === idx ? 'border-accent' : 'border-line'
              }`}
              aria-label={`image ${i + 1}`}
            >
              <Image src={img.url} alt="" fill sizes="64px" className="object-cover" />
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/public/ImageGallery.tsx
git commit -m "feat(public): add ImageGallery with keyboard nav and thumbnails"
```

---

## Task 12: `FavoriteButton` 组件

**Files:**

- Create: `src/components/public/FavoriteButton.tsx`

> **背景**：纯客户端心形按钮。初始读 `isFavorite`；点击调 `toggleFavorite`；订阅 `onFavoritesChange` 让多个按钮同步。

- [ ] **Step 1: 写组件**

`src/components/public/FavoriteButton.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { isFavorite, toggleFavorite, onFavoritesChange } from '@/lib/favorites';

type Props = { productId: string; className?: string };

export function FavoriteButton({ productId, className = '' }: Props) {
  const t = useTranslations('public.detail');
  const [active, setActive] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    setActive(isFavorite(productId));
    setReady(true);
    return onFavoritesChange(() => setActive(isFavorite(productId)));
  }, [productId]);

  function onClick() {
    const next = toggleFavorite(productId);
    setActive(next);
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={active ? t('unfavorite') : t('favorite')}
      className={`inline-flex items-center gap-2 border px-4 py-2 text-xs tracking-widest uppercase transition-colors ${
        active ? 'border-accent text-accent' : 'border-line text-ink-soft hover:text-ink'
      } ${className}`}
    >
      <span aria-hidden>{ready && active ? '♥' : '♡'}</span>
      <span>{active ? t('unfavorite') : t('favorite')}</span>
    </button>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/public/FavoriteButton.tsx
git commit -m "feat(public): add FavoriteButton (localStorage-backed)"
```

---

## Task 13: 商品详情页 `/[locale]/products/[slug]`

**Files:**

- Create: `src/app/[locale]/products/[slug]/page.tsx`

> **背景**：Server component。slug 查不到 → `notFound()`。布局：左侧图片 gallery，右侧元数据 + 价格 + CTA + 描述 + 鉴定附件折叠区。

- [ ] **Step 1: 写页面**

`src/app/[locale]/products/[slug]/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { getPublicProductBySlug } from '@/lib/products';
import { ImageGallery } from '@/components/public/ImageGallery';
import { PriceTag } from '@/components/public/PriceTag';
import { ConditionBadge } from '@/components/public/ConditionBadge';
import { FavoriteButton } from '@/components/public/FavoriteButton';
import { LocaleLink } from '@/components/public/LocaleLink';
import { pickLocalized } from '@/lib/format';
import type { Locale } from '@/i18n/config';

export default async function ProductDetailPage({
  params
}: {
  params: Promise<{ locale: Locale; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const p = await getPublicProductBySlug(slug);
  if (!p) notFound();
  const t = await getTranslations('public.detail');

  const title = pickLocalized(p.titleZh, p.titleEn, locale);
  const desc = pickLocalized(p.descZh ?? '', p.descEn, locale);
  const categoryName = pickLocalized(p.category.nameZh, p.category.nameEn, locale);

  const photos = p.images.filter((i) => i.kind === 'PHOTO');
  const certs = p.images.filter((i) => i.kind === 'CERT');
  const sizeInfo = p.sizeInfo as Record<string, string> | null;

  return (
    <article className="container mx-auto px-4 py-6 md:py-12">
      <LocaleLink href="/products" className="text-xs tracking-widest uppercase text-ink-soft">
        ← {t('backToList')}
      </LocaleLink>

      <div className="grid md:grid-cols-2 gap-8 md:gap-12 mt-4">
        <ImageGallery
          images={photos.map((i) => ({ id: i.id, url: i.url }))}
          alt={title}
        />

        <div className="space-y-6">
          <div>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{p.brand}</div>
            <h1 className="font-serif text-3xl md:text-4xl mt-1">{title}</h1>
            <div className="text-xs text-ink-soft mt-1">
              <LocaleLink
                href={`/products?category=${encodeURIComponent(p.category.slug)}`}
                className="hover:text-ink"
              >
                {categoryName}
              </LocaleLink>
            </div>
          </div>

          <PriceTag price={p.price.toString()} originalPrice={p.originalPrice?.toString() ?? null} size="lg" />

          <dl className="grid grid-cols-2 gap-y-3 text-sm border-t border-line pt-4">
            <dt className="text-ink-soft">{t('condition')}</dt>
            <dd>
              <ConditionBadge condition={p.condition} />
            </dd>
            {p.serialNumber && (
              <>
                <dt className="text-ink-soft">{t('serial')}</dt>
                <dd className="font-mono text-xs">{p.serialNumber}</dd>
              </>
            )}
            {sizeInfo && Object.keys(sizeInfo).length > 0 && (
              <>
                <dt className="text-ink-soft">{t('size')}</dt>
                <dd>
                  <ul className="text-xs space-y-0.5">
                    {Object.entries(sizeInfo).map(([k, v]) => (
                      <li key={k}>
                        <span className="text-ink-soft">{k}:</span> {String(v)}
                      </li>
                    ))}
                  </ul>
                </dd>
              </>
            )}
          </dl>

          <div className="flex flex-wrap gap-3">
            <LocaleLink
              href="/contact"
              className="inline-flex items-center px-6 py-2 bg-ink text-bone text-xs tracking-widest uppercase hover:bg-accent"
            >
              {t('inquireCTA')}
            </LocaleLink>
            <FavoriteButton productId={p.id} />
          </div>

          <section>
            <h2 className="text-xs uppercase tracking-widest text-ink-soft mb-2">
              {t('descTitle')}
            </h2>
            {desc ? (
              <p className="text-sm leading-relaxed whitespace-pre-line">{desc}</p>
            ) : (
              <p className="text-sm text-ink-soft">{t('noDesc')}</p>
            )}
          </section>

          {certs.length > 0 && (
            <details className="border border-line">
              <summary className="cursor-pointer px-4 py-3 text-xs uppercase tracking-widest hover:bg-bone-dark">
                {t('certs')} ({certs.length})
              </summary>
              <div className="grid grid-cols-3 gap-2 p-3 border-t border-line">
                {certs.map((c) => (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <a
                    key={c.id}
                    href={c.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block border border-line aspect-square"
                  >
                    <img
                      src={c.url}
                      alt="cert"
                      className="w-full h-full object-cover"
                    />
                  </a>
                ))}
              </div>
            </details>
          )}
        </div>
      </div>
    </article>
  );
}
```

> **注意**：`certs` 用普通 `<img>` + 链接打开原图，因为它们是附件预览，不走 next/image 优化（也避免给鉴定文件 next/image cache）。

- [ ] **Step 2: 启动 dev 服核对**

```bash
pnpm dev
```

- 找一个 AVAILABLE 商品的 slug（在后台 `/admin/products` 可看），访问 `/zh/products/<slug>`：图片左侧、信息右侧、面包屑回到列表、CTA 与收藏按钮可见。
- 访问不存在的 slug：404。
- 把后台某商品改成 DRAFT，再刷新详情页：404。

Ctrl-C 退出。

- [ ] **Step 3: Commit**

```bash
git add src/app/[locale]/products/[slug]/page.tsx
git commit -m "feat(public): add product detail page (gallery + meta + certs)"
```

---

## Task 14: 收藏夹页 `/[locale]/favorites`

**Files:**

- Create: `src/app/[locale]/favorites/page.tsx`
- Create: `src/components/public/FavoritesList.tsx`

> **背景**：page 是 server shell，文案统一；列表本身在客户端读 localStorage，再 `fetch('/api/products?ids=...')`。如果 server 已经删/下架了某个 id，自动从 localStorage 清掉并提示一次。

- [ ] **Step 1: 写 `FavoritesList.tsx`**

`src/components/public/FavoritesList.tsx`:

```tsx
'use client';
import { useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { ProductCard, type ProductCardData } from './ProductCard';
import { getFavorites, setFavorites, clearFavorites, onFavoritesChange } from '@/lib/favorites';

type ApiResp = { ok: true; items: Array<ProductCardData & { id: string }> };

export function FavoritesList() {
  const t = useTranslations('public.favorites');
  const [items, setItems] = useState<Array<ProductCardData & { id: string }> | null>(null);
  const [pruned, setPruned] = useState(false);

  async function load() {
    const ids = getFavorites();
    if (ids.length === 0) {
      setItems([]);
      return;
    }
    const res = await fetch(`/api/products?ids=${ids.map(encodeURIComponent).join(',')}`);
    const json = (await res.json()) as ApiResp;
    const returnedIds = new Set(json.items.map((i) => i.id));
    const missing = ids.filter((id) => !returnedIds.has(id));
    if (missing.length > 0) {
      setFavorites(ids.filter((id) => returnedIds.has(id)));
      setPruned(true);
    }
    setItems(json.items);
  }

  useEffect(() => {
    load();
    return onFavoritesChange(load);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (items === null) {
    return <p className="text-center text-ink-soft py-10">…</p>;
  }
  if (items.length === 0) {
    return <p className="text-center text-ink-soft py-16">{t('empty')}</p>;
  }
  return (
    <>
      {pruned && (
        <p className="text-xs text-ink-soft border border-line px-3 py-2 mb-4">{t('removed')}</p>
      )}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
        {items.map((p) => (
          <ProductCard key={p.id} product={p} />
        ))}
      </div>
      <div className="mt-8 text-center">
        <button
          type="button"
          onClick={() => {
            clearFavorites();
            setItems([]);
          }}
          className="text-xs tracking-widest uppercase text-ink-soft hover:text-ink"
        >
          {t('clearAll')}
        </button>
      </div>
    </>
  );
}
```

- [ ] **Step 2: 写 `src/app/[locale]/favorites/page.tsx`**

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { FavoritesList } from '@/components/public/FavoritesList';
import type { Locale } from '@/i18n/config';

export default async function FavoritesPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.favorites');
  return (
    <section className="container mx-auto px-4 py-8 md:py-12">
      <h1 className="font-serif text-3xl md:text-4xl mb-6">{t('title')}</h1>
      <FavoritesList />
    </section>
  );
}
```

- [ ] **Step 3: 手动验证**

```bash
pnpm dev
```

- 访问 `/zh/favorites`：显示"尚未收藏"。
- 进详情页点 ♡ → URL 变 ♥；返回 `/zh/favorites`：商品卡出现。
- 在后台把这件商品改成 SOLD 再回收藏页：商品消失 + "商品已下架，自动清理"提示。

Ctrl-C 退出。

- [ ] **Step 4: Commit**

```bash
git add src/components/public/FavoritesList.tsx src/app/[locale]/favorites/page.tsx
git commit -m "feat(public): add favorites page (localStorage + auto-prune stale ids)"
```

---

## Task 15: 关于页 `/[locale]/about`

**Files:**

- Create: `src/app/[locale]/about/page.tsx`

- [ ] **Step 1: 写页面**

`src/app/[locale]/about/page.tsx`:

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllSettings } from '@/lib/settings';
import { LocaleLink } from '@/components/public/LocaleLink';
import type { Locale } from '@/i18n/config';

export default async function AboutPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.about');
  const settings = await getAllSettings();
  const trust = t.raw('trust') as string[];

  return (
    <article className="container mx-auto px-4 py-10 md:py-16 max-w-2xl">
      <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
      <p className="mt-4 text-ink-soft leading-relaxed">{t('intro')}</p>

      <h2 className="font-serif text-xl mt-10">{t('trustTitle')}</h2>
      <ul className="mt-4 space-y-2 text-sm">
        {trust.map((line) => (
          <li key={line} className="flex gap-2">
            <span className="text-accent">·</span>
            <span>{line}</span>
          </li>
        ))}
      </ul>

      {(settings.contact_phone || settings.contact_wechat_id) && (
        <div className="mt-10 border-t border-line pt-6 text-sm">
          {settings.contact_phone && (
            <p>
              <span className="text-ink-soft mr-2">Tel.</span>
              {settings.contact_phone}
            </p>
          )}
          {settings.contact_wechat_id && (
            <p className="mt-1">
              <span className="text-ink-soft mr-2">WeChat.</span>
              {settings.contact_wechat_id}
            </p>
          )}
          <LocaleLink href="/contact" className="inline-block mt-4 text-xs tracking-widest uppercase text-accent">
            → contact
          </LocaleLink>
        </div>
      )}
    </article>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/app/[locale]/about/page.tsx
git commit -m "feat(public): add about page"
```

---

## Task 16: `ContactCard` + 联系页 `/[locale]/contact`

**Files:**

- Create: `src/components/public/ContactCard.tsx`
- Create: `src/app/[locale]/contact/page.tsx`

> **背景**：联系页只显示联系方式 + "在线询价后续上线"提示。InquiryDialog/form 是 M4。

- [ ] **Step 1: 写 `ContactCard.tsx`**

`src/components/public/ContactCard.tsx`:

```tsx
import Image from 'next/image';
import { useTranslations } from 'next-intl';

type Props = {
  phone?: string;
  wechatId?: string;
  wechatQrUrl?: string;
};

export function ContactCard({ phone, wechatId, wechatQrUrl }: Props) {
  const t = useTranslations('public.contact');
  const empty = !phone && !wechatId && !wechatQrUrl;
  if (empty) {
    return <p className="text-ink-soft text-sm">{t('noContact')}</p>;
  }
  return (
    <div className="grid md:grid-cols-2 gap-6 text-sm">
      <ul className="space-y-3">
        {phone && (
          <li>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{t('phone')}</div>
            <a href={`tel:${phone}`} className="font-serif text-2xl hover:text-accent">
              {phone}
            </a>
          </li>
        )}
        {wechatId && (
          <li>
            <div className="text-xs uppercase tracking-widest text-ink-soft">{t('wechat')}</div>
            <div className="font-mono">{wechatId}</div>
          </li>
        )}
      </ul>
      {wechatQrUrl && (
        <div>
          <div className="text-xs uppercase tracking-widest text-ink-soft mb-2">{t('wechatQr')}</div>
          <div className="relative w-48 h-48 border border-line">
            <Image src={wechatQrUrl} alt={t('wechatQr')} fill sizes="192px" className="object-contain" />
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: 写 `src/app/[locale]/contact/page.tsx`**

```tsx
import { setRequestLocale, getTranslations } from 'next-intl/server';
import { getAllSettings } from '@/lib/settings';
import { ContactCard } from '@/components/public/ContactCard';
import type { Locale } from '@/i18n/config';

export default async function ContactPage({
  params
}: {
  params: Promise<{ locale: Locale }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations('public.contact');
  const s = await getAllSettings();
  return (
    <section className="container mx-auto px-4 py-10 md:py-16 max-w-3xl">
      <h1 className="font-serif text-3xl md:text-4xl">{t('title')}</h1>
      <p className="mt-3 text-ink-soft">{t('subtitle')}</p>
      <div className="mt-8">
        <ContactCard
          phone={s.contact_phone || undefined}
          wechatId={s.contact_wechat_id || undefined}
          wechatQrUrl={s.contact_wechat_qr_url || undefined}
        />
      </div>
      <p className="mt-10 text-xs text-ink-soft border-t border-line pt-4">{t('formNote')}</p>
    </section>
  );
}
```

- [ ] **Step 3: 手动验证**

```bash
pnpm dev
```

- `/zh/contact`：联系卡。如果还没在后台填联系方式，应显示"联系方式尚未配置"。在 `/admin/settings` 填 phone/wechat/QR 后刷新，应展示。
- `/zh/about`：关于页。

Ctrl-C 退出。

- [ ] **Step 4: Commit**

```bash
git add src/components/public/ContactCard.tsx src/app/[locale]/contact/page.tsx
git commit -m "feat(public): add contact page with ContactCard"
```

---

## Task 17: 公开站点 E2E 烟雾测试

**Files:**

- Create: `tests/e2e/public-site.spec.ts`

> **背景**：覆盖关键流——首页 → 列表（看到卡片）→ 详情（看到标题）→ 加收藏 → 收藏页看到该商品 → 切语言保持页面结构。在 mobile-chrome project 下也要跑（公共站点是 mobile-first）。

- [ ] **Step 1: 写测试**

`tests/e2e/public-site.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { PrismaClient, Role, type Category, type AdminUser } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const EMAIL = 'e2e-public@x.com';
const CAT_SLUG = 'e2e-pub-cat';
const SLUG = 'e2e-pub-rolex';

let owner: AdminUser;
let cat: Category;

test.beforeAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-pub-' } } });
  const existingCat = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (existingCat) await prisma.category.delete({ where: { id: existingCat.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });

  owner = await prisma.adminUser.create({
    data: {
      email: EMAIL,
      name: 'e2e-pub',
      role: Role.OWNER,
      passwordHash: await bcrypt.hash('TestPass-789', 12)
    }
  });
  cat = await prisma.category.create({
    data: { slug: CAT_SLUG, nameZh: '手表 E2E', nameEn: 'Watches E2E', sortOrder: 50 }
  });
  await prisma.product.create({
    data: {
      slug: SLUG,
      titleZh: '劳力士 E2E',
      titleEn: 'Rolex E2E',
      brand: 'RolexE2E',
      categoryId: cat.id,
      price: '88000.00',
      currency: 'CNY',
      condition: 'EXCELLENT',
      status: 'AVAILABLE',
      uploadedById: owner.id
    }
  });
});

test.afterAll(async () => {
  await prisma.product.deleteMany({ where: { slug: { startsWith: 'e2e-pub-' } } });
  const c = await prisma.category.findFirst({ where: { slug: CAT_SLUG } });
  if (c) await prisma.category.delete({ where: { id: c.id } });
  await prisma.adminUser.deleteMany({ where: { email: EMAIL } });
  await prisma.$disconnect();
});

test('首页 → 列表 → 详情 → 收藏 → 收藏页', async ({ page }) => {
  await page.goto('/zh');
  await expect(page.getByRole('heading', { name: '精选二手奢品' })).toBeVisible();
  // Browse all
  await page.getByRole('link', { name: '浏览全部' }).first().click();
  await expect(page).toHaveURL(/\/zh\/products$/);
  await expect(page.getByRole('heading', { name: '全部商品' })).toBeVisible();

  // Detail
  await page.getByRole('link', { name: '劳力士 E2E' }).first().click();
  await expect(page).toHaveURL(new RegExp(`/zh/products/${SLUG}$`));
  await expect(page.getByRole('heading', { name: '劳力士 E2E' })).toBeVisible();

  // Favorite
  await page.getByRole('button', { name: '收藏' }).click();
  await expect(page.getByRole('button', { name: '取消收藏' })).toBeVisible();

  // Favorites page
  await page.goto('/zh/favorites');
  await expect(page.getByRole('heading', { name: '我的收藏' })).toBeVisible();
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});

test('切换语言保留页面', async ({ page }) => {
  await page.goto(`/zh/products/${SLUG}`);
  await page.getByRole('button', { name: 'EN' }).click();
  await expect(page).toHaveURL(new RegExp(`/en/products/${SLUG}$`));
  await expect(page.getByRole('heading', { name: 'Rolex E2E' })).toBeVisible();
});

test('筛选按品牌过滤（桌面侧栏）', async ({ page }, testInfo) => {
  // FilterPanel renders both the desktop sidebar and a mobile drawer trigger;
  // we drive only the visible (desktop) form here. On mobile-chrome the
  // sidebar is hidden via `hidden md:block`, so skip — the URL-driven
  // navigation itself is exercised by the next test.
  test.skip(testInfo.project.name === 'mobile-chrome', 'desktop sidebar only');
  await page.goto('/zh/products');
  const visibleSelects = page.locator('select:visible');
  await visibleSelects.nth(1).selectOption('RolexE2E'); // [category, brand]
  await page.getByRole('button', { name: '应用' }).click();
  await expect(page).toHaveURL(/brand=RolexE2E/);
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});

test('移动端通过 URL 直接命中筛选', async ({ page }) => {
  await page.goto('/zh/products?brand=RolexE2E');
  await expect(page.getByRole('link', { name: '劳力士 E2E' })).toBeVisible();
});
```

- [ ] **Step 2: 跑 E2E**

```bash
pnpm e2e tests/e2e/public-site.spec.ts
```

Expected: 4 个 test × 2 个 project = 8 个用例，其中"筛选按品牌过滤（桌面侧栏）"在 mobile-chrome 下跳过，**实际跑 7 通过 + 1 skip**。

如果"取消收藏"按钮没出现：检查 FavoriteButton 的 `aria-pressed` 是否切到 true（点击后 React 状态翻转即触发 aria-label/textContent 更新）。如果 mobile-chrome 上的"链接 名称"匹配不到：ProductCard 用 `aria-label={title}` 覆盖默认计算，应可命中。

- [ ] **Step 3: 跑完整 lint + typecheck + 单元/集成测试**

```bash
pnpm typecheck && pnpm lint && pnpm test
```

Expected: 全绿。

- [ ] **Step 4: Commit**

```bash
git add tests/e2e/public-site.spec.ts
git commit -m "test(e2e): add public site smoke (home/list/detail/favorites/i18n/filter)"
```

---

## Task 18: README 收尾

**Files:**

- Modify: `README.md`

- [ ] **Step 1: 编辑 README**

把当前 README 顶部 milestones 段落替换为：

```markdown
# Luxury Resale

二手奢侈品展示网站。

**M1**：脚手架 + 双语 i18n + 移动端为主的公开站点骨架 + 后台登录 + JWT 鉴权。
**M2**：后台完整 CRUD（商品/分类/Settings/Users + 图片上传）。
**M3**：公开站点（首页 / 商品列表 + 筛选 / 商品详情 / 收藏夹 / 关于 / 联系）。
```

并在"注意"段后追加：

```markdown
- **公开站点路径**：`/zh`（默认）、`/en`。商品详情 `/[locale]/products/[slug]`。
- **收藏夹**：纯客户端 localStorage（key=`lr_favorites`），无服务端账号。
- **询价**：M3 联系页只展示联系方式；在线询价（弹窗+表单+`/api/inquiries`+`/admin/inquiries`）属 M4。
```

- [ ] **Step 2: 跑最终验证**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm e2e
```

Expected: 全绿。

- [ ] **Step 3: Commit**

```bash
git add README.md
git commit -m "docs: README — mark M3 done"
```

---

## M3 验收清单

- [ ] `/zh` 与 `/en` 首页展示 Hero + 分类入口 + 最新上架横滚 + "浏览全部" CTA
- [ ] `/[locale]/products` 显示 AVAILABLE 商品网格，移动端有筛选抽屉，桌面端有左侧筛选栏；筛选写入 URL，刷新可分享
- [ ] 商品列表分页用 URL 参数（不靠客户端 state）
- [ ] `/[locale]/products/[slug]` 显示图片轮播（PHOTO 图）、双语标题/品牌/价格/原价/成色徽章、尺寸 JSON、序列号、CERT 折叠区、询价 CTA（到 /contact）、收藏按钮
- [ ] 非 AVAILABLE 的商品详情返回 404
- [ ] `/[locale]/favorites` 从 localStorage 读取 ids，调 `/api/products?ids=...`，渲染卡片；下架/删除的 id 自动清理并提示
- [ ] `/[locale]/about` 展示介绍 + 信任清单（i18n 数组）+ 联系方式预览
- [ ] `/[locale]/contact` 展示电话 / 微信号 / 二维码（来自 settings），并说明在线询价后续上线
- [ ] 语言切换在所有公开页保持当前路径
- [ ] `pnpm typecheck` / `lint` / `test` / `e2e` 全绿

## M3 自审备注

- **占位符扫描**：plan 里无 TBD/TODO；CERT 区用普通 `<img>` 是显式选择（非 next/image 优化）；询价 CTA 落到 `/contact` 是显式占位，M4 替换为 InquiryDialog。
- **类型/命名一致**：`listPublicProducts` / `getPublicProductBySlug` / `getPublicProductsByIds` / `getFacets` / `listLatestPublic` / `PublicListFilter` / `ProductCardData` / `FilterFacets` / `getFavorites` / `toggleFavorite` / `onFavoritesChange` 在所有 Task 引用一致。
- **关键 spec 覆盖**：§4.1（列表 URL searchParams 服务端渲染）✓；§4.4（语言切换在 `LanguageSwitch` 中已实现）✓；§4.5（收藏 localStorage + 按 ids 批量取）✓；§5.1 表所有 6 个公共路径都建好 ✓；§6.1（next/image fallback 用 `bg-bone-dark` 占位 + 卡片 alt；详情 404 通过 `notFound()`）✓。
- **明确推迟到 M4**：InquiryDialog / `/api/inquiries` / `/admin/inquiries` / Toast / CSP 完整化 / SEO sitemap / 错误边界 `error.tsx` 完整化 / 备案号占位填真值 / 部署。
- **图片优化**：商品图与 QR 走 `next/image` `fill` + `sizes`，CERT 附件走原生 `<img>` 以避免缓存大量鉴定材料。
- **数据完整性**：所有公共查询硬编码 `status: 'AVAILABLE'`，避免 DRAFT/SOLD/RESERVED/ARCHIVED 泄露；`getPublicProductBySlug` 双重校验（数据库查 + status 检查）。
- **测试**：单元层 `products-public.test.ts` 覆盖过滤/分页/可见性；API 层 `products.test.ts` 覆盖 list + ids 模式；E2E 覆盖首页→列表→详情→收藏 + 语言切换 + 筛选。

---

## 执行方式选择

计划已保存到 `docs/superpowers/plans/2026-05-17-m3-public-site.md`。两种执行方式：

1. **Subagent-Driven** —— 每 Task 派 subagent，两阶段评审。M1 全程、M2 早期用过。
2. **Inline 执行** —— 在当前会话直接跑（用 `executing-plans`）。M2 后半段节奏快用过。

按 M1/M2 经验：UI 任务（如 Task 6/8/9/11）单元逻辑少、视觉验证多，inline 更划算；带 server query + 测试的任务（Task 1/2/13/17）两种都行。

**你选哪种？**
