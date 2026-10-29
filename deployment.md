# 本轮源码运行说明（2026-10-29）

销售 PC 现要求登录，H5/小程序仅展示当前已发布宣传资料。默认开发端口及配置见 README.md；隔离验收使用 API 3303、PC 3300、后台 3301、H5 3302，不应重启或重置其他用户会话。根 `.env` 不自动传给各应用，启动命令需显式注入所需配置，前端 `VITE_*` / `NEXT_PUBLIC_*` 不得包含秘密。

正式 API 启动前会只读核验编码计数器、型号保留与公开 UUID 索引。缺失时拒绝启动，不回退 Mock；先审核可恢复备份和维护计划，工具见 `docs/product-index-reconciliation.md`、`docs/public-uuid-migration.md`。500 MiB 与视频运行依赖、私有 HTTPS 流和缓存见 `docs/large-upload-and-video.md`。

正式 PC 需 `PORTAL_SESSION_SECRET`、反代时的精确 `PORTAL_PUBLIC_ORIGIN`；后台媒体需独立 `ADMIN_MEDIA_SESSION_SECRET`。真实身份、私有对象、代理 IP、日志 TTL、网关超时/上传体积、微信业务域名及真机均需目标环境独立核实。本轮没有执行这些云部署或微信提审步骤。

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

## 后续真实配置（本轮未执行）

真实入口 `pnpm start:api` 要求 `DATA_PROVIDER=cloudbase`，缺配置或环境未初始化即失败，不回退 Mock。

| 配置 | 用途 |
| --- | --- |
| CLOUDBASE_ENV_ID | 经用户核实的精确环境 ID |
| CLOUDBASE_COLLECTION_PREFIX | 默认为 zj_，不得指向无关项目集合 |
| ADMIN_IDENTITY_PROVIDER | 固定 cloudbase |
| CLOUDBASE_AUTH_ORIGIN | 同环境官方 HTTPS 身份域名 |
| ADMIN_BOOTSTRAP_SUBJECT_ID | 首个真实管理员主体，无默认密码 |
| ALLOWED_ORIGINS、ALLOWED_HOSTS | 精确的后台/H5 origin 与 API Host；逗号分隔 |
| API_PORT、API_BIND_HOST | 默认 3101、127.0.0.1；后续托管绑定按实际网络设计 |
| VITE_CLOUDBASE_ENV_ID、VITE_CLOUDBASE_AUTH_ORIGIN | 后台登录使用的非秘密环境信息 |
| PORTAL_API_BASE_URL、VITE_API_BASE_URL | 分别为服务端地址与前端可达 HTTPS 地址 |

凭据只能通过运行环境的秘密管理/IAM 注入。代码调用官方 SDK 默认凭据链，本轮未确认具体云托管运行身份。后台直连官方 `/auth/v1/signin`；访问令牌只存页面内存。API 用同环境 `/auth/v1/token/introspect` 获取主体，再查白名单；客户端角色和本地模拟标记不被真实入口接受。账号禁用后的新请求重新查白名单。

需要确认的集合为 control、products、drafts、releases、history、assets、uploads、idempotency、categories、users、subjects、audit、rates，均加配置前缀。产品 ID、主体摘要和幂等摘要使用文档 ID 唯一约束；草稿和不可变 release 分开。集合与私有对象禁止客户端直接读取，通过 API 最小投影。rates 的 expiresAt TTL 索引及私有对象策略尚未在真实环境配置或验证。

官方事务上限、服务端 Node SDK、身份端点已查阅：
- https://docs.cloudbase.net/en/database/transaction
- https://docs.cloudbase.net/api-reference/server/node-sdk/storage
- https://docs.cloudbase.net/http-api/auth/auth-token-introspect
- https://docs.cloudbase.net/http-api/auth/auth-sign-in

## 第三轮历史运行限制（已由上方 2026-10-29 说明替代）与后续验收

- 轻量首期的列表适配器按主档加载聚合再筛选；每集合读取上限 10,000，单文档限制 750KB。未做生产压测；扩容前应实现数据库查询索引和真正分页，不直接放大上限。
- 跨实例限流计数使用数据库事务：每 IP 每分钟 600 次。实际网关代理 IP、事务成本和配额需在指定环境测量；不能据本地结果承诺免费运行。
- 真实适配器每环境 UTC 日限 500 个上传意图／256MiB，幂等重试不重复占额；失败上传仍占额度。单实例并行 PUT 4、文件解析 2；每文件尺寸、格式和 15 秒独立解析进程限制沿用共用规则。
- 文件处理租约 120 秒，异常后可等待租约到期重试；私有对象使用不可变路径。异常上传可能留下孤立对象，正式接入前需制定保留与受控清理策略，本轮没有删除云对象。
- 真实 Range 接口当前先下载并校验完整私有对象再返回片段；不是真正的对象存储端分段流式读取。大文件带宽、并发和耗时需实测。
- PDF/Office 是受限结构解析，不是恶意软件扫描。依赖还有 5 high、14 moderate、3 low，详见本轮风险报告。
- 微信 AppID、合法域名、开发工具与 iOS/Android 真机未验证；小程序仅编译通过。真实身份、数据库事务、私有桶、重启恢复、备份恢复、六款正式内容均未验收。

后续如需云端执行，先审阅精确目标、资源变更、成本、回退清单，并获得对应授权。
