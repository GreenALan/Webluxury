# 二手奢侈品网站设计文档

- **日期**：2026-05-08
- **状态**：设计已确认，待编写实施计划
- **目标**：搭建一个面向中国大陆用户、风格简洁的二手奢侈品在线展示与询价平台

## 1. 背景与定位

参考 [Vestiaire Collective](https://us.vestiairecollective.com/) 的视觉语感，但**不是**多用户交易市场——本站是**单店主商品展示**模式：

- 由店主（及 1-2 名助手）后台上传二手奢侈品（手表、包包等）
- 访客浏览、筛选、收藏（本地）、提交询价或直接通过电话/微信联系
- 站点不承担订单、支付、物流——成交链路在站外（微信/电话）完成

### 1.1 用户画像

| 角色                | 行为                                                                                                  |
| ------------------- | ----------------------------------------------------------------------------------------------------- |
| 访客（买家）        | 手机为主（移动端 >70%），浏览商品列表、筛选品牌/分类/价格、查看详情、收藏、提交询价或扫微信二维码联系 |
| 管理员（店主+助手） | 桌面为主，登录后台、上传/编辑商品、管理分类、查看询价、维护全站联系方式                               |

### 1.2 范围与边界

**Phase 1 范围**

- 公开站点：首页、列表页、详情页、收藏夹、关于、联系
- 后台：登录、商品 CRUD、分类、询价列表、全站设置、管理员管理
- 中英双语
- 移动端优先

**明确不做**（数据模型/架构留扩展位，未来可加而无需重构）

- 买家账号、注册、登录
- 购物车、订单、支付
- 评论、评分
- 商品对比
- 站内信、询价回复

## 2. 系统架构

```
┌────────────────────────────────────────────────────────────────┐
│  访客（手机/桌面浏览器）                                          │
└──────────────────┬─────────────────────────────────────────────┘
                   │ HTTPS
                   ▼
        ┌─────────────────────┐         ┌─────────────────────┐
        │  腾讯云 Lighthouse   │ ◄─────► │   腾讯云 COS        │
        │  Nginx + Next.js    │   静态   │   （图片对象存储）   │
        │  (PM2 守护)          │   资源   │   + CDN 加速        │
        └────────┬────────────┘         └─────────────────────┘
                 │
                 │ Prisma
                 ▼
        ┌─────────────────────┐
        │  TencentDB          │
        │  PostgreSQL         │
        └─────────────────────┘
```

### 2.1 技术栈

| 维度        | 选型                                 | 理由                                |
| ----------- | ------------------------------------ | ----------------------------------- |
| 前端 + 后端 | Next.js 14 (App Router) + TypeScript | 单仓库全栈，SSR 利于 SEO 与移动首屏 |
| 样式        | Tailwind CSS                         | 移动优先工程效率高                  |
| 数据库      | PostgreSQL（TencentDB）              | 关系型查询/筛选适配商品+分类+询价   |
| ORM         | Prisma                               | 类型安全、迁移工具完善              |
| 图片存储    | 腾讯云 COS + CDN                     | 直传节省服务器带宽                  |
| 认证        | JWT + bcrypt                         | 无第三方依赖、自建管理员体系足够    |
| i18n        | next-intl                            | 与 App Router 集成好                |
| 部署        | 腾讯云 Lighthouse + Nginx + PM2      | 单店场景最经济（约 ¥30-50/月）      |
| 校验        | Zod                                  | 与 TS 类型互通                      |
| 日志        | pino                                 | 轻量、结构化                        |
| 测试        | Vitest + Playwright                  | 现代生态主流                        |

### 2.2 仓库结构

```
src/
  app/
    [locale]/              # 国际化路由 (zh / en)
      page.tsx             # 首页
      products/
        page.tsx           # 列表页（含筛选）
        [slug]/page.tsx    # 详情页
      favorites/page.tsx   # 收藏夹
      about/page.tsx
      contact/page.tsx
    admin/
      login/page.tsx
      layout.tsx           # 后台布局 + 鉴权中间件
      page.tsx             # 仪表盘
      products/
        page.tsx
        new/page.tsx
        [id]/edit/page.tsx
      inquiries/page.tsx
      categories/page.tsx
      settings/page.tsx
      users/page.tsx
    api/
      inquiries/route.ts
      products/route.ts
      admin/
        login/route.ts
        upload-url/route.ts
        products/route.ts
        ...
  components/
  lib/
    prisma.ts
    auth.ts
    cos.ts
    i18n.ts
    rate-limit.ts
    products.ts
prisma/schema.prisma
messages/
  zh.json
  en.json
```

## 3. 数据模型

### 3.1 表关系

```
AdminUser ──uploadedById──► Product ──categoryId──► Category
                              │
                              ├──images───► Image (PHOTO / CERT)
                              │
                              └──inquiries►◄─ Inquiry  (productId 可空)

Setting (KV 表，存全站联系方式与品牌候选词等)
```

### 3.2 表定义

**AdminUser**

- `id` cuid, PK
- `email` unique
- `passwordHash` bcrypt cost 12
- `name`
- `role` enum：`OWNER` / `ADMIN`
- `createdAt`, `updatedAt`

**Category**

- `id` cuid
- `slug` unique（URL 友好，如 `watch`）
- `nameZh`, `nameEn`
- `icon` 可选（表情或图标 key）
- `sortOrder` int

**Product**

- `id` cuid
- `slug` unique
- `titleZh`, `titleEn`（titleEn 可空，渲染时 fallback titleZh）
- `descZh`, `descEn`（TEXT，可空）
- `brand` indexed
- `categoryId` → Category
- `price` Decimal(10,2)
- `originalPrice` Decimal(10,2) 可空
- `currency` default `'CNY'`
- `condition` enum：`NEW` / `LIKE_NEW` / `EXCELLENT` / `GOOD` / `FAIR`
- `sizeInfo` JSON（如 `{diameter:"40mm"}` / `{length:"30cm",width:"15cm",height:"20cm"}`）
- `serialNumber` text 可空
- `status` enum：`DRAFT` / `AVAILABLE` / `RESERVED` / `SOLD` / `ARCHIVED`
- `uploadedById` → AdminUser
- `createdAt`, `updatedAt`, `soldAt`
- 复合索引：`(status, createdAt DESC)`、单列索引：`brand`、`categoryId`

**Image**

- `id` cuid
- `productId` → Product (cascade)
- `url`（COS 对象 key 或全 URL）
- `kind` enum：`PHOTO` / `CERT`
- `sortOrder` int

**Inquiry**

- `id` cuid
- `productId` → Product 可空（站点级询价时为空）
- `name`
- `contact`（统一字符串：可填手机或微信号；前端校验至少非空）
- `message` text
- `locale`（`zh` / `en`）
- `status` enum：`NEW` / `READ`（预留 `REPLIED`）
- `ipHash`（限流用，sha256 截断）
- `createdAt`

**Setting**（KV）

- `key` PK（如 `contact_phone`、`contact_wechat_id`、`contact_wechat_qr_url`、`brand_options`）
- `value` text/JSON
- `updatedAt`

### 3.3 关键决策

1. **双语字段并列存**——只有标题和描述需双语，比单独翻译表简单
2. **`Image.kind`** 区分商品图与鉴定附件，避免分两张表
3. **`sizeInfo` 用 JSON**——表/包/服装尺寸字段差别大，结构化字段难统一
4. **`Setting` 是 KV 表**——联系方式改起来灵活，未来加配置项无需迁移
5. **`Inquiry` 不强关联商品**——支持站点级通用询价
6. **收藏不存 DB**——访客无账号，浏览器 `localStorage` 即可
7. **价格用 `Decimal`** 不用 `Float`——避免精度误差，未来加订单/支付不踩坑

## 4. 核心数据流

### 4.1 访客浏览商品列表（带筛选）

```
访客打开 /zh/products?category=watch&brand=Rolex&minPrice=10000
  → Next.js Server Component 解析 searchParams
  → lib/products.ts 调 Prisma 查询：
      WHERE status='AVAILABLE' AND categoryId=? AND brand=? AND price>=?
      ORDER BY createdAt DESC LIMIT 24 OFFSET ?
  → ProductCard[] 服务端渲染（next/image 懒加载）
  → HTML 直返
```

筛选写入 URL searchParams（不依赖客户端状态），刷新可分享。

### 4.2 访客提交询价

```
点"询价" → 弹出 InquiryDialog
  → POST /api/inquiries （Zod 校验）
  → 限流：同 IP 5 分钟 3 次
  → Prisma create Inquiry（含 ipHash）
  → 200 → Toast"已提交，店主会尽快联系"
```

### 4.3 管理员上传商品

```
登录拿 JWT (httpOnly cookie)
  → /admin/products/new 填表 + 选图
  → POST /api/admin/upload-url 取一批预签名 PUT URL
  → 浏览器直传 COS（不经服务器）
  → 提交时 POST /api/admin/products，body 含字段 + image keys
  → Prisma transaction：create Product + 批量 create Image
  → 重定向 /admin/products
```

**关键**：图片不经过 Next.js 服务器，节省内存与流量。

### 4.4 访客切换语言

```
/zh/products/abc 点"EN" → [locale] 路由切到 /en/products/abc
  → next-intl 加载 en messages
  → Server 重新渲染：
      UI 文案读 messages
      商品标题/描述读 titleEn/descEn（空则 fallback titleZh/descZh）
```

### 4.5 访客收藏

```
点"♡" → localStorage.set('favorites', [...ids, id])
  → 导航栏从 localStorage 读数字徽章
  → /zh/favorites 读 ids → fetch /api/products?ids=a,b,c → 渲染
```

无账号、无服务端状态、清浏览器即丢失。

## 5. 页面与组件

### 5.1 公开站点（移动优先）

| 路径                        | 页面   | 关键内容                                                                                     |
| --------------------------- | ------ | -------------------------------------------------------------------------------------------- |
| `/[locale]`                 | 首页   | Hero + 分类入口 + 最新上架横滚 + 全部商品入口                                                |
| `/[locale]/products`        | 列表   | 顶部筛选（移动抽屉/桌面侧栏）、网格、分页                                                    |
| `/[locale]/products/[slug]` | 详情   | 图片轮播、标题/品牌/价格/原价、成色徽章、双语描述、尺寸/编号、鉴定附件折叠区、询价 CTA、收藏 |
| `/[locale]/favorites`       | 收藏夹 | localStorage 读、批量询价                                                                    |
| `/[locale]/about`           | 关于   | 店主介绍、信任背书、联系方式                                                                 |
| `/[locale]/contact`         | 联系   | 全站联系方式 + 通用询价表单                                                                  |

**全局组件**：`Header`、`Footer`、`MobileBottomBar`、`LanguageSwitch`、`LocaleLink`、`ProductCard`、`FilterDrawer` / `FilterSidebar`、`InquiryDialog`、`ImageGallery`、`ContactCard`、`Toast`

### 5.2 后台（响应式但桌面优先）

| 路径                        | 页面       | 关键内容                                 |
| --------------------------- | ---------- | ---------------------------------------- |
| `/admin/login`              | 登录       | 邮箱+密码+错误次数限制                   |
| `/admin`                    | 仪表盘     | 在售数、本周询价数、最新询价 5 条        |
| `/admin/products`           | 商品列表   | 表格+状态筛选+搜索+排序                  |
| `/admin/products/new`       | 新建       | 双语字段、图片上传、分类选择、默认 DRAFT |
| `/admin/products/[id]/edit` | 编辑       | 图片可重排/删除/补传                     |
| `/admin/inquiries`          | 询价       | 表格+已读/未读筛选+标记已读              |
| `/admin/categories`         | 分类       | 列表+排序拖拽+双语名                     |
| `/admin/settings`           | 全站设置   | 联系方式、品牌候选词                     |
| `/admin/users`              | 管理员管理 | 列表+邀请（一次性密码）                  |

**后台组件**：`AdminLayout`、`ProductForm`（双语 Tab）、`ImageUploader`（拖拽+预览+进度+重排）、`RichTextarea`、`StatusBadge`、`Pagination`、`ConfirmDialog`

## 6. 错误处理

### 6.1 前端

- 表单：字段级提示（红字+边框），整体失败时 Toast
- 加载错误：Next.js `error.tsx` 边界，"加载失败，刷新重试"按钮，不白屏
- 图片加载失败：`next/image` `onError` 显示占位灰图
- 询价提交失败：保留用户输入，提供重试

### 6.2 API 层

- 统一错误格式：`{ ok: false, code, message }`
- 错误码：`UNAUTHORIZED` / `FORBIDDEN` / `NOT_FOUND` / `INVALID_INPUT` / `RATE_LIMITED` / `SERVER_ERROR`
- 入参用 Zod 校验，校验失败 400 + 字段级 errors
- Prisma 唯一约束冲突 → 409；其他 → 500 + 日志
- 永远不把 stack trace 回给前端

### 6.3 服务端日志

- pino，输出 stdout 由 PM2 落盘
- 信息事件：管理员登录、商品状态变更、询价提交
- 错误事件：含 `requestId`
- 不记录 PII（手机号、微信号），只记录其 hash

## 7. 安全

### 7.1 认证

- bcrypt（cost 12）哈希管理员密码
- JWT 放 httpOnly + Secure + SameSite=Strict cookie，7 天有效
- 同邮箱 5 次/15 分钟登录失败锁定（内存计数）
- 邀请新管理员发一次性密码，首次登录强制改密

### 7.2 鉴权

- `/admin/**` 与 `/api/admin/**` 由 Next.js middleware 校验 JWT
- 公开 `/api/**` 仅做限流

### 7.3 输入安全

- 所有用户输入走 Zod 校验
- 商品描述用 textarea + 服务端 escape，不渲染 HTML
- 上传文件：扩展名+大小（≤5MB/张）+ 张数（≤15 张/商品）校验
- SQL 注入：Prisma 参数化查询

### 7.4 限流

- 询价提交：同 IP 5 分钟内 3 次（lib/rate-limit.ts，内存 Map + 定时清理；后期升级 Redis）
- 登录：见 7.1

### 7.5 敏感数据

- 询价里访客联系方式仅后台可见
- 全站联系方式微信号是公开展示项
- `.env` 装 DB 连接、JWT secret、COS keys，不进 git

### 7.6 安全头

- middleware 添加 CSP、X-Frame-Options=DENY、HSTS

### 7.7 备份

- TencentDB 自动备份每日，保留 7 天
- COS 内置三副本

## 8. 测试

### 8.1 测试金字塔

| 层   | 工具             | 覆盖                                                                    |
| ---- | ---------------- | ----------------------------------------------------------------------- |
| 单元 | Vitest           | `lib/` 纯函数：价格格式化、筛选条件构建、JWT、限流、Zod schema          |
| 集成 | Vitest + 测试 DB | API 路由：商品 CRUD、询价、登录、上传 URL 签发；Docker PG 或内存 SQLite |
| E2E  | Playwright       | 5-8 条关键路径：访客浏览→筛选→询价、管理员登录→上传→前台可见            |

### 8.2 不写

- 组件渲染快照
- UI 视觉回归
- 后台 CRUD 全量 E2E

### 8.3 目标

- `lib/` 单元覆盖率 ≥ 80%
- CI：`typecheck` → `lint` → `test` → `e2e`

## 9. 部署

### 9.1 拓扑

```
开发者 push → GitHub Actions
  → typecheck / lint / test / build
  → rsync 到 Lighthouse
                │
                ▼
   Lighthouse:
     Nginx (443) ─SSL─► :3000 Next.js (PM2)
                │
                ├─► TencentDB PG
                └─► COS（图片）+ CDN
```

### 9.2 环境

- **生产**：Lighthouse + 独立 TencentDB + 生产 COS 桶
- **预发（可选）**：同台 Lighthouse `:3001` + 独立 DB
- **本地**：Docker compose（PG + 应用），COS 测试桶

### 9.3 域名 / SSL

- `.com` 域名 → 腾讯云 ICP 备案（7-20 天）→ DNS A → 免费 SSL → Nginx HTTPS

### 9.4 监控

- PM2 进程 + 日志
- 腾讯云监控告警（CPU、磁盘、连接数）
- Phase 2：Sentry 收集前端错误

## 10. 里程碑

| 阶段                     | 范围                                                                                               | 估时    |
| ------------------------ | -------------------------------------------------------------------------------------------------- | ------- |
| **M1：地基**             | 脚手架、Prisma schema、i18n 框架、设计令牌、Header/Footer/MobileBottomBar、登录 + JWT 中间件       | ~1 周   |
| **M2：商品 + 后台 CRUD** | 商品/分类/图片表 CRUD、ImageUploader、ProductForm、后台列表/编辑、Settings、Categories、Users 管理 | ~1.5 周 |
| **M3：公开站点**         | 首页、列表（FilterDrawer）、详情（ImageGallery）、收藏夹、关于、联系                               | ~1.5 周 |
| **M4：询价 + 上线**      | InquiryDialog、`/api/inquiries`、限流、`/admin/inquiries`、E2E、备案完成、生产部署、SSL、CDN       | ~1 周   |

**总计 ~5 周**（一人全职估算；备案串行卡时间）。

## 11. 一期不做但留下口子

| 未来特性       | 留的扩展位                                                          |
| -------------- | ------------------------------------------------------------------- |
| 买家账号       | `AdminUser` 独立，未来加 `User` 表不冲突；`Inquiry` 可挂 `userId`   |
| 订单/支付      | `Product.status` 已有 `RESERVED/SOLD`；价格用 `Decimal`             |
| 评论/评分      | `Product` 有外键 ID，加 `Review` 表纯加法                           |
| 询价站内信回复 | `Inquiry.status` 已留 `NEW/READ`，未来扩 `REPLIED` + `replies` 子表 |
| 商品对比       | 纯前端功能，不影响后端                                              |

## 12. 待解决的开放项

- 备案主体（个人/企业）需用户在 M4 之前确认，影响备案材料
- 是否启用预发环境（默认不启用，节省成本）
- COS 桶的 CDN 加速域名是否使用独立子域（如 `cdn.example.com`）
- 邀请新管理员的"一次性密码"是否通过邮件发送（需配 SMTP，否则后台明文显示一次）
