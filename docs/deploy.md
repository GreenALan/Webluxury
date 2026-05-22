# 生产部署指南

把当前 repo 部署到你的境外 Debian 11/12 服务器，对接你的域名。PostgreSQL 用 Docker 跑在同一台机器。SSL 走 Let's Encrypt 免费证书。

> **假设**：你已经能 SSH 登录服务器（有 root 或 sudo 用户），域名已能在 DNS 控制台改解析记录。整套流程一台机首次部署 30-60 分钟。

---

## 0. 信息收集（动手前 1 分钟）

填空：

```
SERVER_IP          = <你的公网 IP>
SSH_USER           = <登录用户，root 或带 sudo 的普通用户>
DOMAIN             = <例如 luxury.example.com>
DB_PASSWORD        = <自己生成一个强密码，下面要用>
JWT_SECRET         = <32 字节随机串，下面教怎么生成>
SEED_OWNER_EMAIL   = <店主邮箱，例如 you@example.com>
```

生成 `JWT_SECRET`（**本地**跑一下，不是服务器）：

```bash
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

---

## 1. 服务器初始化

SSH 进服务器：

```bash
ssh ${SSH_USER}@${SERVER_IP}
```

后续命令在服务器上执行。如果是 root 用户，去掉所有 `sudo`。

### 1.1 系统升级

```bash
sudo apt update && sudo apt -y upgrade
sudo apt -y install build-essential curl git ufw ca-certificates gnupg
```

### 1.2 防火墙（建议）

```bash
sudo ufw allow OpenSSH
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw --force enable
sudo ufw status
```

**不要**开 5432（数据库端口）给公网——Docker 只绑到本机，但防火墙双保险。

### 1.3 应用用户（推荐用一个非 root 的 sudo 用户跑 PM2）

本文档假设你用 **`lvshaohui`** 这个普通 sudo 用户登录服务器，所有后续操作都在它的家目录 `/home/lvshaohui` 下进行。如果你的用户名不是这个，把后面所有 `lvshaohui` 替换成你的实际用户名（或在 shell 里 `export DEPLOY_USER=$(whoami)` 然后 `eval` 替换）。

确认这个用户有 sudo 权限：

```bash
sudo -v   # 输入密码后无报错即可
```

> **如果当前是用密码 SSH 登的**，建议先把本地 Mac 的公钥加进 `~/.ssh/authorized_keys`，以后免密：
>
> 本地 Mac：`cat ~/.ssh/id_ed25519.pub`（没有的话先 `ssh-keygen -t ed25519`）。复制输出。
>
> 服务器：
> ```bash
> install -d -m 700 ~/.ssh
> echo '<粘贴公钥>' >> ~/.ssh/authorized_keys
> chmod 600 ~/.ssh/authorized_keys
> ```

### 1.4 防 SSH 断连 + tmux 救命（强烈建议）

部署中 SSH 经常因为 NAT 超时、网络抖动而掉，跑到一半的 `pnpm build` 被杀很闹心。两步杜绝：

**a) 本地 Mac 开 SSH 心跳**，编辑 `~/.ssh/config`（没有就新建）：

```
Host summit
  HostName <SERVER_IP>
  User lvshaohui
  ServerAliveInterval 30
  ServerAliveCountMax 10
  TCPKeepAlive yes
```

以后 `ssh summit` 直接连，每 30s 一次心跳，运营商 NAT 不再随便切。

**b) 服务器装 tmux**，让会话在 SSH 断后依然存活：

```bash
sudo apt -y install tmux
tmux new -s deploy     # 进入名为 deploy 的会话，照原计划继续
# 如果 ssh 真断了，重新登服务器后：
tmux attach -t deploy  # 接回去，状态完全保留
```

常用快捷键（前缀 `Ctrl+B`）：

| 操作 | 按键 |
|---|---|
| 主动脱离（不杀进程） | `Ctrl+B` 然后 `d` |
| 列所有会话 | `tmux ls` |
| 接回会话 | `tmux attach -t <名字>` 或 `tmux a` |
| 上下滚屏看历史 | `Ctrl+B` 然后 `[`，方向键浏览，`q` 退出 |

> **建议**：从这里开始的所有命令都跑在 `tmux new -s deploy` 里。中途网断了无所谓，回头 `ssh summit && tmux a` 一秒接回原状态。

---

## 2. 安装运行时

### 2.1 Node 20 + pnpm

NodeSource 的 `setup_20.x` 一键脚本最近版本会误判 apt update 失败（实际成功了），**手动加仓库更稳**：

```bash
sudo apt -y install ca-certificates curl gnupg
sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
  sudo gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | \
  sudo tee /etc/apt/sources.list.d/nodesource.list
sudo apt update
sudo apt -y install nodejs
node -v   # 应该是 v20.x

# pnpm —— 直接走 npm，不用 corepack（NodeSource 部分 Debian 构建不带 corepack）
sudo npm install -g pnpm@10.25.0
pnpm -v   # 应该是 10.25.0
```

### 2.2 Docker（只为 PostgreSQL）

```bash
# 官方源
sudo install -m 0755 -d /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/debian/gpg | \
  sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg
sudo chmod a+r /etc/apt/keyrings/docker.gpg
echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] \
  https://download.docker.com/linux/debian $(. /etc/os-release && echo $VERSION_CODENAME) stable" | \
  sudo tee /etc/apt/sources.list.d/docker.list >/dev/null
sudo apt update && sudo apt -y install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# 让当前用户能用 docker，不必 sudo
sudo usermod -aG docker lvshaohui
# 退出 ssh 重连一次让 group 生效
exit
ssh lvshaohui@${SERVER_IP}
docker ps   # 应该不报权限错
```

### 2.3 Nginx

```bash
sudo apt -y install nginx
sudo systemctl enable --now nginx
curl -I http://localhost   # 应返回 200 + nginx welcome 页
```

### 2.4 PM2（Node 进程守护）

```bash
sudo npm i -g pm2
pm2 -v
```

---

## 3. 拉代码

```bash
cd ~              # /home/lvshaohui
git clone <你的仓库 URL> luxury
# 如果是私有 repo：先 ssh-keygen 生成 key，把 pub key 加到 GitHub/GitLab 部署密钥
cd luxury
```

`~/luxury`（也就是 `/home/lvshaohui/luxury`）是后面所有 `pnpm/pm2` 命令的工作目录。

---

## 4. 环境变量

```bash
cp .env.example .env
nano .env
```

改成生产值（**逐项填，别留默认**）：

```bash
# Database — connection string Prisma uses
DATABASE_URL=postgresql://luxury:<DB_PASSWORD>@localhost:5432/luxury?schema=public

# Database — same credentials docker-compose.yml uses to provision PG
POSTGRES_USER=luxury
POSTGRES_PASSWORD=<DB_PASSWORD>
POSTGRES_DB=luxury

# JWT — paste the 32-byte random string from step 0
JWT_SECRET=<JWT_SECRET>
JWT_EXPIRES_IN=7d

# COS：本次不用，留空（应用走 public/uploads/ 本地存储）
COS_SECRET_ID=
COS_SECRET_KEY=
COS_BUCKET=
COS_REGION=
COS_DOMAIN=

# 生产日志
LOG_LEVEL=info
NODE_ENV=production
```

锁权限：

```bash
chmod 600 .env
```

---

## 5. 启动 PostgreSQL（Docker）

`docker-compose.yml` 默认就是生产安全配置：

- `POSTGRES_USER` / `POSTGRES_PASSWORD` / `POSTGRES_DB` 从 `.env` 读，**不再硬编码**
- 端口绑 `127.0.0.1:5432`，公网访问不到
- 加了 `healthcheck`，启动顺序更稳

只要 §4 的 `.env` 已填好 `POSTGRES_USER=luxury` / `POSTGRES_PASSWORD=<DB_PASSWORD>` / `POSTGRES_DB=luxury`，**不用碰 yaml**。如果你的 DATABASE_URL 用了别的 user/db 名，把 `.env` 里的三个 `POSTGRES_*` 同步改过来。

启动：

```bash
docker compose up -d
docker compose ps      # 应看到 luxury-pg 处于 running 状态
docker compose logs -f # Ctrl+C 退出
```

数据持久化在 `luxury-pg-data` 命名卷里，重启容器不会丢。

---

## 6. 安装依赖 + 构建 + 迁移 + 种数据

```bash
pnpm install --frozen-lockfile
pnpm prisma generate
pnpm prisma migrate deploy           # 生产用 deploy，不用 dev
pnpm db:seed                         # 打印初始 owner 密码，**记下来**
pnpm build                           # 生成 .next/
```

> `migrate deploy` 只跑已提交的迁移文件，不会自动生成新的迁移——这是生产正确姿势。

`db:seed` 会输出：

```
============================================
 初始 OWNER 账号已创建
  Email:    you@example.com
  Password: <一次性密码>
 请立即登录并修改密码。
============================================
在售商品总数：12
```

把这个密码**先抄到密码管理器**——明文只显示这一次。

---

## 7. 用 PM2 启动应用

创建启动配置 `ecosystem.config.cjs`（项目根目录新建）：

```bash
nano /home/lvshaohui/luxury/ecosystem.config.cjs
```

粘进去：

```js
module.exports = {
  apps: [
    {
      name: 'luxury',
      script: 'node_modules/next/dist/bin/next',
      args: 'start --port 3000',
      cwd: '/home/lvshaohui/luxury',
      instances: 1,
      autorestart: true,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production'
      },
      out_file: '/home/lvshaohui/luxury/logs/out.log',
      error_file: '/home/lvshaohui/luxury/logs/err.log',
      merge_logs: true,
      time: true
    }
  ]
};
```

启动：

```bash
mkdir -p /home/lvshaohui/luxury/logs
pm2 start ecosystem.config.cjs
pm2 status        # 应看到 luxury 状态 online
pm2 logs luxury --lines 50   # Ctrl+C 退出
```

测试本机：

```bash
curl -I http://localhost:3000   # 应返回 200 或 307（语言重定向）
```

设置开机自启：

```bash
pm2 save
pm2 startup systemd -u lvshaohui --hp /home/lvshaohui
# 会输出一行 sudo 命令，照抄执行
```

---

## 8. Nginx 反向代理

新建站点配置：

```bash
sudo nano /etc/nginx/sites-available/luxury
```

粘进去（**替换 DOMAIN 占位符**）：

```nginx
upstream luxury_app {
  server 127.0.0.1:3000;
  keepalive 32;
}

server {
  listen 80;
  listen [::]:80;
  server_name DOMAIN;

  # 用于 Let's Encrypt 证书申请的 webroot 验证
  location /.well-known/acme-challenge/ {
    root /var/www/letsencrypt;
  }

  # 其它请求暂时走 HTTP（拿到证书后这段会被改成 301 → HTTPS）
  location / {
    proxy_pass http://luxury_app;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header Connection "";
    client_max_body_size 10M;     # 商品图最多 5MB/张，留点 buffer
  }

  # 本地上传图片直接由 Nginx 出，绕过 Node
  location /uploads/ {
    alias /home/lvshaohui/luxury/public/uploads/;
    access_log off;
    expires 30d;
    add_header Cache-Control "public, max-age=2592000";
  }

  # 静态资源缓存
  location /_next/static/ {
    alias /home/lvshaohui/luxury/.next/static/;
    access_log off;
    expires 365d;
    add_header Cache-Control "public, immutable, max-age=31536000";
  }
}
```

启用：

```bash
sudo mkdir -p /var/www/letsencrypt
sudo ln -s /etc/nginx/sites-available/luxury /etc/nginx/sites-enabled/luxury
sudo rm -f /etc/nginx/sites-enabled/default     # 关闭默认站，避免抢域名
sudo nginx -t                                   # 配置语法检查
sudo systemctl reload nginx
```

---

## 9. DNS 解析

在你的 DNS 控制台（Cloudflare / 阿里云 / Namecheap 等）加一条 A 记录：

```
类型: A
主机: @ （或 luxury，看 DOMAIN 是 root 还是子域）
值:   <SERVER_IP>
TTL:  600
```

等 DNS 生效（一般几分钟，看 TTL）。本地验证：

```bash
dig +short ${DOMAIN}      # 在本地 mac 跑，应返回 SERVER_IP
```

DNS 生效后访问 `http://${DOMAIN}`——应能看到公开站首页（HTTP，未加密，下一步加 SSL）。

---

## 10. SSL（Let's Encrypt + 自动续期）

```bash
sudo apt -y install certbot python3-certbot-nginx
sudo certbot --nginx -d ${DOMAIN} --non-interactive --agree-tos -m you@example.com --redirect
```

`--redirect` 会让 certbot **自动重写**你的 Nginx 配置：80 端口加 `return 301 https://...`，443 端口加 SSL 证书段。

测试自动续期：

```bash
sudo certbot renew --dry-run
```

证书 90 天有效，certbot 会装一个 systemd timer 自动续——不用管。

访问 `https://${DOMAIN}`——应是绿锁 + 公开站首页。

---

## 11. 验证清单

逐条点过：

- [ ] `https://${DOMAIN}/zh` — 首页中文（Hero / 分类 / 最新上架）
- [ ] `https://${DOMAIN}/en` — 切英文
- [ ] `https://${DOMAIN}/zh/products` — 列表 + 筛选
- [ ] 点任一商品 → 详情页 → 点「询价」→ 弹窗能正常打开
- [ ] 询价提交 → 看到「已收到」
- [ ] 重复提交第 4 次 → 看到「提交过于频繁」（限流生效）
- [ ] `https://${DOMAIN}/admin/login` → 用 seed 输出的密码登录
- [ ] `/admin/inquiries` → 看到刚才提交的询价
- [ ] `/admin/products/new` → 上传一张图 → 详情页能加载（验证 `/uploads/` 走 Nginx）
- [ ] `/admin/settings` → 改联系电话 → `/zh/contact` 立即同步

---

## 12. 日后更新代码（部署 v2）

服务器上：

```bash
cd /home/lvshaohui/luxury
git pull
pnpm install --frozen-lockfile
pnpm prisma migrate deploy    # 有新迁移才会跑
pnpm build
pm2 restart luxury
```

整套 30 秒-1 分钟。如果有破坏性更改（schema 重大变更、依赖大版本升），先 `pg_dump` 备份再升。

### 简单备份脚本（可选）

```bash
nano /home/lvshaohui/backup-db.sh
```

```bash
#!/usr/bin/env bash
set -euo pipefail
DEST=/home/lvshaohui/backups
mkdir -p "$DEST"
NAME="luxury-$(date +%Y%m%d-%H%M).sql.gz"
docker exec luxury-pg pg_dump -U luxury luxury | gzip > "$DEST/$NAME"
# 只保留最近 14 份
ls -1t "$DEST"/luxury-*.sql.gz | tail -n +15 | xargs -r rm
```

```bash
chmod +x /home/lvshaohui/backup-db.sh
crontab -e
```

加一行（每天凌晨 3:30 备份）：

```
30 3 * * * /home/lvshaohui/backup-db.sh >> /home/lvshaohui/logs/backup.log 2>&1
```

恢复：`gunzip -c <file>.sql.gz | docker exec -i luxury-pg psql -U luxury luxury`。

---

## 13. 常见故障

| 现象 | 检查 | 修法 |
|---|---|---|
| `https://${DOMAIN}` 502 | `pm2 status` 看 luxury 是否 online | `pm2 restart luxury`；`pm2 logs luxury` 看错误 |
| 502 但 PM2 显示 online | `curl -I http://localhost:3000` 看 Next 自己是否响应 | 看 `pm2 logs`，常是 DATABASE_URL 写错或 PG 没起来 |
| `pnpm build` 失败 OOM | 1GB 内存的小机器会爆 | 加 swap：`fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile`（追加到 `/etc/fstab`） |
| `pnpm prisma migrate deploy` 报错 | DB 连不上 | `docker compose ps` 看容器；`docker exec -it luxury-pg psql -U luxury -d luxury -c '\l'` 验证 |
| 图片上传报错 / 看不到 | `public/uploads/` 写权限 | `sudo chown -R lvshaohui:lvshaohui public/uploads/ && chmod 755 public/uploads/` |
| Nginx 改完不生效 | `sudo nginx -t` 是否通过 | 通过后 `sudo systemctl reload nginx` |
| 证书续期失败 | `sudo certbot certificates` 看到期日 | `sudo certbot renew --force-renewal` |
| 管理员密码忘了 | 找回路径 | 服务器跑：`cd /home/lvshaohui/luxury && node -e "const{PrismaClient}=require('@prisma/client');const b=require('bcryptjs');(async()=>{const p=new PrismaClient();await p.adminUser.update({where:{email:'<owner email>'},data:{passwordHash:await b.hash('<new pw>',12)}});await p.\$disconnect()})()"` |

---

## 14. 进一步加固（不紧迫，但值得做）

- **HSTS preload**：在 Nginx https server 块加 `add_header Strict-Transport-Security "max-age=31536000; includeSubDomains; preload" always;`
- **应用层 CSP**：M1 中间件已加基础安全头，未来想严格 CSP 时在 `src/middleware.ts` 扩
- **fail2ban**：`sudo apt -y install fail2ban`，默认配置就能挡 ssh 爆破
- **腾讯云/阿里云 COS**：用户量上来后图片走 COS+CDN，从 `next.config.mjs` 加远端 hostname；当前 1000 张图以内本地够用
- **监控**：跑 `pm2 install pm2-logrotate` 防止日志撑爆磁盘
- **备案**：未备案的境外服务器境内访问会受网络波动影响，正式商用建议补办（云厂商带备案需要把服务器迁到他们家）

---

## 速查

```
应用根目录:        /home/lvshaohui/luxury
日志:              /home/lvshaohui/luxury/logs/{out,err}.log
PM2 状态:          pm2 status
PG 连进去看:       docker exec -it luxury-pg psql -U luxury luxury
Nginx 配置:        /etc/nginx/sites-available/luxury
SSL 证书:          /etc/letsencrypt/live/<domain>/
环境变量:          /home/lvshaohui/luxury/.env  （chmod 600）
重启应用:          pm2 restart luxury
重启 Nginx:        sudo systemctl reload nginx
重启 PG:           docker compose restart
```

完。问题随时再问。
