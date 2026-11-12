# 生产部署手册与 Docker 离线交付包 — 实施记录（2026-11-10）

## 目标

按用户已确认的决策（Docker 容器、子域名 + HTTPS、离线整包、占位域名、容器内含 MySQL 5.7）产出正式部署手册与可交付的部署配置包。

## 交付物

新增：

- `deploy/compose.yml`：mysql 5.7 + api + portal + web（nginx）运行编排；仅 web 暴露 80/443，静态 IP 供 API 信任代理。
- `deploy/docker/Dockerfile.api`：Node 22 + ffmpeg/ffprobe + tini，tsx 直接运行 API 源码。
- `deploy/docker/Dockerfile.portal`：Next.js 多阶段构建，运行 `next start`。
- `deploy/docker/Dockerfile.web`：nginx 托管后台与 H5 静态产物。
- `deploy/nginx/default.conf.template`：四子域名 server 块、HTTP 跳 HTTPS、TLS、gzip/缓存、`.mjs`/`.wasm` MIME、512 MiB 上传。
- `deploy/env/.env.example`：生产变量模板（无真实密钥）。
- `deploy/scripts/`：`build-images.sh`、`save-images.sh`、`load-images.sh`、`deploy.sh`、`init-admin.sh`、`backup.sh`、`restore.sh`、`healthcheck.sh`、`make-self-signed-cert.sh`。
- `deploy/README.md`、`docs/production-deployment.md`（正式手册）。
- `.dockerignore`；`.gitignore` 增加 `deploy/certs/`、`deploy/backups/`。

交付包：`work/release/2026-11-10/zjaq-source-2026-11-10.tar.gz`（707 个文件，约 28 MB），SHA256 见同名 `.sha256` 文件。

## 实际执行的命令与结果

| 命令 | 结果 |
| --- | --- |
| `node work/tmp/check-yaml.mjs`（yaml 解析） | 通过：services mysql/api/portal/web；卷 mysql-data/private-storage；网段 172.28.0.0/16 |
| Git Bash `bash -n deploy/scripts/*.sh` | 9 个脚本全部通过 |
| `corepack pnpm preview:assets` + `--filter @zj/portal build` | Next.js 生产构建成功 |
| `VITE_API_BASE_URL=https://api.example.com/api/v1 corepack pnpm --filter @zj/admin build` | Vite 构建成功 |
| `git ls-files --cached --others --exclude-standard \| tar ...` | 交付包生成，排除 node_modules/dist/.next/debug.log/test-results.json |
| `sha256sum` | 见 `work/release/2026-11-10/zjaq-source-2026-11-10.tar.gz.sha256` |

另：本轮前序已执行 `pnpm --filter @zj/mobile check`、`build:h5`、`build:mp-weixin` 并通过。

## 关键设计说明

- 前端 API 地址构建期烧录：`build-images.sh` 由 `API_DOMAIN` 推导 `https://<api>/api/v1`，改域名需重新构建。
- API 的 `ALLOWED_HOSTS` 需包含 `api:<端口>`（portal 服务端代理）与 `127.0.0.1:<端口>`（容器健康检查）。
- API 未执行 `db:init` 时按设计拒绝启动；`deploy.sh --init <账号> <密码>` 先起 MySQL 再初始化，避免首次启动死循环。
- 备份脚本直接操作 `zjaq_private-storage` 卷；恢复前停止 api/portal。
- 证书挂载路径固定 `/etc/nginx/certs/{fullchain,privkey}.pem`，可用通配符/SAN 证书或自签测试证书。

## 未执行与限制

- 当前开发机未安装 Docker：未执行镜像构建、`docker save/load`、容器启动、HTTPS、备份恢复演练。
- 微信业务域名、真机分享与提审未验证；占位域名不能用于微信合法域名与证书签发。
- MySQL 5.7 已停止官方维护，手册中已标注升级建议。
- 60 余项业务验收不能由本轮的本地构建与静态检查推断通过。

## 最短路径

构建机：`cp deploy/env/.env.example deploy/.env` → `deploy/scripts/build-images.sh` → `deploy/scripts/save-images.sh`。

服务器：`deploy/scripts/load-images.sh <包>` → `deploy/scripts/deploy.sh --init admin '<密码>'` → `deploy/scripts/healthcheck.sh`。

计划文件：`plans/active/2026-11-10-production-docker-delivery.md`，完成后移至 `plans/archive/`。
