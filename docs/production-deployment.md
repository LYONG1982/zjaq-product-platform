# 生产部署手册（Docker + 子域名 HTTPS）

适用版本：2026-11-11 构建产物；运行形态为 Docker Compose，包含 API、PC 门户、管理后台、小程序接口、MySQL 5.7 与 nginx。H5 不参与本次部署。

> 本文所有域名、密码、密钥均为占位示例。真实值只放在服务器上的 `deploy/.env`，不得提交或外发。

## 1. 架构

```
浏览器 / 小程序
      │ HTTPS
      ▼
   nginx（web 容器，仅它暴露 80/443）
      ├─ portal.<域名>  → portal 容器 :3000（Next.js，需登录）
      ├─ admin.<域名>   → 管理后台静态文件（/api/v1 反代到 api）
      └─ wx.<域名>      → 小程序接口（仅 /api 反代到 api 容器 :3100）
                              │
                              ▼
                         mysql 容器 :3306（仅内网）
```

持久化卷：`zjaq_mysql-data`（数据库）、`zjaq_private-storage`（上传文件，对应 `ZJ_STORAGE_DIR`）。

## 2. 交付物

| 路径 | 说明 |
| --- | --- |
| `deploy/compose.yml` | 运行编排（不在服务器上构建） |
| `deploy/docker/` | API / Portal / 静态站点镜像定义 |
| `deploy/nginx/default.conf.template` | 三子域名反向代理 + TLS |
| `deploy/env/.env.example` | 环境变量模板 |
| `deploy/scripts/` | 构建、导出、导入、启动、初始化、备份恢复、健康检查 |
| `work/release/<tag>/zjaq-images-<tag>.tar.gz` | 离线镜像包（构建机产出，已 gzip） |

目标服务器只需要 `deploy/` 目录 + 镜像包；不需要源码、`node_modules` 或 pnpm。

## 3. 前置条件

- 服务器：Linux x86_64，Docker Engine 24+ 与 Compose v2，建议 2 核 4 GB 以上、磁盘 40 GB 以上。
- 域名：为 `portal` / `admin` / `wx` 三个子域配置 A 记录，指向服务器公网 IP；`wx` 是小程序接口域名，不是 H5 页面。
- 证书：一张覆盖三个子域的 SAN 或通配符证书，目录由 `TLS_DIR` 指定；方案 B 指向 OpenResty 的 ssl 目录，见第 15 章。
- 构建机（方式 A）：Docker + 可访问 npm registry 与 Docker Hub 的网络 + Node.js 22（pnpm 由 corepack 提供）。
- 端口：服务器安全组/防火墙放行 TCP 80、443；**不要**放行 3100、3306、3000。

## 4. 环境变量

在 `deploy/` 下执行 `cp env/.env.example .env`，逐项填写：

| 变量 | 说明 |
| --- | --- |
| `PORTAL_DOMAIN` / `ADMIN_DOMAIN` / `WX_DOMAIN` | 三个子域名；`WX_DOMAIN` 供小程序接口使用 |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | 数据库 root 与应用账号密码，使用强随机值 |
| `PORTAL_PUBLIC_ORIGIN` | `https://<portal 域名>`，结尾不带斜杠 |
| `ALLOWED_ORIGINS` | 只有 admin：`https://<admin 域名>`；portal 走 Next 自身 `/api`，wx 为小程序不带 Origin |
| `ALLOWED_HOSTS` | `<admin 域名>,<wx 域名>,api:3100,127.0.0.1:3100`（后两者供 portal 服务端与健康检查） |
| `ADMIN_MEDIA_SESSION_SECRET` | 32 随机字节的 Base64：`openssl rand -base64 32` |
| `PORTAL_SESSION_SECRET` | 32 随机字节的十六进制：`openssl rand -hex 32` |
| `TRUSTED_PROXY_ADDRESSES` | `172.28.0.10`；方案 B 下再追加 OpenResty→web 的实测跳地址，逗号分隔 |
| `TLS_DIR` | 证书目录，默认 `./certs` |
| `IMAGE_TAG` | 镜像标签，构建、导出、启动三处必须一致 |

`VITE_API_BASE_URL` 不写进 `.env`：构建脚本给 admin 注入相对 `/api/v1`，给小程序注入 `https://<wx 域名>/api/v1`。**更换域名必须重新构建前端产物。** H5 本次不构建。

## 5. 方式 A：构建机产出离线镜像（推荐）

### 5.1 准备

```bash
# 构建机上解压源码包后，进入仓库根目录
cp deploy/env/.env.example deploy/.env
# 编辑 deploy/.env：域名、数据库密码、两个 SECRET、IMAGE_TAG
```

### 5.2 构建

```bash
chmod +x deploy/scripts/*.sh
deploy/scripts/build-images.sh
```

脚本依次执行：

1. `corepack pnpm install --frozen-lockfile`
2. 构建后台、H5、小程序产物（小程序产物无需进入镜像，单独上传）
3. 构建 `zjaq/api:<tag>`、`zjaq/portal:<tag>`、`zjaq/web:<tag>` 三个镜像

### 5.3 导出离线包

```bash
deploy/scripts/save-images.sh
```

输出：

- `work/release/<tag>/zjaq-images-<tag>.tar.gz`（含三个应用镜像与 `mysql:5.7`）
- 同名 `.sha256` 校验文件

### 5.4 拷贝到服务器

把 `deploy/`（**不含** `.env`、`certs/`、`backups/` 时需在服务器重新生成）与镜像包一起上传，例如：

```bash
scp -r deploy user@server:/opt/zjaq/
scp work/release/2026-11-10/zjaq-images-2026-11-10.tar.gz user@server:/opt/zjaq/
```

## 6. 方式 B：服务器联网直接构建

服务器可访问外网时，可跳过导出/导入，直接把源码放到服务器，执行 `deploy/scripts/build-images.sh` 后再 `deploy/scripts/deploy.sh --init ...`。首次构建会下载基础镜像与 npm 依赖，占用较多 CPU 与磁盘。

## 7. 目标服务器部署

> 若服务器由 1Panel 面板管理，请直接按第 15 章的界面步骤执行。第 7 章与第 15 章二选一，不要对同一套服务混用两种启动入口。

### 7.1 安装 Docker

```bash
curl -fsSL https://get.docker.com | sh
systemctl enable --now docker
docker compose version
```

### 7.2 导入镜像

```bash
cd /opt/zjaq
chmod +x deploy/scripts/*.sh
deploy/scripts/load-images.sh zjaq-images-2026-11-10.tar.gz
```

脚本会先校验 `.sha256`（存在时）再 `docker load`。

### 7.3 准备证书

正式证书（推荐通配符或 SAN）：

```bash
mkdir -p deploy/certs
install -m 644 fullchain.pem deploy/certs/fullchain.pem
install -m 600 privkey.pem  deploy/certs/privkey.pem
```

仅内网验收时可用自签名证书（浏览器会提示不受信任）：

```bash
deploy/scripts/make-self-signed-cert.sh
```

Let's Encrypt 证书续期后需重新拷贝并执行 `docker compose restart web`。

### 7.4 首次启动与初始化

```bash
cd deploy
cp env/.env.example .env   # 若尚未创建
chmod 600 .env
../deploy/scripts/deploy.sh --init admin '<至少 8 位密码>'
```

`--init` 会先启动 MySQL，执行 `pnpm db:init`（建表、写入分类与控制记录、创建首个管理员），再启动全部服务并等待健康检查。

后续更新只需：

```bash
deploy/scripts/deploy.sh
```

> 顺序很重要：API 在数据库未初始化时会以 `NOT_INITIALIZED` 拒绝启动并反复重启，这是预期保护，不是故障。

### 7.5 验收

```bash
deploy/scripts/healthcheck.sh
```

应看到 mysql / api / portal 均为 healthy，四个域名返回 2xx/3xx。再人工确认：

- [ ] `https://<api 域名>/health` 返回 JSON，`capabilities.video` 为 `ready`（若需视频上传）
- [ ] `https://<admin 域名>/` 可登录，能创建/发布产品、上传资料
- [ ] `https://<portal 域名>/` 销售账号可登录并浏览产品
- [ ] `https://<h5 域名>/` 免登录浏览已发布内容，PDF 预览正常
- [ ] 上传一个 >100 MiB 的文件不报 413
- [ ] 重启服务器后 `docker compose ps` 全部自动恢复

## 8. 小程序发布

小程序产物位于 `apps/mobile/dist/build/mp-weixin`（构建机上的源码目录内）。

1. 用微信开发者工具导入该目录，`apps/mobile/src/manifest.json` 中 `mp-weixin.appid` 已为 `wxd3482df3a7c0c714`，发布前确认归属正确。
2. 微信公众平台 → 开发管理 → 服务器域名：把 `request 合法域名` 设为 `https://<api 域名>`。该域名必须已备案并启用 HTTPS，占位域名不可用。
3. 上传体验版 → 真机验证首页、产品详情、资料预览、二维码长按识别、转发与朋友圈分享。
4. 提审发布。

分享入口：各页面右上角「转发 / 分享到朋友圈」，产品详情页与资料页另有「分享给同事」按钮；分享路径为小程序内部页面路径，不依赖外部域名。

## 9. 备份与恢复

```bash
# 备份（MySQL + 上传目录）
deploy/scripts/backup.sh

# 恢复（会覆盖现有数据，需二次确认）
deploy/scripts/restore.sh deploy/backups/zjaq-<时间>.sql deploy/backups/storage-<时间>.tar.gz
```

建议用 cron 每日备份并把 `deploy/backups/` 同步到服务器之外；恢复后抽查产品、资料与文件可访问性。

备份脚本按 compose 项目名 `zjaq` 定位卷 `zjaq_private-storage`；若修改 `compose.yml` 顶部的 `name`，需同步修改两个脚本中的卷名。

## 10. 升级与回滚

```bash
# 构建机：打新标签
# 修改 deploy/.env 中 IMAGE_TAG=<新标签> 后再执行 build-images.sh / save-images.sh

# 服务器：导入新包并切换
deploy/scripts/load-images.sh zjaq-images-<新标签>.tar.gz
# 修改 deploy/.env 的 IMAGE_TAG=<新标签>
deploy/scripts/deploy.sh
```

回滚：把 `IMAGE_TAG` 改回旧标签并再次 `deploy.sh`（旧镜像仍在服务器上即可离线回滚）。

## 11. 故障排查

| 现象 | 原因与处理 |
| --- | --- |
| api 反复重启，日志含 `NOT_INITIALIZED` | 未执行 `db:init`；运行 `deploy.sh --init <账号> <密码>` |
| 后台/H5 请求被拒绝（CORS 或 Host 校验） | `ALLOWED_ORIGINS` / `ALLOWED_HOSTS` 与真实域名不一致，改 `.env` 后 `docker compose up -d` |
| 上传大文件返回 413 | nginx 模板已设 512m；若前置了其他网关，需同步放宽 |
| PDF 预览空白或 MIME 报错 | `.mjs`/`.wasm` 的 MIME 由 nginx 模板处理；确认使用 `zjaq/web` 镜像且未绕过 nginx |
| 视频上传被拒绝 | 镜像内含 ffmpeg；查看 `/health` 的 `capabilities.video` 与 `deploy/scripts/healthcheck.sh` |
| 后台登录后刷新掉线 | `PORTAL_SESSION_SECRET`/`ADMIN_MEDIA_SESSION_SECRET` 每次启动被改写；固定 `.env` 中的值 |
| 浏览器证书告警 | 使用了自签名证书；换正式证书并 `docker compose restart web` |
| 上传文件 404 | `private-storage` 卷未挂载或被误删；从备份恢复 |
| 修改域名后前端仍请求旧地址 | 前端产物在构建期烧录 API 地址，需重新 `build-images.sh` |

## 12. 安全注意事项

- `deploy/.env`、`deploy/certs/`、`deploy/backups/` 均不得提交或外发；`.env` 建议 `chmod 600`。
- MySQL 不映射到宿主机端口，只允许容器内网访问。
- `TRUSTED_PROXY_ADDRESSES` 与 compose 里的固定 IP 对应；若修改网段，需同时改 `.env` 和 compose。
- 首次登录后立即在后台创建各自的账号，避免共用 admin。
- MySQL 5.7 已停止官方维护，条件允许时应评估升级到 8.0，并先在测试环境完成迁移与备份演练。

## 13. 本机验证状态

本轮已实际执行并通过：

- `pnpm --filter @zj/mobile check`（vue-tsc）
- `build:h5`、`build:mp-weixin`
- `preview:assets` + `pnpm --filter @zj/portal build`（Next.js 生产构建）
- `pnpm --filter @zj/admin build`（Vite 生产构建）
- `deploy/compose.yml` YAML 解析校验
- 全部 `deploy/scripts/*.sh` 的 `bash -n` 语法检查
- 源码交付包生成与 SHA256 校验

未执行：容器构建与启动、`docker save`/`load`、HTTPS 证书、微信真机与提审。当前开发机未安装 Docker，上述容器相关步骤必须在具备 Docker 的目标环境执行并单独留存证据，不能由本地构建成功推断通过。

## 14. 构建机注意事项

- 构建脚本会执行 `corepack enable`，让仓库脚本内部再次调用的 `pnpm` 可用；若构建机没有 Node 22，请先安装。
- 构建机首次执行需拉取基础镜像与 npm 依赖，请预留网络与磁盘。
- 修改 `.env` 中的域名后必须重新执行 `build-images.sh`：后台的同源 `/api/v1` 与小程序绝对域名在构建期写入产物；H5 本次不构建。

## 15. 1Panel 面板部署（服务器联网，本机构建镜像）

> **现场警示（2026-11-10）**：本服务器上的 OpenResty 容器 `1Panel-openresty-BGeE`（host 网络）实际托管着其他多个站点，1Panel 面板自身也经它访问；面板「网站」计数为 0 但 `conf.d` 内确有站点配置。**方案 A 已否决，严禁停用 OpenResty。** 该服务器改为方案 B：保留 OpenResty 作为 80/443 入口，`web` 只绑定 `127.0.0.1:8080`，portal / admin / wx 三个子域由新增的独立 conf 反代。2026-11-11 口径调整：`wx` 为**小程序接口域名**，只反代 `/api`、不托管静态页面；H5 不参与本次部署，不再保留 `h5` 与 `api` 子域。改造计划见 `plans/active/2026-11-10-1panel-openresty-reverse-proxy.md` 与补充计划 `plans/active/2026-11-11-same-origin-api-domains.md`；服务器侧尚未实施，证书路径仍待用户提供。

适用前提：目标服务器可联网，Docker 与 Compose v2 由 1Panel 提供。本章与第 5～7 章二选一；镜像内容、环境变量、nginx 模板完全一致，差异只在“镜像在服务器本机构建”和“由 1Panel 编排启动”。

### 15.1 与现有方案的冲突点与取舍

| 冲突点 | 核实结果 | 结论 |
| --- | --- | --- |
| 80/443 | 1Panel 的 OpenResty 以 `network_mode: host` 运行，占用宿主机 80/443，并托管其他站点与面板 | 保留 OpenResty 作入口；`web` 改为 `127.0.0.1:8080:443` |
| 3306 | `compose.yml` 的 mysql 不发布宿主端口，与 1Panel 应用商店 MySQL 不冲突 | 不为本项目安装或复用面板 MySQL |
| 编排目录/卷名 | 1Panel 编排放 `{安装目录}/1panel/docker/compose/<名称>`，默认 `/opt/1panel`；compose 顶层 `name: zjaq` | 编排文件夹命名为 `zjaq`，卷应为 `zjaq_mysql-data`、`zjaq_private-storage` |
| TLS 证书 | 方案 B 由 OpenResty 与 web 共用同一张覆盖 portal / admin / wx 三域的证书；`TLS_DIR` 为相对路径时按编排目录解析 | 证书只放一份，`TLS_DIR` 指向 OpenResty 的 ssl 目录，路径见计划 5.4 |
| 172.28.0.0/16 | 1Panel 应用也会创建 172.x 网桥，可能与本方案固定网段重叠 | 先检查；冲突时按 15.10 另立计划 |

**80/443 为什么保留 OpenResty**：该 OpenResty 不是本项目独占资源，停用会同时中断其他站点与 1Panel 面板。方案 B 由 OpenResty 对外终止 TLS，经 `127.0.0.1:8080` 转发到 `web`；`web` 内部仍走现有 443 TLS。为支持浏览器同源 `/api`，`deploy/nginx/default.conf.template` 已给 admin 增加 `/api/v1/` 反代、给 wx 增加仅 `/api/` 的反代，因此 **web 镜像必须重建**。新增反代模板见 `deploy/1panel/zjaq-product-platform.conf`。

**TRUSTED_PROXY_ADDRESSES 需要两跳**：API 看到的对端仍是 `web`（`172.28.0.10`），但 `web` 的 XFF 链尾会带上 OpenResty→web 的实际来源地址（通常为 `172.28.0.1`，必须实测）。该地址必须加入可信列表，否则 API 记录的是代理地址而不是真实客户端；不要加入面板地址或通配值。

### 15.2 1Panel 侧准备

1. 登录 1Panel → 主机 → 终端（root）。
2. 确认运行环境：`docker version && docker compose version`。1Panel 已装 Docker 时不要再执行 get.docker.com。
3. 1Panel → 主机 → 防火墙放行 TCP 80、443；云厂商安全组同样放行。不要放行 3000、3100、3306。
4. **禁止停用 OpenResty**（方案 A 已否决）。保持 `1Panel-openresty-BGeE` 运行；后续按 `deploy/1panel/zjaq-product-platform.conf` 新增反代配置，只做 `nginx -t` 与 reload。先记录面板与现有站点的访问基线。
5. 检查固定网段是否被占用：

   ```bash
   for n in $(docker network ls -q); do
     docker network inspect "$n" --format '{{.Name}} {{range .IPAM.Config}}{{.Subnet}} {{end}}'
   done
   ```

   出现 `172.28.0.0/16` 即为冲突，先停止并按 15.10 处理。
6. 为 `portal` / `admin` / `wx` 三个子域配置 A 记录，指向服务器公网 IP。`wx` 是小程序接口域名，不是 H5 页面域名。

### 15.3 上传源码并填写 deploy/.env

```bash
mkdir -p /opt/zjaq
tar xzf /root/zjaq-source-<tag>.tar.gz -C /opt/zjaq
cd /opt/zjaq
cp deploy/env/.env.example deploy/.env
chmod 600 deploy/.env
```

源码包没有顶层目录，可直接解压到 `/opt/zjaq`。`deploy/.env` 至少填写：

| 变量 | 说明 |
| --- | --- |
| `PORTAL_DOMAIN` / `ADMIN_DOMAIN` / `WX_DOMAIN` | 三个真实子域名；`WX_DOMAIN` 供小程序接口与 wx 反代 |
| `MYSQL_ROOT_PASSWORD` / `MYSQL_PASSWORD` | 强随机值；首次初始化后改 `.env` 不会改数据库密码 |
| `PORTAL_PUBLIC_ORIGIN` | `https://<portal 域名>`，结尾不带斜杠 |
| `ALLOWED_ORIGINS` | 只有 admin 需要：`https://<admin 域名>`；portal 走 Next 自身 `/api`，wx 为小程序不带 Origin |
| `ALLOWED_HOSTS` | `<admin 域名>,<wx 域名>,api:3100,127.0.0.1:3100` |
| `ADMIN_MEDIA_SESSION_SECRET` | `openssl rand -base64 32` |
| `PORTAL_SESSION_SECRET` | `openssl rand -hex 32` |
| `TLS_DIR` | 方案 B 指向 OpenResty 的证书目录（占位，如 `/opt/1panel/apps/openresty/openresty/www/sites/zjaq-product-platform/ssl`），证书 SAN 需覆盖三域 |
| `IMAGE_TAG` | 本次发布标签，构建与启动必须一致 |

`TRUSTED_PROXY_ADDRESSES` 默认保留 `172.28.0.10`；方案 B 上线时按实测结果追加 OpenResty→web 的来源地址（通常 `172.28.0.1`）。这份 `.env` 同时供本机构建和运行使用，第 15.5 步会链接到编排目录。

### 15.4 在面板终端构建镜像

**不要使用「编排项目构建」**：`deploy/compose.yml` 有意不含 `build:`，且 `Dockerfile.web` 依赖先构建好的 `apps/admin/dist`。要在编排里构建，必须改 `deploy/` 并重新设计构建上下文，需另立计划。当前可操作方式是面板终端执行现成脚本。

服务器本机需要 Node.js 22（项目要求 `>=22.22.1 <23`）。Ubuntu/Debian 示例：

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt-get install -y nodejs
node -v
```

RHEL 9 / CentOS Stream 9 用 `https://rpm.nodesource.com/setup_22.x` 后 `dnf install -y nodejs`。若发行版过旧（如 CentOS 7，glibc 2.17）无法运行 Node 22，应改用构建机产出镜像。

```bash
cd /opt/zjaq
chmod +x deploy/scripts/*.sh
deploy/scripts/build-images.sh
```

完成后应存在 `zjaq/api:<tag>`、`zjaq/portal:<tag>`、`zjaq/web:<tag>` 三个镜像。

构建期变量的传递方式（脚本已内置，不需要手工 export）：

- `VITE_API_BASE_URL=/api/v1` → 管理后台走同源 `/api/v1`，由 web 的 admin server 块反代到 API；
- `VITE_API_BASE_URL=https://<wx 域名>/api/v1` → 小程序必须使用绝对地址，且需在微信后台配置 request 合法域名；
- PC 门户构建期固定 `PORTAL_API_BASE_URL=http://api:3100/api/v1`，走容器内网，不依赖公网域名；
- 数据库密码与两个会话密钥只在运行期注入，不进入前端产物。

因此，**修改 `PORTAL_DOMAIN` / `ADMIN_DOMAIN` / `WX_DOMAIN` 后必须重跑 `build-images.sh` 并重建 web 镜像**；只改密码不影响已有镜像。H5 本次不构建、不部署。

补充：若以后改为构建机产出、推送到镜像仓库，服务器只需 `docker pull zjaq/api:<tag>` 等三个镜像，后续 1Panel 步骤完全相同；离线包场景把 `save-images.sh` 的产物拷到服务器执行 `load-images.sh` 后继续本节之后的内容即可。

### 15.5 创建编排项目并放入配置

1. 容器 → 编排 → 创建编排。
2. 名称/文件夹填 `zjaq`（小写，必须与卷名前缀一致）。
3. 来源选「编辑」，把 `/opt/zjaq/deploy/compose.yml` 全文原样粘贴，点确认。不要在此处展开 `${...}` 或改写值，变量由 `.env` 提供。
4. 创建后第一次启动会因缺少 `.env` 失败，这是预期。在面板终端补齐：

   ```bash
   cd /opt/1panel/docker/compose/zjaq
   # 软链接到唯一一份配置，避免构建与运行两处 .env 漂移；不接受软链接时可改为 cp
   ln -sf /opt/zjaq/deploy/.env .env
   chmod 600 /opt/zjaq/deploy/.env

   # 仅当 TLS_DIR 仍为 ./certs 时需要；已用绝对路径可跳过
   mkdir -p certs
   cp /opt/zjaq/deploy/certs/fullchain.pem /opt/zjaq/deploy/certs/privkey.pem certs/
   chmod 600 certs/privkey.pem
   ```

   证书申请方式：方案 B 下 80/443 由 OpenResty 持有，证书与 OpenResty 共用一份。请在 1Panel「证书」中用 DNS 验证申请覆盖 portal / admin / wx 三域的 SAN 或通配符证书，放到计划 5.4 的 ssl 目录；HTTP-01 需要把校验路径接入 OpenResty，另行配置。**不要停 OpenResty，也不要让 web 另申请证书。**
5. 回到编排详情页点「启动」。

### 15.6 首次初始化

1Panel 启动后 api 会因 `NOT_INITIALIZED` 反复重启，属预期保护。在面板终端执行：

```bash
cd /opt/1panel/docker/compose/zjaq
docker compose up -d mysql
docker compose run --rm \
  -e ADMIN_USERNAME=admin \
  -e ADMIN_PASSWORD='<至少 8 位强密码>' \
  api pnpm db:init
docker compose up -d
```

等待 mysql / api / portal 变为 healthy，首次约 2～4 分钟。

- 不要执行 `/opt/zjaq/deploy/scripts/deploy.sh`。它与 1Panel 编排使用同一个项目名 `zjaq`，两处同时启停会让容器归属和证书路径不可预期。后续启停统一在编排页或编排目录内完成。
- `db:init` 只用于首次初始化；后续账号在后台「系统设置 → 后台账号」维护。

### 15.7 验收

1Panel 内：

- 编排详情：mysql / api / portal 为 healthy，web 为运行中（web 镜像没有 healthcheck）。
- 容器日志：api 不含 `NOT_INITIALIZED`、`MISSING_CONFIGURATION`。

面板终端：

```bash
cd /opt/1panel/docker/compose/zjaq
docker compose ps
docker volume ls | grep zjaq_
curl -k -sS --resolve admin.<域名>:443:127.0.0.1 https://admin.<域名>/api/v1/catalog/categories
curl -k -sS --resolve wx.<域名>:443:127.0.0.1 https://wx.<域名>/api/v1/catalog/products
```

预期 admin 接口返回 JSON、wx 返回公开产品 JSON、`https://wx.<域名>/` 返回 404；卷名必须是 `zjaq_mysql-data` 与 `zjaq_private-storage`。也可在 `/opt/zjaq` 执行 `deploy/scripts/healthcheck.sh`；该脚本用本机 443 加 Host 头探测，若结果与预期不符，以 `--resolve` 方式复测为准。

浏览器逐项确认：

- [ ] `https://admin.<域名>/` 可登录，接口走同源 `/api/v1`，浏览器无 CORS 报错
- [ ] 上传一个 >100 MiB 文件不报 413（上限已确认 512 MB）
- [ ] `https://wx.<域名>/api/v1/catalog/products` 返回 JSON，根路径 404
- [ ] 小程序真机请求 `https://wx.<域名>/api/v1`，列表/详情/预览正常
- [ ] 微信后台已配置 request 合法域名
- [ ] `https://portal.<域名>/` 销售账号可登录浏览
- [ ] 重启服务器后编排内服务自动恢复

### 15.8 日常运维

| 操作 | 做法 |
| --- | --- |
| 查看日志 | 编排详情 → 容器 → 日志；或 `docker compose logs --tail=200` |
| 更新镜像 | `/opt/zjaq/deploy/.env` 改 `IMAGE_TAG` → 重跑 `build-images.sh` → 编排页「重建」（`.env` 为软链接时无需再复制） |
| 回滚 | 编排目录 `.env` 改回旧 `IMAGE_TAG` → 「重建」；旧镜像未删除即可离线回滚 |
| 备份 | `/opt/zjaq/deploy/scripts/backup.sh`；可在 1Panel「计划任务」建每日 shell 任务 |
| 恢复 | 先停 api/portal，再执行 `restore.sh <sql> <storage.tar.gz>` |
| 证书续期 | 替换证书文件 → `docker compose restart web` 或编排页重启 web |
| 删除编排 | 先备份。删除编排通常执行 `compose down`，卷一般保留，但不要把删除当作清理数据的手段 |

### 15.9 故障排查（1Panel 专项）

| 现象 | 原因与处理 |
| --- | --- |
| 创建编排后立即启动失败，提示 `MYSQL_ROOT_PASSWORD` 未设置 | 编排目录缺 `.env`；按 15.5 第 4 步复制后重新启动 |
| web 报 `port is already allocated` / `address already in use` | 说明 compose 仍在发布 80/443；改为 `127.0.0.1:8080:443` 后重建 web。**不要停 OpenResty** |
| `Pool overlaps with other one on this address space` | 172.28.0.0/16 被其他容器网络占用；需改网段，见 15.10 |
| 备份脚本报卷不存在 | 实际卷名不是 `zjaq_private-storage`，多为编排文件夹名不是 `zjaq`；先确认卷与数据再重建 |
| API 返回 403「Host 不可用」 | `ALLOWED_HOSTS` 缺少实际 Host，或中间网关改写了 Host；必须包含 admin、wx 域名与 `api:3100` |
| 后台能打开但接口 404 / CORS | `ALLOWED_ORIGINS` 缺少 admin 域名，或 web 的 admin server 块没有 `/api/v1/` 反代；确认已重建 web 镜像 |
| 小程序接口 404 | wx server 块只反代 `/api/`；检查小程序基址是否为 `https://<wx 域名>/api/v1` |
| nginx 报证书文件不存在 | `TLS_DIR` 指向错误（相对路径按编排目录解析）或证书未复制 |
| 构建时 Node 进程被杀 | 内存不足；Next.js 构建建议 ≥4 GB 内存或临时加 swap |
| 编排列表出现重复项目/容器 | 曾在 `/opt/zjaq/deploy` 执行过 `deploy.sh`；只保留 1Panel 一个入口，清理前先确认数据卷 |

### 15.10 仍需另行计划的变更

方案 B 与 2026-11-11 同源口径的**仓库侧改动已完成**：`deploy/compose.yml` 的 web 端口与 `WX_DOMAIN` 环境变量、`deploy/env/.env.example` 三域与安全配置、`deploy/1panel/zjaq-product-platform.conf` 三域模板、`deploy/nginx/default.conf.template` 的 admin/wx `/api` 分支、`deploy/docker/Dockerfile.web` 去掉 H5、`deploy/scripts/build-images.sh` 双轨基址。服务器侧尚未实施，证书路径仍待用户提供。以下情况仍会改动 `deploy/` 或数据卷，必须先出计划并等待确认：

1. 在目标机实际部署 OpenResty 反代：需域名、证书、实测跳地址与 `conf.d` 挂载路径就绪；按 `plans/active/2026-11-10-1panel-openresty-reverse-proxy.md` 与 `plans/active/2026-11-11-same-origin-api-domains.md` 执行。
2. `172.28.0.0/16` 冲突：需同步修改 compose 的 subnet、web/api 固定 IP 与 `TRUSTED_PROXY_ADDRESSES`。
3. 复用 1Panel 应用商店 MySQL：需移除 compose 内 mysql、改 `MYSQL_HOST` 并迁移现有数据。
4. 让备份/恢复脚本自动识别项目名，而不是硬编码 `zjaq_private-storage`。
5. 若不接受信任 OpenResty→web 的网关地址：需改 `web` 的 nginx 模板做 `real_ip`，涉及重建镜像，另行计划。
6. 恢复 H5 部署：需重新加入 H5 构建、`COPY h5`、h5 server 块与证书域名，属于新范围，需另立计划。

