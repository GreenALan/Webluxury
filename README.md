# Luxury Resale

二手奢侈品展示网站。

**M1**：脚手架 + 双语 i18n + 移动端为主的公开站点骨架 + 后台登录 + JWT 鉴权。
**M2**：后台完整 CRUD（商品/分类/Settings/Users + 图片上传）。
**M3**：公开站点（首页 / 商品列表 + 筛选 / 商品详情 / 收藏夹 / 关于 / 联系）。

## 本地开发

```bash
# 1. 启动 PostgreSQL（需要 Docker Desktop）
pnpm db:dev

# 2. 复制环境变量
cp .env.example .env
# 编辑 .env，填入 32+ 字符的 JWT_SECRET

# 3. 安装依赖
pnpm install

# 4. 跑迁移 + 种数据
pnpm db:migrate
pnpm db:seed
# 记下输出的临时密码

# 5. 启动
pnpm dev
```

公开站点：http://localhost:3000/zh
后台：http://localhost:3000/admin

## 命令

| 命令 | 说明 |
|---|---|
| `pnpm dev` | 启动开发服 |
| `pnpm build` | 生产构建 |
| `pnpm test` | 跑单元/集成测试（需要 DB） |
| `pnpm e2e` | 跑 E2E 测试（需要 DB） |
| `pnpm typecheck` | TS 类型检查 |
| `pnpm lint` | ESLint |
| `pnpm db:dev` | 启动本地 PG |
| `pnpm db:migrate` | 跑 Prisma 迁移 |
| `pnpm db:seed` | 种初始管理员 |
| `pnpm db:studio` | 打开 Prisma Studio |

## 文档

- 设计：`docs/superpowers/specs/2026-05-08-secondhand-luxury-site-design.md`
- 实施计划：`docs/superpowers/plans/`

## 注意

- 本地图片上传到 `public/uploads/`（已 gitignored）。M4 部署时换为腾讯云 COS。
- `.env` 必须存在且含有效 `DATABASE_URL` 和 `JWT_SECRET`。Prisma CLI 默认只读 `.env`（不读 `.env.local`）。
- **公开站点路径**：`/zh`（默认）、`/en`。商品详情 `/[locale]/products/[slug]`。
- **收藏夹**：纯客户端 localStorage（key=`lr_favorites`），无服务端账号。
- **询价**：M3 联系页只展示联系方式；在线询价（弹窗+表单+`/api/inquiries`+`/admin/inquiries`）属 M4。
