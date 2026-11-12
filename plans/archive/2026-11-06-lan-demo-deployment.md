# 局域网本地演示部署计划（2026-11-06）

状态：待用户确认。本文不代表已实施；确认前不改任何代码。

## 背景与目标

当前工程只在 127.0.0.1 可用：Mock API 监听地址、Host/Origin 白名单、开发服务器回环守卫、后台模拟身份判定四处写死。用户要求先做一次"把整个项目串起来"的局域网演示（手机与其他电脑可访问 H5、后台、门户），随后另行开展 CloudBase → MySQL 的大改。

本轮范围只到"局域网演示可跑通并留证"，不连接真实云、不部署外网、不改域名、不迁移数据。

## 现状阻塞（已核对代码）

| # | 位置 | 现状 |
| --- | --- | --- |
| 1 | `services/mock-api/src/main.ts:8` | 监听 `127.0.0.1`，外部不可达 |
| 2 | `services/domain/src/http.ts:23-28,232-240` | 无 options 时只放行 127.0.0.1/localhost 的 Origin 与 Host |
| 3 | `scripts/dev-server-guard.ts:20` | 开发服务器拒绝非回环请求与非本机 Host |
| 4 | `apps/admin/src/api.ts:9-16` | 仅 hostname 为回环地址才使用模拟身份令牌 |
| 5 | `apps/portal/lib/sales-session.ts` | 开发模式 cookie 为非 Secure，HTTP 可用（无需改动） |
| 6 | 环境 | 缺 ffprobe，视频上传能力不可用（本轮不解决，仅记录） |

## 实施内容

### 1. Mock API 可配置监听与白名单

- `services/mock-api/src/main.ts`：读取 `API_BIND_HOST`（默认 `127.0.0.1`），校验为 IPv4/`0.0.0.0`；把 `ALLOWED_ORIGINS`、`ALLOWED_HOSTS` 解析后传给 `makeMockServer`。
- `services/mock-api/src/server.ts`：`makeMockServer` 接受 `{ origins, hosts }` 并透传给 `makeApiServer`；未配置时行为与现状完全一致（内存/回环白名单）。

### 2. 开发服务器局域网开关

- `scripts/dev-server-guard.ts`：新增显式开关 `ZJ_DEV_LAN=true` 时跳过回环与 Host 限制；仍保留路径遍历与 `__open-in-editor` 拦截。默认关闭，行为不变。

### 3. 后台模拟身份判定

- `apps/admin/src/api.ts`：`isLocalMock` 改为「回环 hostname」或「`VITE_MOCK_MODE=true`」；令牌仍取 `VITE_MOCK_TOKEN`，缺省 `local-mock`。未设置新变量时行为不变。

### 4. 一键启动脚本

新增 `scripts/demo-lan.mjs`：

- 自动探测本机局域网 IPv4（可用 `DEMO_LAN_HOST` 覆盖），生成各服务环境变量并启动：
  - Mock API：`API_BIND_HOST=0.0.0.0`，`ENABLE_MOCK_ROLES=true`，白名单含 `http://<IP>:3200/3201/3202` 与 `127.0.0.1` 变体及 `Host: <IP>:3100`。
  - 门户：`next dev --hostname 0.0.0.0 --port 3200`，`NEXT_PUBLIC_ENABLE_SALES_MOCK=true`，`PORTAL_PUBLIC_ORIGIN=http://<IP>:3200`，`PORTAL_API_BASE_URL` 指向本机 API。
  - 后台：`vite --host 0.0.0.0 --port 3201`，`VITE_MOCK_MODE=true`，`VITE_MOCK_TOKEN=local-admin`，API 指向 `<IP>:3100`。
  - H5：`uni -p h5 --host 0.0.0.0 --port 3202`，`VITE_API_BASE_URL=http://<IP>:3100/api/v1`。
  - 以上均带 `ZJ_DEV_LAN=true`。
- 等 `/health` 就绪后按需执行 `demo:seed`、`demo:ai`（仅本机回环写入，脚本自带回环校验）。
- 子进程退出统一回收；打印四个访问地址与演示身份说明。

### 5. 文档

`deployment.md` 增加「局域网演示」一节：启动命令、端口与防火墙要求、演示身份说明、安全边界（Mock 与模拟令牌仅限可信内网、数据在内存、重启即清）、停止方式。

## 验证（须留实际证据）

1. `pnpm check` 四工作区通过。
2. 以 `Host: <IP>:3100` + `Origin: http://<IP>:3201` 请求 `/api/v1/admin/products`（`Bearer local-admin`）返回 200。
3. 门户 `POST /api/sales/session`（`localValidation: true`）返回 200 并下发 Cookie，随后 `GET /api/catalog/products` 带 Cookie 返回 200。
4. 局域网地址 `http://<IP>:3200/3201/3202` 均返回 200，后台页面渲染出「模拟身份 本地模拟管理员」。
5. 记录未通过项与限制（ffprobe 缺失、Mock 数据内存态）。

## 不做

- 不改默认安全边界（不加新 env 时仍为回环 + localhost 白名单）。
- 不做静态产物 nginx/HTTPS 部署、不装 Docker、不改 Windows 防火墙（只给出需放行端口与命令，由用户自行执行）。
- 不解决视频能力（ffprobe 安装与验证另行处理）。
- CloudBase → MySQL 改造不在本轮；待演示通过后单独出计划（含集合→表映射、身份、私有存储、事务、迁移与备份）。

## 风险

- 局域网开放后，`local-admin` 令牌等同于管理权限，只适用于可信内网与临时演示，演示结束须关闭进程。
- Mock 数据纯内存，重启清空；上传文件在 `work/mock-assets`。
- Next.js 16 开发模式跨机访问若出现 HMR 源校验问题，将补 `allowedDevOrigins` 配置（届时另行说明）。
</content>
