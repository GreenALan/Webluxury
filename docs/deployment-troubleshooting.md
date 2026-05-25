# 部署踩坑实录

把这次从一台只装好 Debian 的腾讯云轻量到 `https://svivivivi99.shop` 跑起来的全过程踩过的坑、症状、根因、修法整理成一份，便于二次部署或后人参考。

按部署阶段分组，每个坑独立成节，最后有「速查表」一节列所有问题的一句话定位。

## 目录

1. [SSH 与服务器初始化](#1-ssh-与服务器初始化)
2. [安装运行时](#2-安装运行时)
3. [Docker 与数据库](#3-docker-与数据库)
4. [Nginx 站点配置](#4-nginx-站点配置)
5. [应用启动](#5-应用启动)
6. [图片显示](#6-图片显示)
7. [速查表](#7-速查表)

---

## 1. SSH 与服务器初始化

### 1.1 文档让 `cp ~/.ssh/authorized_keys` 但报 "No such file or directory"

**症状**

```
$ sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/
cp: cannot stat '/home/lvshaohui/.ssh/authorized_keys': No such file or directory
```

**根因**

文档里这一步是「把现用户的 SSH 公钥同步给新用户」的简写，前提是当前用户**用 key 登的**。你这次用密码登录的，所以现用户根本没有 `~/.ssh/authorized_keys` 文件。

**修法**

跳过文档那一步，改成手动粘公钥：

```bash
# 本地 Mac
cat ~/.ssh/id_ed25519.pub    # 没有就 ssh-keygen -t ed25519 一次

# 服务器（用新用户的 shell 或者 sudo 帮 deploy 用户写）
install -d -m 700 ~/.ssh
echo '<本地 Mac 拷过来的 pubkey>' >> ~/.ssh/authorized_keys
chmod 600 ~/.ssh/authorized_keys
```

后续我们决定干脆**不另建 `deploy` 用户**，直接用 `lvshaohui`——deploy.md 已经按这个路径重写过。

---

### 1.2 每条 `sudo` 都要输密码很烦

**症状**

每跑一条 `sudo apt ...` 都问一次密码，整个部署期间输了二十几次。

**根因**

`sudo` 默认凭证缓存 5 分钟，期间还可能因为新 PTY 失效。

**修法**

部署阶段首选：

```bash
sudo -i        # 进入 root 壳子，后续命令不再加 sudo
# ... 装完一整套 ...
exit           # 退出 root，回到 lvshaohui 身份继续后面（PM2 不该用 root 跑）
```

deploy.md `§1.2 / §2` 的命令在 root 壳子里**全部要去掉 `sudo` 前缀**直接跑。

---

### 1.3 SSH 跑长时间命令时频繁断连

**症状**

`pnpm install`、`pnpm build` 跑到一半 SSH 掉线，进程被杀，重连后要重头来。

**根因**

腾讯云轻量境外节点 + 多层 NAT，运营商对空闲连接的超时较短；Node 长任务期间不发包 → 被中间设备清掉。

**修法**

两步杜绝：

**a) 本地 Mac SSH 心跳**——`~/.ssh/config`：

```
Host summit
  HostName <SERVER_IP>
  User lvshaohui
  ServerAliveInterval 30
  ServerAliveCountMax 10
  TCPKeepAlive yes
```

每 30 秒发心跳。

**b) 服务器 tmux**——即使 SSH 真断了，命令继续跑：

```bash
sudo apt -y install tmux
tmux new -s deploy        # 部署期所有命令都在这里跑
# 如果 SSH 断：
ssh summit
tmux a                    # 接回原状态
```

deploy.md `§1.4` 已经把这套写进去了。

---

## 2. 安装运行时

### 2.1 NodeSource `setup_20.x` 报 "Failed to run 'apt update' (Exit Code: 0)"

**症状**

```
$ curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
2026-05-22 17:32:34 - Error: Failed to run 'apt update' (Exit Code: 0)
```

退出码 0 = 实际成功，但 NodeSource 的脚本误判为失败、提前 abort。

**根因**

NodeSource 那个 curl|bash 一键脚本最近版本有 bug——它内部检查 `apt update` 输出时把 stderr 的 `W:` 警告也算作失败，导致 exit 0 都被识别成 fail。

**修法**

绕过一键脚本，手动加仓库：

```bash
apt -y install ca-certificates curl gnupg
mkdir -p /etc/apt/keyrings
curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | \
  gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg
echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_20.x nodistro main" | \
  tee /etc/apt/sources.list.d/nodesource.list
apt update
apt -y install nodejs
```

deploy.md `§2.1` 已替换成这套手动写法。

---

### 2.2 `corepack: command not found`

**症状**

```
$ corepack enable
-bash: corepack: command not found
```

**根因**

NodeSource 在 Debian 上的 `nodejs` 包**部分构建版本**不带 corepack。

**修法**

直接走 npm 装 pnpm，绕过 corepack：

```bash
npm install -g pnpm@10.25.0
pnpm -v
```

deploy.md `§2.1` 已改成这条路径。

---

### 2.3 `apt update` 报 `bullseye-backports` 404

**症状**

```
E: The repository 'http://deb.debian.org/debian bullseye-backports Release' no longer has a Release file.
```

虽然只是警告级别，但 `apt update` 退出码非 0，导致后面 `apt update && apt install ...` 链断掉。

**根因**

Debian 11 (bullseye) 的 backports 仓库 2024 年已停止维护，腾讯云的轻量镜像还引用着这个源。

**修法**

```bash
sudo rm -f /etc/apt/sources.list.d/backports.list
sudo apt update
```

顺手把同样可能出现的 `ookla_speedtest-cli.list` 也清了：

```bash
sudo rm -f /etc/apt/sources.list.d/ookla_speedtest-cli.list
```

这些都是腾讯云镜像预置但用不上的。

---

## 3. Docker 与数据库

### 3.1 `docker compose up -d` 报 "no configuration file provided: not found"

**症状**

```
$ docker compose up -d
no configuration file provided: not found
```

**根因**

不在项目根目录，当前目录没有 `docker-compose.yml`。

**修法**

```bash
pwd                       # 看自己在哪
cd ~/luxury               # 切到项目根
ls docker-compose.yml     # 确认文件存在
docker compose up -d
```

---

### 3.2 `.env` 里的 `<DB_PASSWORD>` 占位符被 shell 当输入重定向

**症状**

```
$ DATABASE_URL=postgresql://luxury:<DB_PASSWORD>@localhost:5432/luxury?schema=public
-bash: DB_PASSWORD: No such file or directory
```

**根因**

那一行是要**写进 `.env` 文件**的内容，不是 shell 命令。`<>` 在 bash 里是重定向符。

**修法**

正确流程：

```bash
cd ~/luxury
cp .env.example .env
nano .env
# 在编辑器里把 <DB_PASSWORD> 等占位符（含尖括号）替换成真值
chmod 600 .env
```

强密码可以现生成：`openssl rand -base64 24`。

---

## 4. Nginx 站点配置

### 4.1 Nginx 默认 301 到 `summit2050.top`，但那不是我们想要的域名

**症状**

```
$ curl -I http://localhost
HTTP/1.1 301 Moved Permanently
Location: https://summit2050.top:443/
```

明明刚装好 Nginx，怎么会有 `summit2050.top` 的 redirect？

**根因**

腾讯云这台机以前用作 **Xray 代理服务器**（科学上网），`/etc/nginx/conf.d/` 下有两个站：`summit2050.top.conf` 和 `svivivivi99.shop.conf`，都是「Yahoo.co.jp 伪装首页 + 隐藏路径走 Xray」的经典布局。

**修法**

`svivivivi99.shop.conf` 整个替换成代理到本机 3000 端口的配置，保留 `/tqvS1ra1vBs` 隐藏 Xray 路径（如果你还在用代理）。SSL 证书复用 `/usr/local/etc/xray/svivivivi99.shop.{pem,key}`，不用走 Let's Encrypt。

完整新版配置见 deploy.md 的 svivivivi99.shop 章节（或本仓库的 commit 历史里能搜到）。

---

### 4.2 Nginx 启动失败：`unknown directive "re"`

**症状**

```
nginx: [emerg] unknown directive "re" in /etc/nginx/conf.d/svivivivi99.shop.conf:11
nginx: configuration file /etc/nginx/nginx.conf test failed
```

第 11 行明明写的是 `return 301 ...`，怎么变成了 `re`？

**根因**

终端粘贴大段配置进 nano 时部分字符被吃了（终端 paste 缓冲、网络抖动、tmux 滚屏都可能造成）。

**修法**

**不要**用 nano 粘大段。改用 heredoc 一次性写整个文件，shell 不会丢字符：

```bash
sudo tee /etc/nginx/conf.d/svivivivi99.shop.conf > /dev/null <<'NGINX'
... 完整配置 ...
NGINX
```

关键点：terminator 用 `'NGINX'`（带单引号）防止 shell 把配置里的 `$host`、`$server_name` 当变量替换。

写完 `sudo nginx -t` 校验语法。

---

### 4.3 改完 Nginx 后用 `reload` 不生效

**症状**

`sudo systemctl reload nginx` 没报错，但站点行为没变。

**根因**

之前 Nginx 因为语法错误 `failed` 退出过，状态是 `inactive`。`reload` 只对运行中的进程有效；不在运行就什么也不做。

**修法**

```bash
sudo systemctl status nginx --no-pager | head -5
# 看到 Active: failed/inactive 就用 start，不用 reload
sudo systemctl start nginx
```

---

## 5. 应用启动

### 5.1 SSH 断连导致部署进程被杀

参见 `§1.3`——根本对策就是 tmux。

---

### 5.2 PM2 重启后 `NODE_OPTIONS` 没生效

**症状**

改了 `ecosystem.config.cjs` 的 env 块加 `NODE_OPTIONS`，跑 `pm2 restart luxury --update-env`，看进程 env 没有这个变量。

**根因**

PM2 的 `restart --update-env` 只 merge **当前 shell** 的 env，不会重新读 `ecosystem.config.cjs` 里的 env 块。

**修法**

彻底重启进程：

```bash
pm2 delete luxury
cd ~/luxury
pm2 start ecosystem.config.cjs
pm2 save
```

验证 env 进了进程：

```bash
PID=$(pm2 pid luxury)
sudo cat /proc/$PID/environ | tr '\0' '\n' | grep NODE_OPTIONS
```

---

## 6. 图片显示

### 6.1 后台保存商品（带新图）返回 400

**症状**

```
POST /api/admin/products/cmpgu6v37001auq4r5bdktxbu
Status: 400 INVALID_INPUT
```

**根因**

`Image` 上传成功，但提交 product 时，表单把 `originalPrice` 字段空白处发送成 `""`（空字符串）。后端 Zod schema 的 `originalPrice` 是 `z.string().regex(/^\d+(\.\d{1,2})?$/)`——空字符串不匹配数字正则，整个请求被拒。

**修法**

修 `src/app/api/admin/products/[id]/route.ts` 的 PATCH schema：

```ts
// 之前
originalPrice: z.string().regex(/^\d+(\.\d{1,2})?$/),

// 之后
originalPrice: z.string().regex(/^\d+(\.\d{1,2})?$|^$/),  // 接受空字符串
```

handler 里把空字符串当 NULL 处理：

```ts
if (parsed.originalPrice !== undefined)
  data.originalPrice = parsed.originalPrice === '' ? null : new Prisma.Decimal(parsed.originalPrice);
```

同时改了 400 响应带上 Zod `issues`，下次同类问题在 devtools 直接看得到字段名。

commit: `4e17ce4`

---

### 6.2 Demo 图（loremflickr）打不开，`fetch failed ETIMEDOUT`

**症状**

`/_next/image` 返回 500，PM2 logs 反复出现：

```
[TypeError: fetch failed] {
  [cause]: AggregateError [ETIMEDOUT]: ...
  [errors]: [ [Error], [Error] ]
}
```

`curl -4` 测同 URL 1 秒就 200，但 Node `fetch` 就超时。

**根因**

腾讯云轻量境外节点上 IPv6 配置存在但实际**不通**。Node 走 Happy Eyeballs 同时拨 IPv6 + IPv4：

- IPv4 路径 1 秒返回 200
- IPv6 路径立即被路由拒绝
- undici 内部超时计时器把整次 fetch 拖到 ETIMEDOUT

```bash
$ curl -6 ... --max-time 10
ipv6: code=000 time=0.004429s     ← 4 毫秒就拒绝
```

**修法 A**（尝试过，不够稳）

`ecosystem.config.cjs` 加 `NODE_OPTIONS='--dns-result-order=ipv4first'`——Node 24 的 undici 对这个 flag 响应不一致，仍然超时。

**修法 B**（彻底）：见下一节，最终把整个优化器关了。

也可以系统级关 IPv6：

```bash
echo -e "net.ipv6.conf.all.disable_ipv6=1\nnet.ipv6.conf.default.disable_ipv6=1" | \
  sudo tee /etc/sysctl.d/99-disable-ipv6.conf
sudo sysctl --system
```

副作用近乎为零（你本来就没用 IPv6），但属于「治本但侵入式」，不是必须的。

---

### 6.3 后台上传的图在公开站不显示

**症状**

后台 `/admin/products/<id>/edit` 上传图成功，文件落在 `~/luxury/public/uploads/`，但访问 `https://svivivivi99.shop/zh` 看不到。

PM2 logs 出现：

```
⨯ The requested resource isn't a valid image for /uploads/655b6a792f580951c530ab31.jpg received null
```

直接 curl 测：

```
$ curl -I http://localhost:3000/uploads/655b6a792f580951c530ab31.jpg
HTTP/1.1 404 Not Found
Content-Type: text/html
```

文件明明在磁盘上，但 Next.js 404。

**根因**

`next start`（生产模式）**不动态扫描 `public/`**——只识别 `pnpm build` 完成那一刻已存在的 public 文件。后台动态上传的新文件 Next.js 看不到 → 图片优化器从自己服务器拉源图 → 拉到 404 → 优化器返回 500。

**修法**

不让图片走 Next.js 优化器，让浏览器直接拉源图——Nginx 已经配好了 `/uploads/` 的 `alias` 直出。改 `next.config.mjs`：

```js
images: {
  unoptimized: true,         // ← 关键
  remotePatterns: [...]
}
```

这一改同时解决了：

- 本地 `/uploads/*` → 浏览器直拉，Nginx 服务（已配 alias）
- 外部 demo 图（loremflickr）→ 浏览器直拉 fastly CDN，绕过服务器 fetch，IPv6 问题彻底无关

**代价**

- 失去 Next.js 自动 WebP 转换
- 失去 srcset 响应式尺寸
- 懒加载（IntersectionObserver）仍保留

**何时考虑撤销**

接 COS+CDN 后图床自己做 WebP 和缩略图；那时把 `unoptimized: false` 或者去掉这行，配上自定义 loader 指向 CDN。

commit: `be9796c`

---

## 7. 速查表

| # | 症状关键词 | 根因 | 一句修法 |
|---|---|---|---|
| 1.1 | `cp .ssh/authorized_keys` 不存在 | 密码登录的用户没有 key | 手动粘 pubkey 进 `~/.ssh/authorized_keys` |
| 1.2 | sudo 反复要密码 | 凭证缓存 5 分钟 | `sudo -i` 进 root 壳子干完 → `exit` |
| 1.3 | SSH 中途断连 | NAT 超时 | `~/.ssh/config` 配 `ServerAliveInterval=30` + 服务器跑 tmux |
| 2.1 | `setup_20.x` 报 `apt update Exit Code: 0` | NodeSource 一键脚本误判 | 手动加 nodesource.list 仓库 |
| 2.2 | `corepack: command not found` | NodeSource 某些构建不带 | `npm install -g pnpm@10.25.0` |
| 2.3 | `bullseye-backports` 404 | 仓库已停止维护 | `sudo rm /etc/apt/sources.list.d/backports.list` |
| 3.1 | `docker compose: no configuration file` | 不在项目根 | `cd ~/luxury` |
| 3.2 | `<DB_PASSWORD>: No such file or directory` | shell 把 `<>` 当重定向 | 那行是 `.env` 文件内容不是命令 |
| 4.1 | 默认 301 到陌生域名 | 服务器以前是 Xray 伪装站 | 重写 `/etc/nginx/conf.d/*.conf` |
| 4.2 | nginx `unknown directive "re"` | 粘贴丢字符 | 用 `tee <<'NGINX'` heredoc 写整个文件 |
| 4.3 | nginx reload 不生效 | 服务实际是 inactive | `sudo systemctl start nginx`（不是 reload） |
| 5.2 | PM2 `NODE_OPTIONS` 没生效 | `--update-env` 不读 config 文件 | `pm2 delete && pm2 start ecosystem.config.cjs` |
| 6.1 | 商品保存 400 | `originalPrice: ""` 不过正则 | Zod 接受空字符串，handler 转为 null |
| 6.2 | loremflickr `fetch failed ETIMEDOUT` | IPv6 拨号失败拖死 IPv4 | `unoptimized: true` 让浏览器直拉（或系统关 IPv6） |
| 6.3 | 后台上传图 Next.js 404 | `next start` 不扫新加 public 文件 | `unoptimized: true` + Nginx alias 直出 `/uploads/` |

---

## 总结的总结

**踩坑预防原则**：

1. **粘大段配置一律用 heredoc**——`nano` 在 SSH 上不可靠
2. **长跑命令一律塞进 tmux**——防止网断重头来
3. **生产 Next.js 不要依赖 `public/` 的动态写入**——Nginx 直出 + `unoptimized: true` 才是奢侈品站这种"动态上传"场景的正路
4. **Node fetch + 境外服务器 = 检查 IPv6**——Tencent / AWS / GCP 境外节点都可能有 IPv6 配置但不通的情况
5. **腾讯云镜像预置源记得清**——`backports`、`ookla` 这些用不上还会让 `apt update` 退码非零
6. **校验失败 `code: 'INVALID_INPUT'` 太笼统**——所有 Zod catch 都应该把 `error.issues` 也返回，省 90% 排错时间

---

下次部署一台新机，对照 `docs/deploy.md` 走，再加上这份当救火指南，估计 1 小时之内就能起来。
