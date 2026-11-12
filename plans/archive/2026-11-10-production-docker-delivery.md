# 生产部署手册与 Docker 离线交付包计划（2026-11-10）

## 目标

为正式上线准备可执行的部署方案与交付物：Docker 容器化运行、子域名 + HTTPS、离线整包交付、占位域名、容器内含 MySQL 5.7。产出一份正式部署手册与一套可直接交给运维的目录/压缩包。

## 已确认决策（用户）

- 运行形态：Docker 容器
- 入口：子域名 + HTTPS
- 交付：离线整包
- 域名：先用占位域名（`*.example.com`）
- 数据库：容器内含 MySQL 5.7

## 现状与约束（已核实）

- 本机没有 Docker / Docker Compose（`docker` 不在 PATH，Docker Desktop 未安装），因此**无法在本机构建镜像或执行 `docker save`**；镜像 tar 只能在具备 Docker 的构建机上生成。
- API 以 `node --import tsx services/api/src/main.ts` 直接运行 TypeScript 源码，没有编译产物；镜像必须包含源码、`node_modules`、`tsx` 与 `typescript`。
- Portal 是 Next.js 16，`next.config.ts` 未启用 `output: "standalone"`，生产运行需要完整 `node_modules` + `next start`。
- Admin（Vue3/Vite）与 H5（uni-app）是静态产物；小程序产物需在微信开发者工具上传，不能由容器托管。
- 根 `.env` 不会被应用自动加载；`VITE_API_BASE_URL`、`PORTAL_API_BASE_URL` 等在构建/启动时显式注入，前端变量会进入产物，不得含秘密。
- 上传文件目录 `ZJ_STORAGE_DIR`、MySQL 数据必须落到数据卷。
- API 启动会自动迁移；首次仍需 `db:init`（写入 control 状态与首个管理员），否则以 `NOT_INITIALIZED` 拒绝启动。
- 服务端关键变量：`ALLOWED_ORIGINS`、`ALLOWED_HOSTS`、`PORTAL_SESSION_SECRET`、`PORTAL_PUBLIC_ORIGIN`、`ADMIN_MEDIA_SESSION_SECRET`、`TRUSTED_PROXY_ADDRESSES`、`FFPROBE_PATH`。

## 架构与端口

```
浏览器/小程序 ──HTTPS──> nginx(80/443)
                        ├─ portal.<domain>  -> portal 容器 :3000（next start）
                        ├─ admin.<domain>   -> admin 静态（nginx 内置）
                        ├─ h5.<domain>      -> H5 静态（nginx 内置）
                        └─ api.<domain>     -> api 容器 :3100（Node + tsx）
api 容器 ──> mysql 容器 :3306（仅内网）
持久化卷：mysql-data、private-storage（ZJ_STORAGE_DIR）、certs（只读挂载）
```

## 交付物

```
deploy/
├─ docker/            Dockerfile.api / Dockerfile.portal / Dockerfile.web
├─ compose.yml        mysql 5.7 + api + portal + web(nginx)，健康检查、卷、重启策略
├─ nginx/             子域名 server 块、TLS、gzip、缓存、/pdf/ 的 mjs/wasm MIME、上传体积
├─ env/.env.production.example
├─ scripts/           build-images.sh、save-images.sh、load-images.sh、deploy.sh、
│                     init-admin.sh、backup.sh、restore.sh、healthcheck.sh
└─ README.md          入口，指向正式手册
docs/production-deployment.md   正式部署手册
work/release/2026-11-10/        打包产物（git 忽略）：源码包 + 配置 + SHA256
```

## 实施步骤

1. **容器镜像**
   - `Dockerfile.api`：node:22-bookworm-slim + ffmpeg（提供 ffprobe），pnpm 安装工作区依赖，非 root 运行，健康检查 `/health`。
   - `Dockerfile.portal`：多阶段（依赖 → 构建 → 运行），构建期注入 `PORTAL_API_BASE_URL`，运行期注入会话密钥与对外 origin。
   - `Dockerfile.web`：nginx:alpine，COPY admin/H5 构建产物与 nginx 配置。
2. **compose**：mysql:5.7（utf8mb4、数据卷、健康检查）、api（依赖 mysql 健康）、portal、web；只对外暴露 80/443；`restart: unless-stopped`；通过 `.env.production` 注入全部变量。
3. **nginx**：四个子域名 server 块；HTTP 跳转 HTTPS；证书目录只读挂载；静态资源缓存与 gzip；PDF.js 的 `.mjs`/`.wasm` MIME；`client_max_body_size 512m`；转发头透传给 API/Portal。
4. **初始化**：`api` 启动自动迁移；`init-admin.sh` 调 `docker compose run --rm api pnpm db:init`；输出首次登录说明。
5. **构建与离线搬运**：`build-images.sh`（构建并打 tag）→ `save-images.sh`（`docker save` 出 tar + SHA256）→ 目标机 `load-images.sh` → `deploy.sh`。域名在构建期以 build-arg 传入。
6. **手册**：前置检查、DNS 解析、证书获取/挂载、Docker 安装或镜像导入、环境变量与密钥生成（`openssl rand -hex 32`）、首次初始化、验收清单（健康检查、后台登录、上传、预览、小程序分享）、小程序业务域名与上传、备份恢复、升级回滚、故障排查、安全注意事项。
7. **打包**：`work/release/2026-11-10/` 生成源码/配置压缩包与 SHA256；产物目录写在 `.gitignore` 的 `work/` 下。
8. **验证**：`pnpm check`、`pnpm build`、配置文件静态自检（无明文密钥、占位域名一致）。

## 验收标准

- 手册覆盖从零安装到回滚的完整步骤，命令可直接复制执行。
- 交付包不含任何真实密码/密钥，示例值统一为占位符。
- 本机可验证项（类型检查、构建、脚本语法）全部通过。
- 容器启动、HTTPS、微信业务域名属于目标环境验证，须在有 Docker 的机器上执行并单独记录证据；不能以本机构建成功推断通过。

## 风险与限制

- 本机无 Docker：镜像 tar 需在具备 Docker 的构建机生成，或由目标服务器联网自行构建。
- MySQL 5.7 已停止官方维护，手册中注明升级建议。
- 占位域名不能用于微信业务域名与证书签发，上线前必须替换为真实域名并重新构建前端产物。
- 真实 HTTPS、备份恢复演练、真机分享需目标环境独立验证。
