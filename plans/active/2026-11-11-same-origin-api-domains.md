# 同源 `/api` 访问口径评估与补充计划（修订版）

日期：2026-11-11。状态：**仓库侧已实施并通过静态校验；服务器侧待证书路径与目标机操作授权，尚未连接目标机。**
关联计划：`plans/active/2026-11-10-1panel-openresty-reverse-proxy.md`（方案 B，已批准、仓库侧部分实施）。

> 2026-11-11 修订：用户澄清 `wx.product.zhongjianquan.com` 是**小程序接口域名**，H5 端不参与本次部署；不再保留 `api.` 子域；H5 server 块与 H5 构建整段移除。本文件已按此口径重写。
>
> 2026-11-11 补充确认：小程序基址 `https://wx.product.zhongjianquan.com/api/v1` **已获用户确认**；wx 块只做 `/api` 反代、不托管静态页面。**后台单文件上传上限已确认为 512 MB**：admin server 块与 OpenResty admin 块两层都按 `512m` 配置并关闭请求缓冲。`web` 镜像重建是必然影响，不需另行选择。

## 一、背景与输入

| 用途 | 域名 | 说明 |
| --- | --- | --- |
| PC 门户（Next.js） | `portal.product.zhongjianquan.com` | 浏览器走自身 `/api`（Next 路由），不改 |
| 管理后台（Vue SPA） | `admin.product.zhongjianquan.com` | 浏览器走同源 `/api/v1`，需新增反代 |
| 小程序接口 | `wx.product.zhongjianquan.com` | **已确认**；只做 `/api` 反代到 API，不托管静态页面 |
| H5 | — | **本次不部署**，不构建、不发布 |
| `api.` 子域 | — | **不需要**，不再保留 server 块 |

要求：admin 同源 `/api/v1`；portal 不改且 `/api` 不反代；小程序基址为绝对 `https://wx.product.zhongjianquan.com/api/v1`（**已确认**）；证书 SAN 只覆盖 portal、admin、wx 三域。后台单文件上传上限已确认为 512 MB，本文出现的 `512m` 均为最终值。

## 二、结论摘要

1. **admin 改相对 `/api/v1` 可行**，但必须在 `web` 的 admin server 块新增 `/api/v1/` 反代，并按已确认的 512 MB 配置上传上限、关闭请求缓冲。
2. **wx server 块只保留 `/api` 反代**，不托管静态文件；原 h5 与 api server 块从模板删除。
3. **必须重建 `zjaq/web` 镜像**：模板在 `Dockerfile.web` 构建时被 `COPY`，不是运行期挂载。方案 B 原来「不重建 web」的前提失效。
4. **`Dockerfile.web` 的 `COPY h5` 必须同步删除**。只删 H5 构建、不删 COPY，会因构建上下文缺少 `h5/` 目录直接失败；用空目录兜底虽能过构建，但会留下无用的静态 server 块，不推荐。
5. **小程序必须使用绝对地址**，基址 `https://wx.product.zhongjianquan.com/api/v1` 已确认；微信后台需配置 request 合法域名。小程序请求不是浏览器请求，**不涉及 CORS**，不发 `Origin`。
6. **portal 完全不改**：浏览器走 Next 自己的 `/api/*`，服务端继续走 `http://api:3100/api/v1`；portal 的 `/api` 严禁反代。
7. 安全配置按三域重算：`ALLOWED_ORIGINS` 只需 admin；`ALLOWED_HOSTS` 为 admin、wx、`api:3100`、`127.0.0.1:3100`；`TRUSTED_PROXY_ADDRESSES` 与方案 B 相同。
8. 合并方式：本文件作为方案 B 的补充计划，不改 B 的反代架构；实施时同步修订 B 的模板与环境变量说明。

## 三、逐项评估

### 3.1 各端 API 基址现状与可行性

**管理后台**：`apps/admin/src/api.ts`

```ts
const base =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
```

- 使用 `fetch` 与 `packages/api-client` 的 XHR 上传；浏览器接受相对 URL，按文档源解析。
- 登录、登出、媒体会话（`credentials: "include"`）在 admin 域下都变成 `/api/v1/...`，视为同源。
- 媒体 Cookie 由 API 下发，`Path=/api/v1/admin/products/`，在 admin 域下路径一致，继续有效。
- Banner/图片路径直接作为 `<img src>`，相对路径会请求 admin 域的 `/api/v1/...`，依赖新增反代。

结论：**admin 可用 `/api/v1`**，前提是 web 的 admin 块新增反代并放开上传大小。

**小程序**：`apps/mobile/src/api.ts`

```ts
export const apiBase =
  import.meta.env.VITE_API_BASE_URL ?? "http://127.0.0.1:3100/api/v1";
```

- `uni.request` 在微信小程序端**只接受绝对 HTTPS 地址**，且域名必须在微信后台白名单内。
- **已确认基址**：`https://wx.product.zhongjianquan.com/api/v1`。
- 图片/视频/下载使用 `resourceUrl` 拼接的绝对地址；`imageSource` 仅对 `http://` 走 `uni.downloadFile`，HTTPS 直接交给 `<image>`。
- 小程序请求不带 `Origin`，API 的 Origin 校验会因「无 Origin」放行；这**不是 CORS**，也不需要 `Access-Control-*` 响应头。

**H5**：本次不构建、不部署。`apps/mobile` 仍包含 H5 条件编译代码，但不在本轮产物与验收范围内。原评估中「H5 相对 URL 待验证」的条目**全部移除**。

**PC 门户**：已同源，不改

- `apps/portal/components/public-api.ts` 的 `mediaUrl` 返回 `/api/sales/...` 或 `/api/catalog/...`，由 Next 路由处理。
- 路由处理器：`app/api/sales/session/route.ts`、`app/api/sales/[...path]/route.ts`、`app/api/catalog/[...path]/route.ts`。
- `apps/portal/lib/sales-session.ts` 的 `apiBase()` 读取 `PORTAL_API_BASE_URL`，compose 中为 `http://api:3100/api/v1`，**继续走容器内网**。
- **portal 的 `/api/*` 归 Next 所有，绝不能在 web 或 OpenResty 给 portal 加 `/api` 反代**，否则打断登录、销售会话与媒体代理。

### 3.2 nginx server 块现状与改法

`deploy/nginx/default.conf.template` 现状：80 跳转 + portal + admin + h5 + api 共 5 块。新口径下改为 1 个 80 跳转 + 3 个 443 块：

| server 块 | 新处理方式 |
| --- | --- |
| 80 | `portal`、`admin`、`wx` 三域 301 到 HTTPS |
| portal（443） | 不变：`proxy_pass http://portal:3000`，**不加 `/api`** |
| admin（443） | 静态 SPA + 新增 `location /api/v1/` 反代到 `http://api:3100`；server 级 `client_max_body_size 512m`（已确认） |
| wx（443） | **只**有 `location /api/` 反代到 `http://api:3100`，`location /` 返回 404；无静态根目录 |
| h5（443） | **删除** |
| api（443） | **删除**（不再有 api 子域） |

admin 新增内容（`client_max_body_size 512m` 已确认）：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name ${ADMIN_DOMAIN};

    # ...证书与现有静态配置...

    client_max_body_size 512m;
    client_body_timeout 120s;

    location /api/v1/ {
        proxy_pass http://api:3100;
        proxy_http_version 1.1;
        proxy_request_buffering off;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    # ...现有 /assets/、/index.html、/ ...
}
```

wx 新块：

```nginx
server {
    listen 443 ssl;
    http2 on;
    server_name ${WX_DOMAIN};

    ssl_certificate     /etc/nginx/certs/fullchain.pem;
    ssl_certificate_key /etc/nginx/certs/privkey.pem;
    ssl_protocols       TLSv1.2 TLSv1.3;
    ssl_session_cache   shared:SSL:10m;
    ssl_session_timeout 10m;

    add_header X-Content-Type-Options nosniff always;
    client_max_body_size 32m;

    location /api/ {
        proxy_pass http://api:3100;
        proxy_http_version 1.1;
        proxy_buffering off;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }

    location / {
        return 404;
    }
}
```

要点：

- 用 `location /api/` 覆盖小程序全部接口前缀；`Host $host` 为 `wx.product.zhongjianquan.com`，需进 `ALLOWED_HOSTS`。
- wx 块没有 `root`，不会误托管任何静态文件；根路径明确 404，避免出现「看似网站」的空白页。
- 前缀匹配优先于 `location /`，不影响 admin 的 SPA 回退。
- portal 与 api 块不动/删除，不做其他改写。

#### 3.2.1 `Dockerfile.web` 的 H5 COPY 影响

`deploy/docker/Dockerfile.web` 当前：

```dockerfile
COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY admin /usr/share/nginx/html/admin
COPY h5 /usr/share/nginx/html/h5
```

`build-images.sh` 当前：

```bash
cp -r apps/admin/dist "$WEB_CTX/admin"
cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"
cp -r deploy/nginx "$WEB_CTX/nginx"
docker build -f deploy/docker/Dockerfile.web -t "zjaq/web:$IMAGE_TAG" "$WEB_CTX"
```

如果只删 H5 构建与 `cp`、保留 `COPY h5`：构建上下文没有 `h5/`，`docker build` 会在该 `COPY` 处报 `not found` 失败。
如果保留 `cp` 但已删 H5 构建：`set -e` 下 `cp -r` 因源目录不存在直接失败；若本地残留旧 `dist/build/h5`，则会静默打包**过期产物**，更危险。

最省事且干净的处理（推荐）：

1. `Dockerfile.web` 删除 `COPY h5 /usr/share/nginx/html/h5`；
2. `build-images.sh` 删除 `pnpm build:h5` 与 `cp -r apps/mobile/dist/build/h5 ...`；
3. 模板删除 h5 server 块。

这样不需要空目录，也不会留下无用的静态配置。web 镜像本来就要因 `/api` 反代而重建，多删一行 COPY 不增加验证面。

不推荐但可用的兜底：保留 `COPY h5`，在脚本里 `mkdir -p "$WEB_CTX/h5"`。能过构建，但镜像里多一个空目录、模板里多一个无意义的 h5 server 块，后续容易被误认为 H5 仍在服务。

### 3.3 构建脚本与 `.env.example` 的双轨基址

`build-images.sh` 建议改为：

```bash
# 浏览器端（admin）走同源 /api
WEB_API_BASE="/api/v1"
# 微信小程序必须绝对 HTTPS，且需在微信后台配置合法域名（域名已确认）
MP_API_BASE="https://$WX_DOMAIN/api/v1"

VITE_API_BASE_URL="$WEB_API_BASE" pnpm build:admin
VITE_API_BASE_URL="$MP_API_BASE" pnpm build:mp-weixin
PORTAL_API_BASE_URL="http://api:3100/api/v1" pnpm build:portal
```

- 删除 `pnpm build:h5`。
- 删除 `cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"`。
- 小程序产物不进入 `zjaq/web` 镜像，单独交微信开发者工具；本轮只改基址。
- 脚本提示文案从「API 地址烧录为 $API_BASE」改为分别说明 admin 相对、小程序绝对。

`.env.example` 建议：

```dotenv
# 三个域名（H5 不参与部署，不再有 api 子域）
PORTAL_DOMAIN=portal.product.zhongjianquan.com
ADMIN_DOMAIN=admin.product.zhongjianquan.com
WX_DOMAIN=wx.product.zhongjianquan.com

# 浏览器端 Origin：只有 admin 直连 API（portal 走自身 Next 路由，wx 为小程序无 Origin）
ALLOWED_ORIGINS=https://admin.product.zhongjianquan.com
# API 的 Host 白名单：admin/wx 经 web 透传 Host；portal 服务端走容器内网
ALLOWED_HOSTS=admin.product.zhongjianquan.com,wx.product.zhongjianquan.com,api:3100,127.0.0.1:3100
TRUSTED_PROXY_ADDRESSES=172.28.0.10,<实测跳地址>

PORTAL_PUBLIC_ORIGIN=https://portal.product.zhongjianquan.com
```

同时需要同步 `deploy/compose.yml` 的 `web.environment`：删除 `H5_DOMAIN`、`API_DOMAIN`，新增 `WX_DOMAIN`。否则 nginx 模板的 `${WX_DOMAIN}` 渲染为空，且 compose 会因 `:?` 校验继续要求旧变量。

环境变量改名会影响：`compose.yml`、`default.conf.template`、`.env.example`、`build-images.sh`、OpenResty 模板占位符、`docs/production-deployment.md` 第 15 章。目标机 `deploy/.env` 必须同步改名，不能只加不删。

### 3.4 三项安全配置取值

**ALLOWED_ORIGINS**

`services/domain/src/http.ts` 对 `Origin` 精确匹配，无 `Origin` 时放行。按三域重算：

- admin：浏览器同源 `/api/v1`，POST/PUT 仍会带 `Origin: https://admin.product.zhongjianquan.com`，**必须列入**。
- portal：浏览器只请求 Next 的 `/api/*`，服务端 fetch 不带 `Origin`，**不需要列入**。
- wx：小程序 `uni.request` 不是浏览器请求，不带 `Origin`，**不涉及 CORS，不需要列入**。

```dotenv
ALLOWED_ORIGINS=https://admin.product.zhongjianquan.com
```

如需为将来直连留口，可把 portal、wx 也加上，但当前最小面只需要 admin。

**ALLOWED_HOSTS**

`Host` 精确匹配；OpenResty 与 web 均 `Host $host` 透传：

- admin 经 `/api` 请求 → Host 为 admin 域；
- wx 经 `/api` 请求 → Host 为 wx 域；
- portal 服务端 → Host `api:3100`；
- 容器健康检查 → `127.0.0.1:3100`。

```dotenv
ALLOWED_HOSTS=admin.product.zhongjianquan.com,wx.product.zhongjianquan.com,api:3100,127.0.0.1:3100
```

portal 域名与已删除的 api 域名都不加入。

**TRUSTED_PROXY_ADDRESSES**

不因同源而改变。API 的直接对端仍是 `web`（`172.28.0.10`），web 再追加 OpenResty→web 的实测跳地址（预期 `172.28.0.1`）。

```dotenv
TRUSTED_PROXY_ADDRESSES=172.28.0.10,<实测跳地址>
```

### 3.5 与已批准方案 B 的关系

- 架构不变：OpenResty 仍是唯一 80/443 入口，`web` 仍只绑 `127.0.0.1:8080`，双层 TLS 保留。
- 本补充计划新增/修订：
  1. 环境变量由四域改为三域，删除 `H5_DOMAIN`、`API_DOMAIN`，新增 `WX_DOMAIN`；
  2. `web` nginx 模板删除 h5、api server 块，新增 wx 的 `/api` 块，admin 增加 `/api/v1/` 与 512m；
  3. `Dockerfile.web` 删除 `COPY h5`；
  4. `build-images.sh` 删除 H5 构建与拷贝，小程序基址改为 `https://wx...`；
  5. OpenResty 模板同步三域、删除 H5/API 块、wx 只反代 `/api`，admin 上传提到 512m；
  6. **web 镜像重建成为必需**，方案 B 中「不重建 web」的前提作废；
  7. 证书 SAN 只覆盖 portal、admin、wx。
- 建议不重写 B 计划正文，只在其状态行与实施记录中引用本文件；两份计划实施完成后一并归档。

## 四、与现有实现的冲突与不确定项（如实说明）

1. **`web` 镜像必须重建**：与方案 B 原「不改模板、不重建」直接冲突。`/api` 反代只能加在 web 的 server 块；OpenResty 是 host 网络，无法直接访问未发布宿主端口的 `api` 容器。
2. **`COPY h5` 会在构建期失败**：只删 H5 构建不删 COPY，构建上下文缺少 `h5/` 目录，`docker build` 直接报错。
3. **删除 H5 构建后残留产物风险**：若保留 `cp`，本地旧 `dist/build/h5` 会被打进镜像，形成「已下架但仍可访问」的隐性入口。
4. **admin 上传默认 1m 限制**：admin server 块当前无 `client_max_body_size`，默认 1m。改同源上传后大文件必 413，必须显式放开到已确认的 512m。
5. **OpenResty admin 32m 上限**：同样会拦大文件上传，必须与 web 同值改为 512m 并关闭请求缓冲。
6. **小程序只能绝对地址**：`uni.request` 与微信域名白名单要求 `https://wx.product.zhongjianquan.com/api/v1`，该基址已确认。
7. **小程序不涉及 CORS**：它不带 `Origin`，API 的 `ALLOWED_ORIGINS` 不为其服务；不要把 wx 配成「前端 Origin」来理解。
8. **portal `/api` 不能反代**：Next 自身占用 `/api/sales`、`/api/catalog`、`/api/sales/session`；误加反代会绕过销售会话校验。
9. **环境变量改名是破坏性变更**：`H5_DOMAIN`、`API_DOMAIN` 在 compose、模板、脚本、文档、目标机 `.env` 中都有引用；只改一处会出现空 `server_name` 或 compose 启动失败。
10. **证书 SAN 变更**：新版证书只含 portal、admin、wx；旧证书若含 api 域不影响使用，但不能反过来缺三域。
11. **双层上传缓冲**：OpenResty 与 web 任一层保留默认请求缓冲，500 MiB 都会先落盘，可能导致磁盘与超时问题；两层都要 `proxy_request_buffering off`。

## 五、建议改动清单（提案，未实施）

### 5.1 `deploy/nginx/default.conf.template`

- 80 跳转：`server_name` 改为 `${PORTAL_DOMAIN} ${ADMIN_DOMAIN} ${WX_DOMAIN}`。
- portal 块：不动，不加 `/api`。
- admin 块（上传上限已确认 512m）：
  - 新增 `client_max_body_size 512m;`、`client_body_timeout 120s;`
  - 新增 `location /api/v1/`：`proxy_pass http://api:3100;`、`proxy_http_version 1.1;`、`proxy_request_buffering off;`、`proxy_buffering off;`、Host/XFF/XFP 透传、读写超时 300s。
- 删除 h5 块。
- 删除 api 块。
- 新增 wx 块：只含 `location /api/` 反代与 `location / { return 404; }`，无 `root`，32m。

### 5.2 `deploy/docker/Dockerfile.web`

- 删除 `COPY h5 /usr/share/nginx/html/h5`。
- 其余不变（仍 `COPY admin`、`COPY nginx/...`）。

### 5.3 `deploy/scripts/build-images.sh`

- 删除 `pnpm build:h5`。
- 删除 `cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"`。
- 保留 `pnpm build:mp-weixin`，基址改为 `https://$WX_DOMAIN/api/v1`。
- admin 基址改为 `/api/v1`；portal 不变。
- 更新提示文案；`IMAGE_TAG` 由运维升到新日期。

### 5.4 `deploy/compose.yml`

- `web.environment`：删除 `H5_DOMAIN`、`API_DOMAIN`，新增 `WX_DOMAIN: ${WX_DOMAIN:?请在 deploy/.env 设置 WX_DOMAIN}`。
- 端口、固定 IP、卷、网络不动。

### 5.5 `deploy/env/.env.example`

- 域名改为三个真实值，新增 `WX_DOMAIN`，删除 `H5_DOMAIN`、`API_DOMAIN`。
- `ALLOWED_ORIGINS`、`ALLOWED_HOSTS`、`PORTAL_PUBLIC_ORIGIN` 按 3.4 更新。
- `TRUSTED_PROXY_ADDRESSES` 保留两跳说明与占位。
- 注释说明：admin 同源 `/api/v1`；wx 为小程序接口域名；H5 不部署。

### 5.6 `deploy/1panel/zjaq-product-platform.conf`

- 80 跳转改为三域，删除 `<H5_DOMAIN>`、`<API_DOMAIN>` 占位符，新增 `<WX_DOMAIN>`。
- 删除 h5 server 块。
- 删除 api server 块。
- 新增 wx server 块：只反代 `/api/`，`location / { return 404; }`，32m。
- admin 块：`client_max_body_size 32m` → `512m`（已确认），追加 `client_body_timeout 120s;`、`proxy_request_buffering off;`、`proxy_read_timeout 300s;`、`proxy_send_timeout 300s;`。
- portal 块不变。

### 5.7 `docs/production-deployment.md` 第 15 章

- 域名示例改为 portal、admin、wx 三域，删除 H5 与 api 子域。
- 说明 H5 不部署、小程序走 wx 域 `/api`。
- 增加「浏览器同源 `/api`，小程序绝对地址」说明。
- 增加 web 镜像重建与新 `IMAGE_TAG`。
- 增加 admin 上传 512m 在 OpenResty 与 web 两层的配置要求。
- 保留「方案 A 已否决、严禁停用 OpenResty」警示。

## 六、最终版实施步骤

### 6.1 仓库改动（按文件清单，仅本轮范围）

| 顺序 | 文件 | 改动 |
| --- | --- | --- |
| 1 | `deploy/nginx/default.conf.template` | 80 跳转改三域；portal 不动；admin 加 `/api/v1/` + 512m + 关闭缓冲；删除 h5、api 块；新增 wx 仅 `/api/` 块 |
| 2 | `deploy/docker/Dockerfile.web` | 删除 `COPY h5 /usr/share/nginx/html/h5` |
| 3 | `deploy/scripts/build-images.sh` | 删除 `build:h5` 与 h5 拷贝；admin 用 `/api/v1`，小程序用 `https://$WX_DOMAIN/api/v1` |
| 4 | `deploy/compose.yml` | `web.environment` 删除 `H5_DOMAIN`/`API_DOMAIN`，加入 `WX_DOMAIN`；端口与固定 IP 不动 |
| 5 | `deploy/env/.env.example` | 三域名、`ALLOWED_ORIGINS`/`ALLOWED_HOSTS`、`PORTAL_PUBLIC_ORIGIN`、两跳代理说明 |
| 6 | `deploy/1panel/zjaq-product-platform.conf` | 三域占位符；删除 h5/api 块；wx 仅 `/api/`；admin 32m → 512m 并关闭请求缓冲 |
| 7 | `docs/production-deployment.md` 第 15 章 | 同步三域、同源 `/api`、小程序绝对基址、镜像重建与 512m 两层要求 |

### 6.2 本机静态校验（不改目标机）

1. 模板：1 个 80 + 3 个 443；无 h5、api 块；`location /api` 只在 admin/wx；portal 无 `/api`；admin 为 `512m` 且含 `proxy_request_buffering off`。
2. `Dockerfile.web`：无 `COPY h5`；构建上下文不再需要 `h5/`。
3. `build-images.sh`：无 `build:h5`、无 h5 拷贝；admin 基址 `/api/v1`，小程序基址 `https://$WX_DOMAIN/api/v1`。
4. `.env.example` 与 `compose.yml` 变量名一致；无 `H5_DOMAIN`/`API_DOMAIN` 残留。
5. 本机无 Docker/nginx 时，只能做结构检查，须在报告中注明「不是语法验证」。

### 6.3 服务器执行顺序

1. 备份：`deploy/.env`、编排目录 compose 副本、`conf.d` 整目录、现有站点与面板状态码基线。
2. 更新 `deploy/.env`：三域名、`ALLOWED_ORIGINS`、`ALLOWED_HOSTS`、`PORTAL_PUBLIC_ORIGIN`、新 `IMAGE_TAG`；删除旧的 `H5_DOMAIN`/`API_DOMAIN`。
3. 同步编排目录的 compose 副本：删除 `H5_DOMAIN`/`API_DOMAIN`，加入 `WX_DOMAIN`。
4. 重建镜像：`deploy/scripts/build-images.sh`，确认 `zjaq/web:<新 tag>` 生成且镜像内无 h5 目录。
5. `docker compose up -d web api`（portal 环境变量未变，可不动；如 tag 变化则一并 up）。
6. 直连验证 web：`curl -k --resolve admin...:8080:127.0.0.1 https://admin...:8080/api/v1/catalog/categories`。
7. OpenResty：写入三域 + 证书目录的新配置 → `openresty -t` → `openresty -s reload`。
8. 实测 OpenResty→web 跳地址，写入 `TRUSTED_PROXY_ADDRESSES`，`docker compose up -d api`。
9. 按第七节逐项验证，并复核现有站点与 1Panel 面板状态码与基线一致。
10. 记录实际命令与结果；两份计划完成后归档。

## 七、验证清单

**构建产物**

- [ ] `apps/admin/dist` 内不存在 `wx.product.zhongjianquan.com`，存在 `/api/v1`。
- [ ] `apps/mobile/dist/build/mp-weixin` 内存在 `https://wx.product.zhongjianquan.com/api/v1`。
- [ ] 构建过程未生成/拷贝 `h5` 目录，`docker build` 无 `COPY h5` 报错。
- [ ] `apps/mobile/dist/build/h5` 如存在，未被放入 web 镜像（`docker run --rm zjaq/web:<tag> ls /usr/share/nginx/html` 无 h5）。

**admin**

- [ ] `https://admin.../api/v1/auth/login` 登录成功，浏览器无 CORS 预检/报错。
- [ ] 验证 512 MiB 上限：>100 MiB 资料不返回 413；条件允许时验证 500 MiB 边界。
- [ ] 媒体会话 Cookie 下发后，图片/附件内容可加载。
- [ ] 产品列表、发布、下架、统计、反馈、Banner 等接口正常。
- [ ] admin 根路径与静态资源正常，SPA 路由回退正常。

**wx（小程序接口域）**

- [ ] `https://wx.../api/v1/catalog/products` 返回 JSON。
- [ ] `https://wx.../` 返回 404，不暴露静态目录。
- [ ] 小程序真机：请求绝对 `https://wx.product.zhongjianquan.com/api/v1`。
- [ ] 微信后台 request 合法域名已配置；如启用 `uni.downloadFile`，downloadFile 域名也已配置。
- [ ] 小程序列表、详情、PDF/图集/视频预览正常。

**portal**

- [ ] 销售登录 `/api/sales/session` 正常。
- [ ] 产品/资料/查看器页面正常，媒体经 Next 路由返回。
- [ ] 门户 `/api/*` 未被 nginx 反代（响应行为与 Next 一致）。

**安全与链路**

- [ ] 伪造 `X-Forwarded-For: 1.2.3.4` 不改变 API 记录的客户端 IP。
- [ ] API 记录的是真实客户端 IP，不是 `172.28.0.1` / `172.28.0.10`。
- [ ] 非白名单 `Origin` 请求仍返回 403。
- [ ] 非白名单 `Host` 请求仍返回 403。
- [ ] 现有站点与 1Panel 面板状态码与基线一致。

## 八、回滚

1. **前端回退**：admin 基址改回绝对地址（需重新引入一个 API 域名或直连 IP，视现场而定）→ 重建 → `docker compose up -d web`。
2. **回退 nginx `/api` 分流**：删除 admin 的 `location /api/v1/` 与 512m → 重建 web 镜像 → `up -d web`。
3. **恢复 H5**（如后续需要）：重新加回 `pnpm build:h5`、`cp`、`COPY h5` 与 h5 server 块；属于新范围，需另立计划。
4. **回退 OpenResty admin 限额**：恢复 32m 与默认缓冲 → `openresty -t` → `-s reload`。
5. **整镜像回退**：`.env` 的 `IMAGE_TAG` 改回上一版 → `docker compose up -d`；旧镜像仍在本地。
6. 回滚后复查 admin 登录、小程序接口、portal 登录与 1Panel 面板。

## 九、口径状态

### 9.1 已确认（固化进实现）

| 项 | 结论 |
| --- | --- |
| 域名 | portal、admin、wx 三域；不保留 `api.` 子域；H5 不部署 |
| wx 用途 | 小程序接口域名；server 块只做 `/api` 反代，不托管静态；根路径 404 |
| 小程序基址 | `https://wx.product.zhongjianquan.com/api/v1` |
| admin | 同源 `/api/v1`；web admin 块新增 `/api/v1/` 反代到 `http://api:3100` |
| 上传上限 | 512 MB；admin server 块与 OpenResty admin 块均为 `512m`，并 `proxy_request_buffering off` |
| portal | 不改；浏览器走 Next 自身 `/api`；服务端 `http://api:3100/api/v1`；`/api` 不反代 |
| H5 | 本次不构建、不部署；删除 `COPY h5`、h5 server 块与 H5 构建步骤 |
| 证书 | SAN 只含 portal、admin、wx |
| `ALLOWED_ORIGINS` | `https://admin.product.zhongjianquan.com` |
| `ALLOWED_HOSTS` | `admin.product.zhongjianquan.com,wx.product.zhongjianquan.com,api:3100,127.0.0.1:3100` |
| `TRUSTED_PROXY_ADDRESSES` | `172.28.0.10,<实测跳地址>` |
| 配置合并 | 本补充计划 + 方案 B；实施后两份计划一并归档 |

### 9.2 必然影响（不是可选项，需知情）

- `zjaq/web` 镜像必须重建并升 `IMAGE_TAG`；沿用旧镜像启动的 web 不含 admin/wx 的 `/api` 反代。
- 目标机 `deploy/.env` 与编排目录 compose 副本必须同步改名；只改仓库会导致 compose 启动失败或 `server_name` 为空。
- 目标机必须重新 `docker compose up -d web`；只改文件不重启不生效。

### 9.3 仍需用户动作

- 仓库侧已实施；服务器侧需用户提供证书路径、DNS 与目标机操作授权。
- 在服务器侧执行前，不连接、不 reload、不重启、不构建远程环境。

## 十、当前状态

- 仓库侧已按第 6 节实施：7 个计划文件完成；另修正 3 个直接消费旧环境变量的部署脚本（见第 11 节差异说明）。
- 本机静态校验 33 项全部通过；`nginx -t`、`docker compose config`、真实构建与目标机验证均未执行。
- 目标服务器未连接，未执行任何远程命令；证书路径仍待用户提供。

## 十一、实施记录（仓库侧，2026-11-11）

### 11.1 实际改动

计划内 7 个文件：

1. `deploy/nginx/default.conf.template`：80 跳转改三域；portal 保持 Next `/api`；admin 新增 `/api/v1/`（512m、请求缓冲关闭）；删除 h5/api 块；新增 wx 仅 `/api/` 块与根路径 404。
2. `deploy/docker/Dockerfile.web`：删除 `COPY h5`；注释改为仅 admin。
3. `deploy/scripts/build-images.sh`：删除 `build:h5` 与 h5 拷贝；`WEB_API_BASE=/api/v1`、`MP_API_BASE=https://$WX_DOMAIN/api/v1`；变量校验改为 `WX_DOMAIN`。
4. `deploy/compose.yml`：`web.environment` 由四域改为 `PORTAL_DOMAIN/ADMIN_DOMAIN/WX_DOMAIN`；端口仍为 `127.0.0.1:8080:443`。
5. `deploy/env/.env.example`：三真实域名；`ALLOWED_ORIGINS` 仅 admin；`ALLOWED_HOSTS` 四值；`IMAGE_TAG=2026-11-11`。
6. `deploy/1panel/zjaq-product-platform.conf`：三域占位符；删除 h5/api 块；wx 仅 `/api/`；admin 512m 且关闭请求缓冲。
7. `docs/production-deployment.md`：第 15 章同步三域与同源 `/api`；另修正第 1～4 章中与新模板直接矛盾的架构图、域名/证书/环境变量/构建说明。

### 11.2 计划与实际代码的差异

计划第 5 节只列了 7 个文件，但实际还有 3 个部署脚本直接读取 `H5_DOMAIN`/`API_DOMAIN`；不改会留下失效或直接报错的路径，因此做了最小修正：

- `deploy/scripts/healthcheck.sh`：入口从「门户/后台/H5/API」改为「门户/后台/小程序 `/api/v1/catalog/products`」。
- `deploy/scripts/deploy.sh`：结束提示改为三域，小程序提示 `https://$WX_DOMAIN/api/v1`。
- `deploy/scripts/make-self-signed-cert.sh`：SAN 由四域改为 `PORTAL/ADMIN/WX` 三域。

未改动 API、portal、admin 业务源码；未修改 `compose.yml` 端口、固定 IP、卷与网络。

### 11.3 实际执行的校验命令与结果

- `node -v` → Node 22；`node -e "require.resolve('yaml')"` → 可用。
- 临时脚本（位于系统 Temp，不在仓库）执行 33 项结构断言 → **33 项全部通过**：
  - web 模板：4 个 server（1×80 + 3×443）、无 `H5_DOMAIN/API_DOMAIN`、admin `/api/v1/` 唯一、wx `/api/` 唯一、admin 512m、两处请求缓冲关闭、花括号平衡。
  - Dockerfile.web：无 `COPY h5`，保留 `COPY admin`。
  - build 脚本：无 `build:h5`、无 h5 拷贝、两套基址正确、保留 `build:mp-weixin`。
  - compose：YAML 解析成功；web 环境变量恰为 `PORTAL_DOMAIN/ADMIN_DOMAIN/WX_DOMAIN`；端口未变。
  - `.env.example`：三域、无旧变量、Origin/Host 取值正确。
  - OpenResty 模板：4 个 server（1×80 + 3×443）、无旧占位符、admin 512m、wx 仅 `/api/` 且根 404、花括号平衡。
  - 文档第 15 章：无旧域变量与 h5/api 示例，含「web 镜像必须重建」。
- `grep H5_DOMAIN|API_DOMAIN` 复查：`deploy/` 下已无残留（3 个脚本修正后）。

### 11.4 未执行与限制

- 未运行 `nginx -t`：本机无 nginx，模板为 envsubst 前形态，不能代替渲染后的语法验证。
- 未运行 `docker compose config`、未构建任何镜像：本机无 Docker；`build-images.sh` 的真实行为待构建机验证。
- 未启动目标机上的任何服务，未执行 reload/restart/build。
- 未验证 admin 上传、同源 `/api`、wx 小程序真机与 IP 链路：均需目标环境。
- 证书路径、DNS、实测 OpenResty→web 跳地址仍未提供，服务器侧实施保持待定。

### 11.5 服务器侧仍需用户提供/授权

1. 三个域名的 DNS A 记录与 SAN 证书（仅 portal/admin/wx），以及证书在 OpenResty 容器内的实际目录。
2. 目标机 `deploy/.env` 修改与编排目录 compose 副本同步的授权。
3. 目标机执行构建、`docker compose up -d`、OpenResty `nginx -t`/reload 的授权。
4. 实测 OpenResty→web 的跳地址，用于补全 `TRUSTED_PROXY_ADDRESSES`。
5. 基线备份与现有站点/面板状态码采集的许可。
