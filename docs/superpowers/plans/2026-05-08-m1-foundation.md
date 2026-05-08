# M1 基础设施实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭建 Next.js 14 + TS + Tailwind + Prisma + PostgreSQL 项目骨架，落地 Prisma schema、i18n 框架、设计令牌、全站组件（Header/Footer/MobileBottomBar）、JWT 鉴权与管理员登录页，使站点可访问 `/zh` 占位首页与 `/admin` 登录 → 仪表盘占位页。

**Architecture:** 单仓库 Next.js App Router 应用，公开站点走 `/[locale]` 路由（`zh` / `en`），后台走 `/admin` 路由（仅中文）。通过 Next.js middleware 同时处理 i18n 重定向与 `/admin/**` 鉴权。Prisma 直连 TencentDB PostgreSQL（本地用 Docker compose 起 PG）。

**Tech Stack:** Next.js 14、TypeScript、Tailwind CSS、Prisma、PostgreSQL、next-intl、Zod、bcryptjs、jose（JWT）、pino、Vitest、Playwright、pnpm。

参考设计文档：`docs/superpowers/specs/2026-05-08-secondhand-luxury-site-design.md`。

---

## 前置假设

- 工作目录：`/Users/bytedance/Private/Web`（已 `git init`，已有设计文档 commit）
- 本地已安装：Node.js ≥ 20.x、pnpm ≥ 9.x、Docker Desktop
- 若未安装 pnpm：`npm install -g pnpm`
- 若未安装 Docker：从 https://www.docker.com 下载 Docker Desktop

---

## 目录结构（M1 完成后）

```
.
├── .env.example
├── .env.local                  # 本地不进 git
├── .gitignore
├── docker-compose.yml          # 本地 PG
├── eslint.config.mjs
├── next.config.mjs
├── package.json
├── playwright.config.ts
├── pnpm-lock.yaml
├── postcss.config.mjs
├── prisma/
│   ├── schema.prisma
│   ├── migrations/...
│   └── seed.ts
├── tailwind.config.ts
├── tsconfig.json
├── vitest.config.ts
├── messages/
│   ├── en.json
│   └── zh.json
├── public/
│   └── (静态资源占位)
├── src/
│   ├── app/
│   │   ├── layout.tsx              # 根布局（含 fonts）
│   │   ├── globals.css             # Tailwind 入口 + 设计令牌
│   │   ├── [locale]/
│   │   │   ├── layout.tsx          # 公开站点布局（Header/Footer/MobileBottomBar）
│   │   │   └── page.tsx            # 首页占位
│   │   ├── admin/
│   │   │   ├── layout.tsx          # AdminLayout（侧栏+顶栏）
│   │   │   ├── page.tsx            # 仪表盘占位
│   │   │   └── login/page.tsx      # 登录页
│   │   └── api/
│   │       └── admin/
│   │           └── login/route.ts  # 登录 API
│   ├── components/
│   │   ├── public/
│   │   │   ├── Header.tsx
│   │   │   ├── Footer.tsx
│   │   │   ├── MobileBottomBar.tsx
│   │   │   └── LanguageSwitch.tsx
│   │   └── admin/
│   │       └── AdminLayout.tsx
│   ├── lib/
│   │   ├── auth.ts                 # JWT 签发/校验、bcrypt
│   │   ├── prisma.ts               # Prisma client 单例
│   │   ├── rate-limit.ts           # 内存限流
│   │   ├── logger.ts               # pino logger
│   │   └── i18n.ts                 # next-intl 辅助
│   ├── i18n/
│   │   ├── config.ts               # locales 列表
│   │   └── request.ts              # next-intl 请求侧配置
│   └── middleware.ts               # i18n + 鉴权
└── tests/
    ├── lib/
    │   ├── auth.test.ts
    │   └── rate-limit.test.ts
    ├── api/
    │   └── admin-login.test.ts
    └── e2e/
        └── admin-login.spec.ts
```

---

## Task 1: 初始化 Next.js + TypeScript 工程

**Files:**

- Create: `package.json`, `tsconfig.json`, `next.config.mjs`, `.gitignore`, `src/app/layout.tsx`, `src/app/page.tsx`, `src/app/globals.css`

- [ ] **Step 1: 用 pnpm 创建 Next.js 项目（手动）**

由于目录非空（已有 `docs/`），不能用 `create-next-app`。手动初始化。

Run:

```bash
cd /Users/bytedance/Private/Web
pnpm init
```

- [ ] **Step 2: 编辑 `package.json`**

```json
{
  "name": "luxury-resale",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint",
    "typecheck": "tsc --noEmit",
    "test": "vitest run",
    "test:watch": "vitest",
    "e2e": "playwright test",
    "db:dev": "docker compose up -d",
    "db:migrate": "prisma migrate dev",
    "db:seed": "tsx prisma/seed.ts",
    "db:studio": "prisma studio"
  },
  "engines": {
    "node": ">=20.0.0"
  }
}
```

- [ ] **Step 3: 安装核心依赖**

Run:

```bash
pnpm add next@14 react@18 react-dom@18
pnpm add -D typescript @types/node @types/react @types/react-dom
```

- [ ] **Step 4: 创建 `tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": false,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": {
      "@/*": ["./src/*"],
      "@tests/*": ["./tests/*"]
    }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: 创建 `next.config.mjs`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.myqcloud.com' },
      { protocol: 'https', hostname: '*.cos.ap-shanghai.myqcloud.com' }
    ]
  }
};

export default nextConfig;
```

- [ ] **Step 6: 创建 `.gitignore`**

```
# deps
node_modules/

# next
.next/
out/

# env
.env
.env.local
.env*.local

# logs
*.log
npm-debug.log*
pnpm-debug.log*

# os
.DS_Store

# editor
.vscode/
.idea/

# build artifacts
*.tsbuildinfo
next-env.d.ts

# test
coverage/
playwright-report/
test-results/

# prisma
/prisma/migrations/dev.db*
```

- [ ] **Step 7: 创建最小可启动占位页面**

`src/app/layout.tsx`:

```tsx
import './globals.css';

export const metadata = {
  title: 'Luxury Resale',
  description: 'Curated pre-owned luxury'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh">
      <body>{children}</body>
    </html>
  );
}
```

`src/app/page.tsx`:

```tsx
export default function RootPage() {
  return <main>Bootstrapping…</main>;
}
```

`src/app/globals.css`:

```css
body {
  font-family: system-ui, sans-serif;
}
```

- [ ] **Step 8: 验证启动**

Run:

```bash
pnpm dev
```

打开 http://localhost:3000，看到 "Bootstrapping…"。Ctrl+C 停止。

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "chore: initialize next.js project with typescript"
```

---

## Task 2: Tailwind CSS + 设计令牌

**Files:**

- Create: `tailwind.config.ts`, `postcss.config.mjs`
- Modify: `src/app/globals.css`, `package.json`

- [ ] **Step 1: 安装 Tailwind**

Run:

```bash
pnpm add -D tailwindcss postcss autoprefixer
```

- [ ] **Step 2: 创建 `tailwind.config.ts`**

```ts
import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/app/**/*.{ts,tsx}', './src/components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: {
          DEFAULT: '#111111',
          soft: '#3a3a3a'
        },
        bone: {
          DEFAULT: '#faf8f5',
          dark: '#efeae3'
        },
        accent: {
          DEFAULT: '#8a6d3b',
          dark: '#6b5328'
        },
        line: '#e5e1d8'
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        serif: ['var(--font-serif)', 'Georgia', 'serif']
      },
      borderRadius: {
        DEFAULT: '2px',
        md: '4px',
        lg: '8px'
      },
      letterSpacing: {
        wide: '0.06em',
        wider: '0.12em'
      }
    }
  },
  plugins: []
};

export default config;
```

- [ ] **Step 3: 创建 `postcss.config.mjs`**

```js
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {}
  }
};
```

- [ ] **Step 4: 重写 `src/app/globals.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  html {
    color-scheme: light;
  }
  body {
    @apply bg-bone text-ink antialiased;
  }
  ::selection {
    @apply bg-ink text-bone;
  }
}
```

- [ ] **Step 5: 验证 Tailwind 生效**

修改 `src/app/page.tsx`：

```tsx
export default function RootPage() {
  return (
    <main className="min-h-screen flex items-center justify-center font-serif text-2xl tracking-wider">
      Bootstrapping…
    </main>
  );
}
```

Run `pnpm dev`，确认页面字体变成 serif、背景米白。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: add tailwind with luxury design tokens"
```

---

## Task 3: Google Fonts（next/font）

**Files:**

- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 引入 Inter（sans）+ Playfair Display（serif）**

`src/app/layout.tsx`:

```tsx
import './globals.css';
import { Inter, Playfair_Display } from 'next/font/google';

const sans = Inter({
  subsets: ['latin'],
  variable: '--font-sans',
  display: 'swap'
});

const serif = Playfair_Display({
  subsets: ['latin'],
  variable: '--font-serif',
  display: 'swap'
});

export const metadata = {
  title: 'Luxury Resale',
  description: 'Curated pre-owned luxury'
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh" className={`${sans.variable} ${serif.variable}`}>
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: 验证字体加载**

`pnpm dev` → 检查 DevTools → Network → 看到 fonts.googleapis.com 请求；页面字体改变。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore: load inter + playfair via next/font"
```

---

## Task 4: ESLint + Prettier

**Files:**

- Create: `eslint.config.mjs`, `.prettierrc`, `.prettierignore`

- [ ] **Step 1: 安装**

```bash
pnpm add -D eslint eslint-config-next prettier
```

- [ ] **Step 2: 创建 `eslint.config.mjs`**

```js
import { FlatCompat } from '@eslint/eslintrc';
const compat = new FlatCompat({ baseDirectory: import.meta.dirname });
export default [...compat.extends('next/core-web-vitals', 'next/typescript')];
```

如果 FlatCompat 引入失败，回退 `.eslintrc.json`：

```json
{ "extends": ["next/core-web-vitals", "next/typescript"] }
```

（Next.js 14 仍支持旧格式。）

- [ ] **Step 3: 创建 `.prettierrc`**

```json
{
  "semi": true,
  "singleQuote": true,
  "trailingComma": "none",
  "printWidth": 100,
  "tabWidth": 2,
  "arrowParens": "always"
}
```

- [ ] **Step 4: 创建 `.prettierignore`**

```
.next
node_modules
pnpm-lock.yaml
prisma/migrations
playwright-report
test-results
coverage
```

- [ ] **Step 5: 跑一次格式化 + lint**

```bash
pnpm prettier --write .
pnpm lint
```

确认无错误。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: configure eslint and prettier"
```

---

## Task 5: 环境变量

**Files:**

- Create: `.env.example`, `.env` (本地，不入 git)

> **为什么用 `.env` 而非 `.env.local`**：Prisma CLI 默认只读 `.env`，Next.js 同时读 `.env` 和 `.env.local`。统一用 `.env` 可避免 `pnpm db:migrate` 找不到 `DATABASE_URL`。`.gitignore` 已排除 `.env`。

- [ ] **Step 1: 创建 `.env.example`**

```bash
# Database
DATABASE_URL=postgresql://luxury:luxury@localhost:5432/luxury?schema=public

# JWT
JWT_SECRET=dev-secret-change-me-min-32-bytes-required-here
JWT_EXPIRES_IN=7d

# Tencent Cloud COS (M2 用，先占位)
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=
COS_DOMAIN=

# Logging
LOG_LEVEL=debug
NODE_ENV=development
```

- [ ] **Step 2: 复制为 `.env`**

```bash
cp .env.example .env
```

随机生成一个 JWT secret 并填入 `.env`：

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```

把输出粘到 `.env` 的 `JWT_SECRET=` 后面。

- [ ] **Step 3: 验证 `.gitignore` 排除 `.env`**

```bash
git status
```

`.env` 不应出现在 untracked 列表中（被 `.gitignore` 排除）。

- [ ] **Step 4: Commit**

```bash
git add .env.example
git commit -m "chore: add environment template"
```

---

## Task 6: Docker Compose 本地 PostgreSQL

**Files:**

- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 `docker-compose.yml`**

```yaml
services:
  postgres:
    image: postgres:16-alpine
    container_name: luxury-pg
    restart: unless-stopped
    environment:
      POSTGRES_USER: luxury
      POSTGRES_PASSWORD: luxury
      POSTGRES_DB: luxury
    ports:
      - '5432:5432'
    volumes:
      - luxury-pg-data:/var/lib/postgresql/data

volumes:
  luxury-pg-data:
```

- [ ] **Step 2: 启动并验证**

```bash
docker compose up -d
docker exec luxury-pg pg_isready -U luxury
```

应输出 `accepting connections`。

- [ ] **Step 3: Commit**

```bash
git add docker-compose.yml
git commit -m "chore: add docker compose for local postgres"
```

---

## Task 7: Prisma 初始化与 schema

**Files:**

- Create: `prisma/schema.prisma`

- [ ] **Step 1: 安装 Prisma**

```bash
pnpm add -D prisma tsx
pnpm add @prisma/client
```

- [ ] **Step 2: 初始化 Prisma**

```bash
pnpm prisma init --datasource-provider postgresql
```

这会生成 `prisma/schema.prisma` 并尝试改 `.env`。如果 `prisma init` 在 `.env` 末尾追加了重复 `DATABASE_URL`，删掉新加的那行（保留 Task 5 创建的）。

- [ ] **Step 3: 编写完整 schema**

`prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum Role {
  OWNER
  ADMIN
}

enum Condition {
  NEW
  LIKE_NEW
  EXCELLENT
  GOOD
  FAIR
}

enum ProductStatus {
  DRAFT
  AVAILABLE
  RESERVED
  SOLD
  ARCHIVED
}

enum ImageKind {
  PHOTO
  CERT
}

enum InquiryStatus {
  NEW
  READ
  REPLIED
}

model AdminUser {
  id           String   @id @default(cuid())
  email        String   @unique
  passwordHash String
  name         String
  role         Role     @default(ADMIN)
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt
  products     Product[]
}

model Category {
  id        String    @id @default(cuid())
  slug      String    @unique
  nameZh    String
  nameEn    String
  icon      String?
  sortOrder Int       @default(0)
  products  Product[]
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
}

model Product {
  id            String        @id @default(cuid())
  slug          String        @unique
  titleZh       String
  titleEn       String?
  descZh        String?       @db.Text
  descEn        String?       @db.Text
  brand         String
  categoryId    String
  category      Category      @relation(fields: [categoryId], references: [id])
  price         Decimal       @db.Decimal(10, 2)
  originalPrice Decimal?      @db.Decimal(10, 2)
  currency      String        @default("CNY")
  condition     Condition
  sizeInfo      Json?
  serialNumber  String?
  status        ProductStatus @default(DRAFT)
  uploadedById  String
  uploadedBy    AdminUser     @relation(fields: [uploadedById], references: [id])
  images        Image[]
  inquiries     Inquiry[]
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt
  soldAt        DateTime?

  @@index([status, createdAt(sort: Desc)])
  @@index([brand])
  @@index([categoryId])
}

model Image {
  id        String    @id @default(cuid())
  productId String
  product   Product   @relation(fields: [productId], references: [id], onDelete: Cascade)
  url       String
  kind      ImageKind @default(PHOTO)
  sortOrder Int       @default(0)

  @@index([productId])
}

model Inquiry {
  id        String        @id @default(cuid())
  productId String?
  product   Product?      @relation(fields: [productId], references: [id], onDelete: SetNull)
  name      String
  contact   String
  message   String        @db.Text
  locale    String
  status    InquiryStatus @default(NEW)
  ipHash    String
  createdAt DateTime      @default(now())

  @@index([status, createdAt(sort: Desc)])
}

model Setting {
  key       String   @id
  value     String   @db.Text
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 4: 跑迁移**

```bash
pnpm db:migrate -- --name init
```

（脚本里的 `db:migrate` 是 `prisma migrate dev`。）

如果命令报错 `--` 解析问题，直接：

```bash
pnpm prisma migrate dev --name init
```

应生成 `prisma/migrations/<时间戳>_init/migration.sql`。

- [ ] **Step 5: 验证表已创建**

```bash
docker exec luxury-pg psql -U luxury -d luxury -c "\dt"
```

应看到 8 张表（外加 `_prisma_migrations`）。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(db): add prisma schema and initial migration"
```

---

## Task 8: Prisma Client 单例

**Files:**

- Create: `src/lib/prisma.ts`

- [ ] **Step 1: 创建单例**

```ts
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error']
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
```

- [ ] **Step 2: 验证类型可解析**

```bash
pnpm typecheck
```

应通过。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat: add prisma client singleton"
```

---

## Task 9: pino 日志

**Files:**

- Create: `src/lib/logger.ts`

- [ ] **Step 1: 安装**

```bash
pnpm add pino
pnpm add -D pino-pretty
```

- [ ] **Step 2: 创建 logger**

```ts
import pino from 'pino';

const isDev = process.env.NODE_ENV === 'development';

export const logger = pino({
  level: process.env.LOG_LEVEL ?? (isDev ? 'debug' : 'info'),
  transport: isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'SYS:HH:MM:ss' } }
    : undefined,
  base: { service: 'luxury-resale' }
});
```

- [ ] **Step 3: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat: add pino logger"
```

---

## Task 10: 安装 Vitest 并写第一个测试（rate-limit）

**Files:**

- Create: `vitest.config.ts`, `src/lib/rate-limit.ts`, `tests/lib/rate-limit.test.ts`

- [ ] **Step 1: 安装**

```bash
pnpm add -D vitest @vitest/ui
```

- [ ] **Step 2: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    exclude: ['tests/e2e/**']
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@tests': fileURLToPath(new URL('./tests', import.meta.url))
    }
  }
});
```

- [ ] **Step 3: 写测试（先失败）**

`tests/lib/rate-limit.test.ts`:

```ts
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
```

- [ ] **Step 4: 跑测试，应失败**

```bash
pnpm test
```

应报错：`Cannot find module '@/lib/rate-limit'`。

- [ ] **Step 5: 实现 rate-limit**

`src/lib/rate-limit.ts`:

```ts
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
```

- [ ] **Step 6: 跑测试，应通过**

```bash
pnpm test
```

4 passed。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add in-memory rate limiter"
```

---

## Task 11: 认证工具（bcrypt + JWT）

**Files:**

- Create: `src/lib/auth.ts`, `tests/lib/auth.test.ts`

- [ ] **Step 1: 安装**

```bash
pnpm add bcryptjs jose
pnpm add -D @types/bcryptjs
```

> 用 `bcryptjs`（纯 JS）而非 `bcrypt`（原生），避免部署到 Lighthouse 时的 native binding 问题。

- [ ] **Step 2: 写测试**

`tests/lib/auth.test.ts`:

```ts
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
```

- [ ] **Step 3: 跑测试，应失败**

```bash
pnpm test tests/lib/auth.test.ts
```

- [ ] **Step 4: 实现 auth**

`src/lib/auth.ts`:

```ts
import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';

const BCRYPT_COST = 12;

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_COST);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export type SessionPayload = {
  userId: string;
  role: 'OWNER' | 'ADMIN';
};

function getSecret(): Uint8Array {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32) {
    throw new Error('JWT_SECRET missing or too short (need >=32 bytes)');
  }
  return new TextEncoder().encode(s);
}

export async function signSession(payload: SessionPayload): Promise<string> {
  const exp = process.env.JWT_EXPIRES_IN ?? '7d';
  return new SignJWT(payload as unknown as Record<string, unknown>)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(exp)
    .sign(getSecret());
}

export async function verifySession(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, getSecret());
    if (typeof payload.userId !== 'string') return null;
    if (payload.role !== 'OWNER' && payload.role !== 'ADMIN') return null;
    return { userId: payload.userId, role: payload.role };
  } catch {
    return null;
  }
}

export const SESSION_COOKIE = 'lr_session';
```

- [ ] **Step 5: 跑测试，应通过**

```bash
pnpm test tests/lib/auth.test.ts
```

6 passed。

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: add jwt + bcrypt auth utilities"
```

---

## Task 12: Seed 脚本（创建初始 OWNER）

**Files:**

- Create: `prisma/seed.ts`

- [ ] **Step 1: 编写 seed**

`prisma/seed.ts`:

```ts
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword } from '../src/lib/auth';
import * as crypto from 'node:crypto';

const prisma = new PrismaClient();

async function main() {
  const email = process.env.SEED_OWNER_EMAIL ?? 'owner@example.com';
  const tempPassword = crypto.randomBytes(9).toString('base64url');

  const existing = await prisma.adminUser.findUnique({ where: { email } });
  if (existing) {
    console.log(`Owner ${email} 已存在，跳过 seed。`);
    return;
  }

  await prisma.adminUser.create({
    data: {
      email,
      name: 'Owner',
      role: Role.OWNER,
      passwordHash: await hashPassword(tempPassword)
    }
  });

  console.log('============================================');
  console.log(' 初始 OWNER 账号已创建');
  console.log(`  Email:    ${email}`);
  console.log(`  Password: ${tempPassword}`);
  console.log(' 请立即登录并修改密码。');
  console.log('============================================');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
```

- [ ] **Step 2: 在 `package.json` 增加 prisma 配置**

```json
{
  "prisma": {
    "seed": "tsx prisma/seed.ts"
  }
}
```

- [ ] **Step 3: 跑 seed**

```bash
pnpm db:seed
```

应输出临时密码（记下来，下面登录测试要用）。

- [ ] **Step 4: 验证数据库**

```bash
docker exec luxury-pg psql -U luxury -d luxury -c "SELECT email, role FROM \"AdminUser\";"
```

应看到 owner@example.com / OWNER。

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts package.json
git commit -m "feat(db): add seed script for initial owner"
```

---

## Task 13: Zod 安装（为登录 API 准备）

**Files:**

- 仅修改 `package.json`

- [ ] **Step 1: 安装**

```bash
pnpm add zod
```

- [ ] **Step 2: Commit**

```bash
git add package.json pnpm-lock.yaml
git commit -m "chore: add zod"
```

---

## Task 14: i18n 配置（next-intl）

**Files:**

- Create: `src/i18n/config.ts`, `src/i18n/request.ts`, `messages/zh.json`, `messages/en.json`
- Modify: `next.config.mjs`

- [ ] **Step 1: 安装**

```bash
pnpm add next-intl
```

- [ ] **Step 2: 创建 locales 配置**

`src/i18n/config.ts`:

```ts
export const locales = ['zh', 'en'] as const;
export type Locale = (typeof locales)[number];
export const defaultLocale: Locale = 'zh';
```

- [ ] **Step 3: 创建 messages**

`messages/zh.json`:

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
  }
}
```

`messages/en.json`:

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
  }
}
```

- [ ] **Step 4: 创建 next-intl 请求配置**

`src/i18n/request.ts`:

```ts
import { getRequestConfig } from 'next-intl/server';
import { locales, defaultLocale, type Locale } from './config';

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = locales.includes(requested as Locale)
    ? (requested as Locale)
    : defaultLocale;
  const messages = (await import(`../../messages/${locale}.json`)).default;
  return { locale, messages };
});
```

- [ ] **Step 5: 修改 `next.config.mjs` 注册 next-intl 插件**

```js
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts');

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: {
    remotePatterns: [
      { protocol: 'https', hostname: '*.myqcloud.com' },
      { protocol: 'https', hostname: '*.cos.ap-shanghai.myqcloud.com' }
    ]
  }
};

export default withNextIntl(nextConfig);
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore(i18n): configure next-intl with zh/en messages"
```

---

## Task 15: middleware（i18n + 鉴权骨架）

**Files:**

- Create: `src/middleware.ts`

- [ ] **Step 1: 创建 middleware**

`src/middleware.ts`:

```ts
import createIntlMiddleware from 'next-intl/middleware';
import { NextRequest, NextResponse } from 'next/server';
import { locales, defaultLocale } from './i18n/config';
import { verifySession, SESSION_COOKIE } from './lib/auth';

const intlMiddleware = createIntlMiddleware({
  locales: [...locales],
  defaultLocale,
  localePrefix: 'always'
});

const SECURITY_HEADERS: Record<string, string> = {
  'X-Frame-Options': 'DENY',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains'
};

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of Object.entries(SECURITY_HEADERS)) res.headers.set(k, v);
  return res;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // 后台登录页：放行（非登录页才校验）
  if (pathname.startsWith('/admin')) {
    if (pathname.startsWith('/admin/login') || pathname === '/admin/login') {
      return applySecurityHeaders(NextResponse.next());
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      const url = req.nextUrl.clone();
      url.pathname = '/admin/login';
      return applySecurityHeaders(NextResponse.redirect(url));
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // /api/admin/**：保护
  if (pathname.startsWith('/api/admin')) {
    if (pathname === '/api/admin/login') {
      return applySecurityHeaders(NextResponse.next());
    }
    const token = req.cookies.get(SESSION_COOKIE)?.value;
    const session = token ? await verifySession(token) : null;
    if (!session) {
      return applySecurityHeaders(
        NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 })
      );
    }
    return applySecurityHeaders(NextResponse.next());
  }

  // 公开 API：跳过 i18n
  if (pathname.startsWith('/api')) return applySecurityHeaders(NextResponse.next());

  // 公开站点走 i18n
  return applySecurityHeaders(intlMiddleware(req));
}

export const config = {
  matcher: ['/((?!_next|.*\\..*).*)']
};
```

- [ ] **Step 2: typecheck**

```bash
pnpm typecheck
```

- [ ] **Step 3: Commit**

```bash
git add src/middleware.ts
git commit -m "feat: add i18n + auth middleware with security headers"
```

---

## Task 16: 公开站点 [locale] 路由 + 占位首页

**Files:**

- Create: `src/app/[locale]/layout.tsx`, `src/app/[locale]/page.tsx`
- Delete: `src/app/page.tsx`（被根路由 → /zh 替代）
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: 删除根 page**

```bash
rm src/app/page.tsx
```

- [ ] **Step 2: 改 root layout（仅留 fonts + html）**

`src/app/layout.tsx`：保持已有内容（fonts + globals.css），不变。

- [ ] **Step 3: 创建 locale layout**

`src/app/[locale]/layout.tsx`:

```tsx
import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';
import { notFound } from 'next/navigation';
import { locales, type Locale } from '@/i18n/config';
import { Header } from '@/components/public/Header';
import { Footer } from '@/components/public/Footer';
import { MobileBottomBar } from '@/components/public/MobileBottomBar';

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
  children,
  params
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!locales.includes(locale as Locale)) notFound();
  setRequestLocale(locale);
  const messages = await getMessages();

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <Header />
      <main className="min-h-screen pb-24 md:pb-0">{children}</main>
      <Footer />
      <MobileBottomBar />
    </NextIntlClientProvider>
  );
}
```

- [ ] **Step 4: 创建 locale 首页占位**

`src/app/[locale]/page.tsx`:

```tsx
import { useTranslations } from 'next-intl';

export default function HomePage() {
  const t = useTranslations('site');
  return (
    <section className="container mx-auto px-4 py-24 text-center">
      <h1 className="font-serif text-5xl tracking-wider">{t('name')}</h1>
      <p className="mt-4 text-ink-soft">{t('tagline')}</p>
    </section>
  );
}
```

- [ ] **Step 5: 创建占位组件（避免 import 报错，下个 Task 实现真内容）**

`src/components/public/Header.tsx`:

```tsx
export function Header() {
  return <header className="h-14 border-b border-line" />;
}
```

`src/components/public/Footer.tsx`:

```tsx
export function Footer() {
  return <footer className="h-14 border-t border-line" />;
}
```

`src/components/public/MobileBottomBar.tsx`:

```tsx
export function MobileBottomBar() {
  return null;
}
```

- [ ] **Step 6: 验证**

```bash
pnpm dev
```

- 访问 http://localhost:3000 → 应自动重定向到 /zh
- 看到中文 "二手奢侈品 / 精选二手奢品"
- 访问 /en → 显示英文

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: add [locale] route with home placeholder"
```

---

## Task 17: LanguageSwitch 组件

**Files:**

- Create: `src/components/public/LanguageSwitch.tsx`

- [ ] **Step 1: 创建组件**

```tsx
'use client';
import { useLocale } from 'next-intl';
import { useRouter, usePathname } from 'next/navigation';
import { locales } from '@/i18n/config';

export function LanguageSwitch() {
  const current = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchTo(target: string) {
    if (target === current) return;
    const segs = pathname.split('/');
    segs[1] = target;
    router.push(segs.join('/') || `/${target}`);
  }

  return (
    <div className="flex items-center gap-2 text-xs uppercase tracking-wider">
      {locales.map((loc, i) => (
        <span key={loc} className="contents">
          <button
            type="button"
            onClick={() => switchTo(loc)}
            className={loc === current ? 'text-ink' : 'text-ink-soft hover:text-ink'}
            aria-current={loc === current ? 'true' : undefined}
          >
            {loc.toUpperCase()}
          </button>
          {i < locales.length - 1 && <span className="text-line">/</span>}
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(public): add LanguageSwitch"
```

---

## Task 18: Header 组件

**Files:**

- Modify: `src/components/public/Header.tsx`

- [ ] **Step 1: 实现 Header**

```tsx
import Link from 'next/link';
import { useTranslations, useLocale } from 'next-intl';
import { LanguageSwitch } from './LanguageSwitch';

export function Header() {
  const t = useTranslations();
  const locale = useLocale();
  const link = (p: string) => `/${locale}${p}`;

  return (
    <header className="sticky top-0 z-40 bg-bone/95 backdrop-blur border-b border-line">
      <div className="container mx-auto px-4 h-14 flex items-center justify-between">
        <Link href={link('')} className="font-serif text-lg tracking-wider">
          {t('site.name')}
        </Link>
        <nav className="hidden md:flex items-center gap-8 text-sm tracking-wide">
          <Link href={link('/products')}>{t('nav.products')}</Link>
          <Link href={link('/favorites')}>{t('nav.favorites')}</Link>
          <Link href={link('/about')}>{t('nav.about')}</Link>
          <Link href={link('/contact')}>{t('nav.contact')}</Link>
        </nav>
        <LanguageSwitch />
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 验证**

`pnpm dev`，桌面宽度看到 nav，移动宽度（DevTools 模拟）只剩 logo + 语言切换。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(public): implement Header"
```

---

## Task 19: Footer 组件

**Files:**

- Modify: `src/components/public/Footer.tsx`

- [ ] **Step 1: 实现 Footer**

```tsx
import { useTranslations } from 'next-intl';

export function Footer() {
  const t = useTranslations('footer');
  return (
    <footer className="border-t border-line mt-16 py-10 text-center text-xs text-ink-soft tracking-wide">
      <div className="container mx-auto px-4">
        <p>{t('copyright')}</p>
        <p className="mt-2">
          <a
            href="https://beian.miit.gov.cn"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-ink"
          >
            ICP 备案号占位
          </a>
        </p>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add -A
git commit -m "feat(public): implement Footer"
```

---

## Task 20: MobileBottomBar 组件

**Files:**

- Modify: `src/components/public/MobileBottomBar.tsx`

- [ ] **Step 1: 实现**

```tsx
'use client';
import Link from 'next/link';
import { useLocale, useTranslations } from 'next-intl';
import { usePathname } from 'next/navigation';

export function MobileBottomBar() {
  const t = useTranslations('nav');
  const locale = useLocale();
  const pathname = usePathname();

  const items = [
    { href: '', label: t('home') },
    { href: '/products', label: t('products') },
    { href: '/favorites', label: t('favorites') },
    { href: '/contact', label: t('contact') }
  ];

  return (
    <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-bone border-t border-line">
      <ul className="grid grid-cols-4 text-xs tracking-wide">
        {items.map((it) => {
          const full = `/${locale}${it.href}`;
          const active = pathname === full || (it.href === '' && pathname === `/${locale}`);
          return (
            <li key={it.href}>
              <Link
                href={full}
                className={`flex flex-col items-center justify-center h-14 ${
                  active ? 'text-ink' : 'text-ink-soft'
                }`}
              >
                {it.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
```

- [ ] **Step 2: 验证**

`pnpm dev`，移动宽度看到底栏。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(public): implement MobileBottomBar"
```

---

## Task 21: 登录 API（POST /api/admin/login）

**Files:**

- Create: `src/app/api/admin/login/route.ts`, `tests/api/admin-login.test.ts`

- [ ] **Step 1: 写集成测试（先失败）**

`tests/api/admin-login.test.ts`:

```ts
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { PrismaClient, Role } from '@prisma/client';
import { hashPassword, verifySession, SESSION_COOKIE } from '@/lib/auth';
import { POST } from '@/app/api/admin/login/route';

const prisma = new PrismaClient();

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

describe('POST /api/admin/login', () => {
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
```

- [ ] **Step 2: 跑测试，应失败**

```bash
pnpm test tests/api/admin-login.test.ts
```

- [ ] **Step 3: 实现 route**

`src/app/api/admin/login/route.ts`:

```ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { verifyPassword, signSession, SESSION_COOKIE } from '@/lib/auth';
import { loginLimiter } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';

export const runtime = 'nodejs';

const Body = z.object({
  email: z.string().email().toLowerCase(),
  password: z.string().min(1).max(200)
});

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? 'unknown';
  return 'unknown';
}

export async function POST(req: Request) {
  const ip = clientIp(req);
  let parsed;
  try {
    parsed = Body.parse(await req.json());
  } catch {
    return NextResponse.json({ ok: false, code: 'INVALID_INPUT' }, { status: 400 });
  }

  if (!loginLimiter.check(parsed.email)) {
    logger.warn({ email: parsed.email, ip }, 'login rate limited');
    return NextResponse.json({ ok: false, code: 'RATE_LIMITED' }, { status: 429 });
  }

  const user = await prisma.adminUser.findUnique({ where: { email: parsed.email } });
  if (!user || !(await verifyPassword(parsed.password, user.passwordHash))) {
    logger.info({ email: parsed.email, ip }, 'login failed');
    return NextResponse.json({ ok: false, code: 'UNAUTHORIZED' }, { status: 401 });
  }

  const token = await signSession({ userId: user.id, role: user.role });
  const res = NextResponse.json({ ok: true });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 7 * 24 * 60 * 60
  });
  loginLimiter.reset(parsed.email);
  logger.info({ userId: user.id, ip }, 'login ok');
  return res;
}
```

- [ ] **Step 4: 跑测试，应通过**

```bash
pnpm test
```

全部 passed（auth 6 + rate-limit 4 + login 4 = 14）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): add login api with rate limit"
```

---

## Task 22: 登录页

**Files:**

- Create: `src/app/admin/layout.tsx`（先用最小布局）, `src/app/admin/login/page.tsx`

- [ ] **Step 1: 创建最小 admin layout（不用国际化）**

`src/app/admin/layout.tsx`:

```tsx
import './admin.css';

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <div className="admin-root min-h-screen bg-white text-ink">{children}</div>;
}
```

`src/app/admin/admin.css`:

```css
.admin-root {
  font-family: var(--font-sans), system-ui, sans-serif;
}
```

- [ ] **Step 2: 创建登录页**

`src/app/admin/login/page.tsx`:

```tsx
'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.code === 'RATE_LIMITED' ? '失败次数过多，请稍后再试' : '邮箱或密码错误');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border border-line p-8 space-y-4"
      >
        <h1 className="font-serif text-2xl tracking-wider">后台登录</h1>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line px-3 py-2 focus:outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">密码</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line px-3 py-2 focus:outline-none focus:border-ink"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 bg-ink text-bone tracking-wider uppercase text-sm disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(admin): add login page"
```

---

## Task 23: 仪表盘占位 + 登出

**Files:**

- Create: `src/app/admin/page.tsx`, `src/app/api/admin/logout/route.ts`
- Modify: `src/app/admin/layout.tsx`

- [ ] **Step 1: 增强 AdminLayout（侧栏 + 顶栏）**

`src/app/admin/layout.tsx`:

```tsx
import './admin.css';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { verifySession, SESSION_COOKIE } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE)?.value;
  const session = token ? await verifySession(token) : null;

  // /admin/login 不应进入这里，但中间件已放行；这里再兜底：
  // 如果是 /admin/login 路径会有它自己的 page，layout 也会渲染——所以这里不能强制要求 session。
  // 通过判断是否能拿到 user 来决定显示。

  const user = session
    ? await prisma.adminUser.findUnique({
        where: { id: session.userId },
        select: { id: true, email: true, name: true, role: true }
      })
    : null;

  // 如果路由是 /admin 系列且无 user，由 middleware 处理跳转——layout 这里不重定向
  // （否则会和 /admin/login 冲突）
  return (
    <div className="admin-root min-h-screen bg-white text-ink flex">
      {user && (
        <aside className="w-56 border-r border-line p-6 hidden md:block">
          <div className="font-serif text-lg mb-8">后台</div>
          <nav className="space-y-2 text-sm">
            <Link href="/admin" className="block py-1.5">
              仪表盘
            </Link>
            <Link href="/admin/products" className="block py-1.5 text-ink-soft">
              商品
            </Link>
            <Link href="/admin/inquiries" className="block py-1.5 text-ink-soft">
              询价
            </Link>
            <Link href="/admin/categories" className="block py-1.5 text-ink-soft">
              分类
            </Link>
            <Link href="/admin/users" className="block py-1.5 text-ink-soft">
              管理员
            </Link>
            <Link href="/admin/settings" className="block py-1.5 text-ink-soft">
              设置
            </Link>
          </nav>
          <form action="/api/admin/logout" method="post" className="mt-12">
            <button className="text-xs text-ink-soft hover:text-ink">登出</button>
          </form>
        </aside>
      )}
      <div className="flex-1 min-w-0">
        {user && (
          <header className="h-12 border-b border-line flex items-center justify-end px-6 text-xs text-ink-soft">
            {user.name} · {user.email}
          </header>
        )}
        <div className="p-6">{children}</div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 dashboard 占位**

`src/app/admin/page.tsx`:

```tsx
export default function AdminDashboardPage() {
  return (
    <div className="space-y-6">
      <h1 className="font-serif text-3xl">仪表盘</h1>
      <p className="text-ink-soft">M2 实施后此处显示在售数、本周询价数等。</p>
    </div>
  );
}
```

- [ ] **Step 3: 创建 logout API**

`src/app/api/admin/logout/route.ts`:

```ts
import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(req: Request) {
  const url = new URL('/admin/login', req.url);
  const res = NextResponse.redirect(url, { status: 303 });
  res.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    path: '/',
    maxAge: 0
  });
  return res;
}
```

- [ ] **Step 4: 端到端手动验证**

```bash
pnpm dev
```

1. 访问 `/admin` → 应自动跳到 `/admin/login`
2. 输入 seed 输出的 owner email + 临时密码 → 跳到 `/admin`
3. 看到仪表盘 + 侧栏
4. 点登出 → 跳回 login

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(admin): add dashboard placeholder + logout"
```

---

## Task 24: Playwright + 登录 E2E

**Files:**

- Create: `playwright.config.ts`, `tests/e2e/admin-login.spec.ts`

- [ ] **Step 1: 安装 Playwright**

```bash
pnpm add -D @playwright/test
pnpm exec playwright install chromium
```

- [ ] **Step 2: 创建配置**

`playwright.config.ts`:

```ts
import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 30_000,
  retries: 0,
  workers: 1,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chrome', use: { ...devices['Pixel 5'] } }
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 60_000
  }
});
```

- [ ] **Step 3: 写 E2E**

`tests/e2e/admin-login.spec.ts`:

```ts
import { test, expect } from '@playwright/test';
import { PrismaClient, Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();
const TEST_EMAIL = 'e2e-login@x.com';
const TEST_PASSWORD = 'TestPass-123';

test.beforeAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.adminUser.create({
    data: {
      email: TEST_EMAIL,
      name: 'E2E',
      role: Role.ADMIN,
      passwordHash: await bcrypt.hash(TEST_PASSWORD, 12)
    }
  });
});

test.afterAll(async () => {
  await prisma.adminUser.deleteMany({ where: { email: TEST_EMAIL } });
  await prisma.$disconnect();
});

test('未登录访问 /admin 跳到 /admin/login', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin\/login$/);
  await expect(page.getByRole('heading', { name: '后台登录' })).toBeVisible();
});

test('正确凭证可登录并进入仪表盘', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(TEST_EMAIL);
  await page.getByLabel('密码').fill(TEST_PASSWORD);
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: '仪表盘' })).toBeVisible();
});

test('错误密码显示错误信息', async ({ page }) => {
  await page.goto('/admin/login');
  await page.getByLabel('邮箱').fill(TEST_EMAIL);
  await page.getByLabel('密码').fill('wrong');
  await page.getByRole('button', { name: '登录' }).click();
  await expect(page.getByText('邮箱或密码错误')).toBeVisible();
});
```

- [ ] **Step 4: 跑 E2E（确保 db 已启动 + seed 已跑）**

```bash
pnpm e2e
```

3 passed。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "test(e2e): admin login flow"
```

---

## Task 25: README + 收尾

**Files:**

- Create: `README.md`

- [ ] **Step 1: 写 README**

`README.md`:

````markdown
# Luxury Resale

二手奢侈品展示网站。Phase 1 = 单店主目录 + 后台登录。

## 本地开发

```bash
# 1. 启动 PostgreSQL
pnpm db:dev

# 2. 复制环境变量
cp .env.example .env.local
# 编辑 .env.local，填入 32+ 字符的 JWT_SECRET

# 3. 安装依赖
pnpm install

# 4. 跑迁移 + 种数据
pnpm db:migrate
pnpm db:seed
# 记下输出的临时密码

# 5. 启动
pnpm dev
```
````

公开站点：http://localhost:3000/zh
后台：http://localhost:3000/admin

## 命令

| 命令              | 说明               |
| ----------------- | ------------------ |
| `pnpm dev`        | 启动开发服         |
| `pnpm build`      | 生产构建           |
| `pnpm test`       | 跑单元/集成测试    |
| `pnpm e2e`        | 跑 E2E 测试        |
| `pnpm typecheck`  | TS 类型检查        |
| `pnpm lint`       | ESLint             |
| `pnpm db:dev`     | 启动本地 PG        |
| `pnpm db:migrate` | 跑 Prisma 迁移     |
| `pnpm db:seed`    | 种初始管理员       |
| `pnpm db:studio`  | 打开 Prisma Studio |

## 文档

- 设计：`docs/superpowers/specs/2026-05-08-secondhand-luxury-site-design.md`
- 实施计划：`docs/superpowers/plans/`

````

- [ ] **Step 2: 全量验证**

```bash
pnpm typecheck && pnpm lint && pnpm test && pnpm e2e
````

全绿。

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "docs: add readme"
```

---

## M1 验收清单

- [ ] `pnpm dev` 启动后访问 `/` 自动跳 `/zh`，看到品牌标题
- [ ] 切到 `/en` 看到英文
- [ ] 桌面宽度看到 Header 导航；移动宽度看到底部 Tab Bar
- [ ] 访问 `/admin` 未登录时跳 `/admin/login`
- [ ] 用 seed 输出的密码可登录，进入仪表盘占位页
- [ ] 登出可恢复未登录态
- [ ] `pnpm typecheck`、`pnpm lint`、`pnpm test`、`pnpm e2e` 全绿
- [ ] Prisma 已生成全部 8 张表的迁移
- [ ] 安全头（X-Frame-Options 等）出现在响应里（可在 DevTools Network 验证）
- [ ] `.env.local` 不在 git 中

## 自审备注

- **占位符扫描**：无 TBD/TODO；M2 用到的 COS\_\* env 已在 `.env.example` 占位
- **类型一致性**：`SessionPayload`、`SESSION_COOKIE`、Prisma 枚举 `Role` 在 auth/middleware/login API 中名称一致
- **覆盖**：spec §6 错误处理（统一错误码 + Zod 校验 + Prisma 错误隔离）已在登录 API 落地；§7 安全（bcrypt cost 12、httpOnly cookie、登录限流、CSP/X-Frame-Options 等）全部覆盖；§5 全局组件 Header/Footer/MobileBottomBar/LanguageSwitch 落地；§4.4 语言切换流程通畅
- **明确不在 M1**：CSP 的 Content-Security-Policy 头延后到 M4 部署前——M1 中的 SECURITY_HEADERS 仅含基本头（X-Frame、HSTS 等），CSP 写完整后会涉及 next/font、next/image 域，更适合在 M4 联调
- **明确不在 M1**：lib/cos.ts 与图片相关全部延后到 M2，避免现在写出会因占位 env 跑不通的代码

---

## 执行方式选择

计划写入 `docs/superpowers/plans/2026-05-08-m1-foundation.md`。两种执行方式：

1. **Subagent-Driven（推荐）** —— 每个 Task 派一个新 subagent 执行，Task 之间审阅；适合大量任务、希望保持主上下文清爽。
2. **Inline 执行** —— 在当前会话里逐 Task 跑，每 N 个 Task 设一个检查点；适合希望全程可见每一步的过程。

你选哪种？
