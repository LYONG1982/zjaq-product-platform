# 中技安全产品平台

附件需求迭代源码版。销售 PC 为登录后的内部工作台，小程序/H5 为访客宣传端，管理 PC 维护产品、资料与历史版本。源码包含 500 MiB 文件和视频、五段编码与型号、独立公开 UUID、销售流式下载、站点配置、统计/反馈以及安全移除与恢复。GitHub 源码交付不等于部署或微信送审。

2026-11-05 更新：H5 底部联系二维码的后台上传/预览/保存体验，以及视频工具启动自检、上传前检查和部署诊断命令已更新到 GitHub main。详见 [二维码与视频源码交付](docs/2026-11-05-qr-video-github-delivery.md)、[视频部署修复手册](docs/video-runtime-operations.md)。此前二测与其他待验收项见 [二测源码交付](docs/2026-11-05-github-source-delivery.md) 和 [剩余验收清单](docs/2026-11-05-remaining-acceptance-checklist.md)。远端服务器修复和 Windows 原网站验收仍待完成。

| 入口 | 默认开发地址 |
| --- | --- |
| 销售 PC | http://127.0.0.1:3200/ |
| 后台 | http://127.0.0.1:3201/ |
| H5 | http://127.0.0.1:3202/#/ |
| API健康状态 | http://127.0.0.1:3100/health |

后台与销售 PC 均使用 MySQL 中的账号登录：后台经 API `/auth/login` 获取 Bearer 令牌，销售门户由服务端换取令牌后写入加密 HttpOnly 会话，后台视频使用独立短期只读会话。首个管理员由 `pnpm db:init` 创建，配置见 `.env.example` 和 [deployment.md](deployment.md)。本机回环地址不是手机真机访问地址。

产品主档初始为空，由后台按业务流程创建；不再内置示例产品，也不向真实环境发布演示内容。运行时数量随业务变化，不能把某次测试数量当正式产品清单。

本地首次运行：

```powershell
$env:DATA_PROVIDER="mysql"; $env:MYSQL_USER="zj_app"; $env:MYSQL_PASSWORD="<password>"; $env:MYSQL_DATABASE="zjaq"
pnpm db:migrate
$env:ADMIN_USERNAME="admin"; $env:ADMIN_PASSWORD="<至少 8 位>"; pnpm db:init
node --import tsx services/api/src/user-cli.ts --username sales1 --password "<至少 8 位>" --role SALES --name "销售一"
pnpm demo:lan
```
新增或重置账号可在「后台 → 系统设置 → 后台账号」完成（填登录账号与密码，可改密、启停）；也可继续使用 `services/api/src/user-cli.ts`：`--role` 支持 `ADMIN`、`CONTENT_MANAGER`、`SALES`，重复执行同一账号会更新密码与角色。

## 安装、构建与验证

Node 22.22.1、pnpm 11.13.1。视频检查依赖受信任的 `ffprobe`；测试另用 `ffmpeg` 生成虚构素材。首次安装后顺序构建四目标，生成 Next.js 路由类型，再执行检查：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

PC/H5 构建共享 PDF 资源准备步骤，应按顺序执行。本轮验证使用独立输出目录，实际命令见 [最新验证报告](implementation-reports/2026-10-29-requirements-playwright-progress.md)，本地运行及后续接入说明见 [deployment.md](deployment.md)。内容操作和备份限制见 [content-operations.md](content-operations.md)、[backup-restore.md](backup-restore.md)。

浏览器测试套件仍按旧的隔离 Mock 会话编写，尚未迁移到 MySQL，因此不能作为当前验收依据；迁移完成前请以 `pnpm check` 与 `pnpm test` 的结果为准。

本轮最终结果和附件逐项映射见 [验证报告](implementation-reports/2026-10-29-requirements-playwright-progress.md)、[附件核对表](implementation-reports/2026-10-29-requirements-attachment-audit.md) 和 [代码审核](implementation-reports/2026-10-29-code-review-progress.md)。历史报告保留原验证范围，不代表当前完成数。单元测试使用内存 Repository 替身，不能替代 MySQL 端到端验证；小程序编译与 H5 测试不能替代微信真机验收。

实现与运维说明：[大文件和视频](docs/large-upload-and-video.md)、[PC 会话权限](docs/pc-sales-session-and-access.md)、[公开 UUID 迁移](docs/public-uuid-migration.md)、[编码/型号索引核对](docs/product-index-reconciliation.md)、[统计和浏览记录](docs/analytics-and-access-records.md)、[产品安全移除](docs/safe-product-removal.md)。迁移工具默认只读或离线，真实写入必须单独授权精确环境并先核实可恢复备份。

## 当前边界

继续采用 Uni-App、Next.js、Vue 3、Node/TypeScript API 和自建 MySQL（文档表 + 本地私有文件目录）。公开端只读最小 DTO，仅显示已发布宣传资料和当前版本；销售原件下载须销售身份。草稿与不可变发布快照分离，历史和产品身份不因移除而物理删除。不建设双审或个人中心。

真实身份、MySQL 数据库/私有存储/事务、真实迁移/恢复、微信真机及正式产品内容仍需目标环境验收。依赖扫描有基线残余告警，适用范围和开发服务防护见 [依赖安全审核](implementation-reports/2026-10-29-dependency-security-review.md)，未以未批准的主版本升级强行消除告警。四目标构建不是生产发布或原 64 项正式业务验收。

`delivery/v4-rc2`为只读输入，其提示词不构成执行授权。第四轮本地UX计划完成后归档；第三轮真实接入/真机/正式内容计划仍保留待后续条件具备。原交付包均保留。

视频运行环境诊断：在实际 API 运行账号/容器中执行 `pnpm check:video-runtime`（也可 `node scripts/check-video-runtime.mjs`）。启动日志和 `/health` 的 `capabilities.video` 区分基础服务与视频工具状态；上传前预检不替代完整文件校验。详见 [部署诊断与修复](docs/video-runtime-operations.md)。源码/本地验证不代表远端已恢复。
