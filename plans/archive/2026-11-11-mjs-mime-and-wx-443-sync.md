# 固化 .mjs MIME 修复并同步 1Panel wx 段（2026-11-11）

## 1. 任务与授权

用户明确要求执行（「好的，执行固化吧」），按 AGENTS.md 先落计划再实施，不执行 git commit、不连接服务器。

两件事：

1. 在 `deploy/docker/Dockerfile.web` 加入构建期修复，把 `.mjs` 映射写进镜像自带的 `/etc/nginx/mime.types`，避免重建后临时修复丢失。
2. 把线上 1Panel `zjaq-product-platform.conf` 的 wx 段现状同步回仓库，并记录原因。

## 2. 现象与根因

- 现象：H5 打开 PDF 预览报
  `Setting up fake worker failed: Failed to fetch dynamically imported module: https://wx.product.zhongjianquan.com:8443/pdf/pdf.worker.min.mjs`
- 根因：`nginx:1.27-alpine` 的 `/etc/nginx/mime.types` 无 `.mjs` 映射，worker 以 `application/octet-stream` 返回，ES module 严格 MIME 校验拒绝。
- 线上已临时进入容器，把 `application/javascript mjs;` 插入 `types {}` 块内并 reload，响应头已恢复 `application/javascript`；容器层修改在重建镜像后会丢失。
- 关键约束：`mime.types` 整体就是一个 `types {}` 块，映射必须写在花括号内部。直接在文件末尾追加会让 nginx 把 `application/javascript` 当成新指令，出现 `unknown directive "application/javascript"` 的 emerg。

## 3. 改动内容

### 3.1 `deploy/docker/Dockerfile.web`

在 `FROM nginx:1.27-alpine` 之后新增构建期 RUN：

```dockerfile
# nginx:1.27-alpine 的 mime.types 缺少 .mjs，PDF.js worker 以 ES module 加载时
# 会因 application/octet-stream 被浏览器拒绝。必须插入 types {} 块内，
# 不能追回到文件末尾（会变成 unknown directive）。
RUN sed -i 's|^types {|types {\n    application/javascript                mjs;|' /etc/nginx/mime.types \
    && grep -qE 'application/javascript[[:space:]]+mjs;' /etc/nginx/mime.types
```

- 用 `s|^types {|...|` 替换块首行，插入一行新映射；`grep` 作为构建期断言，未生效时直接构建失败。
- 不改 `default.conf.template`、不改 nginx.conf。

### 3.2 `deploy/1panel/zjaq-product-platform.conf`

线上 `/home/1panel/www/conf.d/zjaq-product-platform.conf` 的 wx 段已从过渡状态改回：

- `server_name wx-disabled` → `wx`（仓库模板本身用 `<WX_DOMAIN>` 占位，保持）；
- `location / { return 404; }` → `proxy_pass https://127.0.0.1:8080`，与 portal 段一致透传，H5 静态页由 web 容器按 Host 分流。

仓库同步：

- wx 段 `location /` 改为与 portal 相同的反代配置（HTTP/1.1、SNI、Host、XFF 覆盖、120s 读超时）；
- 顶部域名口径注释由「wx 只反代 /api、不托管静态页面、H5 不参与部署」改为「wx 同时承载 H5 静态页与 /api」；
- 保留 `location /api/` 的现有反代与 300s 超时。

### 3.3 原因记录（写入本计划）

公网 `8443` 实际映射到内网 `443`。因此外网 `https://wx.product.zhongjianquan.com:8443/` 最终落到 OpenResty 的 443 wx server 段；该段必须整段转发到 web 容器，不能返回 404，否则 H5 页面与 `/pdf/pdf.worker.min.mjs` 都不可达。仓库模板此前保留 `wx-disabled` + `return 404` 的过渡写法，与线上实际配置不一致，本次同步为线上状态。

## 4. 验证

本地无 Docker，无法在本机执行 `docker build`；采用以下验证：

1. Dockerfile 语法静态检查：`FROM`/`RUN` 位置、`sed` 仅替换首个 `^types {`、`grep` 断言存在。
2. 1Panel 配置检查：`server` 块 3 个、`listen 443` 3 个、wx 段 `location /` 为 `proxy_pass https://127.0.0.1:8080`、`return 404` 残留为 0、花括号平衡。
3. 服务器重建后（需另行授权）执行：
   ```bash
   curl -k -sS -o /dev/null -D - -H 'Host: wx.product.zhongjianquan.com' \
     https://127.0.0.1:8443/pdf/pdf.worker.min.mjs | grep -i content-type
   ```
   期望 `content-type: application/javascript`。
4. 容器内确认：`docker exec zjaq-web-1 grep -n 'mjs' /etc/nginx/mime.types`，应位于 `types {` 之后。

## 5. 只重建 web 的服务器序列

沿用上一轮磁盘紧张方案，不触发 api/portal：

```bash
cd /home/zjaq
set -a; . deploy/.env; set +a
: "${IMAGE_TAG:?deploy/.env 缺少 IMAGE_TAG}"

# 1) 覆盖补丁文件（Dockerfile.web、1panel 模板）
# 2) 复用已有 H5 产物；本次无前端源码改动，无需重新 build:h5
WEB_CTX=/home/zjaq/work/docker/web-context
rm -rf "$WEB_CTX"
mkdir -p "$WEB_CTX"
cp -r apps/admin/dist "$WEB_CTX/admin"
cp -r apps/mobile/dist/build/h5 "$WEB_CTX/h5"
cp -r deploy/nginx "$WEB_CTX/nginx"

# 3) 同 tag 覆盖构建
docker build -f deploy/docker/Dockerfile.web -t "zjaq/web:$IMAGE_TAG" "$WEB_CTX"

# 4) 只重建 web
cd /home/zjaq/deploy
docker compose up -d --no-deps --force-recreate web
docker compose ps web
```

悬空镜像：同 tag 覆盖后旧 web 变 `<none>`，确认新容器正常后 `docker image prune -f`，不要用 `-a`。

1Panel 配置同步到 `/home/1panel/www/conf.d/zjaq-product-platform.conf` 后执行 `openresty -t` 与 `openresty -s reload`；本次仓库只同步模板，不连接服务器。

## 6. 交付物

- `2026-11-11/mjs-mime-and-wx-443-sync/outputs/`
  - `apps/...` 改动文件（按仓库相对路径）
  - `PATCH-README.md`
  - `zjaq-mjs-mime-and-wx-443-patch-2026-11-11.tar.gz` + `.sha256`

## 7. 回滚

- Dockerfile：删除新增 RUN → 重建 web。
- 1Panel：恢复 wx 段 `return 404` → `openresty -t && -s reload`。
- 补丁包内为完整文件，可用备份覆盖回滚。

## 8. 实施结果（2026-11-11）

- `deploy/docker/Dockerfile.web`：已新增 MIME 修复 RUN，`sed` 在 `types {` 后插入 `application/javascript mjs;`，并以 `grep -qE` 作为构建期断言。
- `deploy/1panel/zjaq-product-platform.conf`：wx 段 `location /` 已改为 `proxy_pass https://127.0.0.1:8080`；保留 `location /api/`；补充「公网 8443 映射到内网 443」的原因注释；`return 404`、`wx-disabled` 残留均为 0。
- 静态检查：`server` 块 4 个（含 80 跳转）、`listen 443` 3 个、`proxy_pass https://127.0.0.1:8080` 4 处、花括号 8/8 平衡。
- MIME 插入逻辑用等价正则样例验证：插入行位于 `types {` 之后，`grep` 断言命中。
- 本机无 Docker，未执行 `docker build`；未连接服务器。
- 补丁包：`2026-11-11/mjs-mime-and-wx-443-sync/outputs/zjaq-mjs-mime-and-wx-443-patch-2026-11-11.tar.gz`，SHA256 `9aa647af9a013ca3084edb48a5bc854f7c050450cb25310ea89c5ab66b4a0495`。

