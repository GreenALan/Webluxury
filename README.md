# Luxury Resale

二手奢侈品展示网站。Phase 1 = 单店主目录 + 后台登录。

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
| `pnpm test` | 跑单元/集成测试 |
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

## M1 待完成的环境步骤

Docker 未安装时跳过了以下步骤，安装 Docker Desktop 后补：

1. `pnpm db:dev` 启动 PG
2. `pnpm db:migrate` 生成首次迁移（`prisma/migrations/<时间戳>_init/`）
3. `pnpm db:seed` 创建 OWNER 账号
4. 启用 `tests/api/admin-login.test.ts` 的集成测：`DATABASE_URL_TEST_ENABLED=1 pnpm test`
5. `pnpm exec playwright install chromium && pnpm e2e` 跑端到端
