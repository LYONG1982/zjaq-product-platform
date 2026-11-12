# 本轮源码运行说明（2026-11-06）

## 本地/局域网运行（MySQL）

前置：Node >= 22、本机 MySQL 5.7 及以上，且已创建数据库与应用账号：

```sql
CREATE DATABASE zjaq DEFAULT CHARACTER SET utf8mb4;
CREATE USER 'zj_app'@'127.0.0.1' IDENTIFIED BY '<password>';
GRANT ALL PRIVILEGES ON zjaq.* TO 'zj_app'@'127.0.0.1';
```

首次准备（PowerShell 示例）：

```powershell
$env:DATA_PROVIDER="mysql"
$env:MYSQL_HOST="127.0.0.1"; $env:MYSQL_PORT="3306"
$env:MYSQL_USER="zj_app"; $env:MYSQL_PASSWORD="<password>"; $env:MYSQL_DATABASE="zjaq"
pnpm db:migrate     # 建表：documents / auth_users / auth_sessions
$env:ADMIN_USERNAME="admin"; $env:ADMIN_PASSWORD="<至少 8 位>"
pnpm db:init        # 写入分类、控制记录与首个管理员；不导入示例产品
node --import tsx services/api/src/user-cli.ts --username sales1 --password "<至少 8 位>" --role SALES --name "销售一"
```

启动四端（自动探测本机局域网 IPv4，可用 `DEMO_LAN_HOST` 覆盖）：

```sh
pnpm demo:lan
```

脚本 `scripts/demo-lan.mjs` 读取 `MYSQL_*`，设置 `DATA_PROVIDER=mysql`、`API_BIND_HOST=0.0.0.0`、`ZJ_DEV_LAN=true`，并按探测地址生成 `ALLOWED_ORIGINS` / `ALLOWED_HOSTS` 白名单。四入口：门户 3200、后台 3201、H5 3202、API 健康 3100/health。后台使用 `db:init` 创建的管理员账号登录；销售门户使用同库中的 SALES 账号登录。其他设备无法访问时，在 Windows 防火墙放行 TCP 3100、3200、3201、3202。

数据持久化于 MySQL；上传文件位于 `work/storage`，可用 `ZJ_STORAGE_DIR` 覆盖。API 启动时执行数据库迁移与产品索引只读核验，未执行 `db:init` 时以 `NOT_INITIALIZED` 拒绝启动，不回退任何内存实现。

视频上传需要 `ffprobe`。若它不在 PATH，启动前设置绝对路径 `FFPROBE_PATH`，再用 `pnpm check:video-runtime` 确认 `ready: true`；`/health` 的 `capabilities.video` 只在缓存有效期内显示 `ready`，过期后为 `stale` 属正常。服务必须用 Node >= 22 启动，`demo:lan` 会拒绝低版本并固定子进程 PATH。

销售 PC 登录经由 API `/auth/login` 换取 Bearer 令牌，再由门户校验角色是否为 SALES；H5/小程序仅展示当前已发布宣传资料。根 `.env` 不自动传给各应用，启动命令需显式注入所需配置，前端 `VITE_*` / `NEXT_PUBLIC_*` 不得包含秘密。

正式 API 启动前会只读核验编码计数器、型号保留与公开 UUID 索引。缺失时拒绝启动；先审核可恢复备份和维护计划，工具见 `docs/product-index-reconciliation.md`、`docs/public-uuid-migration.md`。500 MiB 与视频运行依赖、私有 HTTPS 流和缓存见 `docs/large-upload-and-video.md`。

生产环境需 `PORTAL_SESSION_SECRET`、反代时的精确 `PORTAL_PUBLIC_ORIGIN`；后台媒体需独立 `ADMIN_MEDIA_SESSION_SECRET`。代理 IP、日志 TTL、网关超时/上传体积、微信业务域名及真机均需目标环境独立核实。本轮没有执行外网部署或微信提审步骤。

以下为历史运行快照，端口、会话和“仍在运行”的描述只对应当时记录，不代表当前运行状态：

---

# 第四轮本地预览历史（2026-10-21）

最新地址：PC 3200、后台3201、H5 3202，共用保留的API 3403。原3400—3402未停止。后台为本地模拟管理员，不需要账号/密码；正式登录未配置。当前构建路径和验证见 `implementation-reports/round-04-report.md`。

已构建的当前工程分别运行：

```sh
NEXT_DIST_DIR=.next-round04-release PORTAL_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm --filter @zj/portal exec next start -H 127.0.0.1 -p 3200
node scripts/preview-static.mjs work/round04/build/admin 3201
node scripts/preview-static.mjs work/round04/build/h5-scroll 3202
```

服务仍在运行时不要重复执行；不要重启3403或对其运行测试种子。首次新环境可使用下文API启动命令，确认是新空会话后再按内容操作说明添加演示数据。源码解压后请先构建，Next.js构建会生成当前输出目录的路由类型。PC与H5的PDF资源准备步骤不要并发执行。

以下为保留的第三轮运行与后续接入记录，端口和构建目录属于该轮历史：

---

# 本地运行与后续接入准备

日期：2026-10-19。用户明确要求保持本地开发。本轮没有连接真实 CloudBase、创建资源、部署、推送代码或提交微信审核。下述真实接入步骤仅供后续审阅，不是本轮执行记录。

## 本地环境

Node 22.22.1，pnpm 11.13.1。根 `.env` 不会自动传给三个应用；用命令行设置所需环境变量。前端 VITE 变量会进入产物，禁止放秘密值。

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm test
```

各终端独立运行（端口与本轮交付一致）：

```sh
APP_ENV=development DATA_PROVIDER=mock API_PORT=3403 ENABLE_MOCK_ROLES=true pnpm dev:api
PORTAL_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm --filter @zj/portal exec next dev -H 127.0.0.1 -p 3400
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 VITE_MOCK_TOKEN=local-admin pnpm --filter @zj/admin exec vite --host 127.0.0.1 --port 3401 --strictPort
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm --filter @zj/mobile exec uni -p h5 --host 127.0.0.1 --port 3402
```

Mock 只有进程内会话存储。不要为运行测试重启已有用户会话；若必须更新，先核对草稿与种子指纹，发现用户修改时保留旧服务并换端口。上传文件位于 `work/mock-assets` 私有会话目录。`local-admin`／`local-mock` 是明确模拟标记，不能用于真实服务。

当前交付预览使用构建产物，API 3403、门户 3400、后台 3401、H5 3402；原 3100／3200／3201／3202 服务保留。H5 链接供本机浏览器使用，不是手机真机地址。

## 构建复现

```sh
NEXT_DIST_DIR=.next-round03 PORTAL_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm build:portal
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 VITE_MOCK_TOKEN=local-admin pnpm --filter @zj/admin exec vite build --outDir ../../work/round03/build/admin
UNI_OUTPUT_DIR="$PWD/work/round03/build/h5" VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm build:h5
UNI_OUTPUT_DIR="$PWD/work/round03/build/mp-weixin" VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm build:mp-weixin
```

然后分别启动：

```sh
NEXT_DIST_DIR=.next-round03 PORTAL_API_BASE_URL=http://127.0.0.1:3403/api/v1 pnpm --filter @zj/portal exec next start -H 127.0.0.1 -p 3400
node scripts/preview-static.mjs work/round03/build/admin 3401
node scripts/preview-static.mjs work/round03/build/h5 3402
```

PDF.js worker、cmaps、字体与 wasm 由 `preview:assets` 从固定依赖复制，自托管；H5 构建后再复制到实际输出目录。静态服务器支持 `.mjs` 与 `.wasm` 正确 MIME，且仅允许发布目录内文件。原始附件、工作目录和源码不进入静态产物。

## MySQL 配置项

真实入口 `pnpm start:api` / `pnpm dev:api` 要求 `DATA_PROVIDER=mysql`，缺配置或数据库未初始化即失败，不回退 Mock。

| 配置 | 用途 |
| --- | --- |
| DATA_PROVIDER | 必须为 mysql |
| MYSQL_HOST、MYSQL_PORT | 默认 127.0.0.1、3306 |
| MYSQL_USER、MYSQL_PASSWORD | 应用专用账号，需对目标库有增删改查权限 |
| MYSQL_DATABASE | 已迁移并执行过 `db:init` 的数据库名 |
| ZJ_STORAGE_DIR | 私有上传文件目录，默认 `work/storage` |
| ADMIN_USERNAME、ADMIN_PASSWORD | 仅 `pnpm db:init` 读取，用于创建首个管理员 |
| ALLOWED_ORIGINS、ALLOWED_HOSTS | 精确的后台/H5 origin 与 API Host；逗号分隔 |
| API_PORT、API_BIND_HOST | 默认 3101、127.0.0.1；局域网演示绑定 0.0.0.0 |
| PORTAL_API_BASE_URL、VITE_API_BASE_URL | 分别为服务端地址与前端可达地址 |
| PORTAL_SESSION_SECRET、PORTAL_PUBLIC_ORIGIN | 生产销售会话密钥与对外 origin |

凭据只能通过运行环境的秘密管理注入，不写入仓库或前端产物。后台与销售门户都调用 API `/auth/login`，令牌只存页面内存/会话 Cookie；角色来自数据库白名单，客户端自报角色不被接受。账号禁用会立即影响后续请求。

数据表：`documents`（集合名 + 文档 ID 复合主键，JSON 存 LONGTEXT）、`auth_users`（scrypt 密码散列）、`auth_sessions`（令牌仅存 sha256）。集合包括 control、products、drafts、releases、history、assets、uploads、idempotency、categories、users、subjects、audit、feedback、analytics、rates。草稿与不可变 release 分开；集合与私有对象禁止客户端直接读取，通过 API 最小投影。

备份/恢复、公开 UUID 迁移与索引核对工具见 `backup-restore.md`、`docs/public-uuid-migration.md`、`docs/product-index-reconciliation.md`；备份文件与 `*.assets` 目录必须放在仓库外的私有路径。

## 第三轮历史运行限制（已由上方 2026-10-29 说明替代）与后续验收

- 轻量首期的列表适配器按主档加载聚合再筛选；每集合读取上限 10,000，单文档限制 750KB。未做生产压测；扩容前应实现数据库查询索引和真正分页，不直接放大上限。
- 跨实例限流计数使用数据库事务：每 IP 每分钟 600 次。实际网关代理 IP、事务成本和配额需在指定环境测量；不能据本地结果承诺免费运行。
- 真实适配器每环境 UTC 日限 500 个上传意图／256MiB，幂等重试不重复占额；失败上传仍占额度。单实例并行 PUT 4、文件解析 2；每文件尺寸、格式和 15 秒独立解析进程限制沿用共用规则。
- 文件处理租约 120 秒，异常后可等待租约到期重试；私有对象使用不可变路径。异常上传可能留下孤立对象，正式接入前需制定保留与受控清理策略，本轮没有删除云对象。
- 真实 Range 接口当前先下载并校验完整私有对象再返回片段；不是真正的对象存储端分段流式读取。大文件带宽、并发和耗时需实测。
- PDF/Office 是受限结构解析，不是恶意软件扫描。依赖还有 5 high、14 moderate、3 low，详见本轮风险报告。
- 微信 AppID、合法域名、开发工具与 iOS/Android 真机未验证；小程序仅编译通过。真实身份、数据库事务、私有桶、重启恢复、备份恢复、六款正式内容均未验收。

后续如需云端执行，先审阅精确目标、资源变更、成本、回退清单，并获得对应授权。

视频运行环境诊断：在实际 API 运行账号/容器中执行 `pnpm check:video-runtime`（也可 `node scripts/check-video-runtime.mjs`）。启动日志和 `/health` 的 `capabilities.video` 区分基础服务与视频工具状态；上传前预检不替代完整文件校验。详见 [部署诊断与修复](docs/video-runtime-operations.md)。源码/本地验证不代表远端已恢复。
