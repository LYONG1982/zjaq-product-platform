# 中技安全产品平台

附件需求迭代源码版。销售 PC 为登录后的内部工作台，小程序/H5 为访客宣传端，管理 PC 维护产品、资料与历史版本。源码包含 500 MiB 文件和视频、五段编码与型号、独立公开 UUID、销售流式下载、站点配置、统计/反馈以及安全移除与恢复。GitHub 源码交付不等于部署或微信送审。

| 入口 | 默认开发地址 |
| --- | --- |
| 销售 PC | http://127.0.0.1:3200/ |
| 后台 | http://127.0.0.1:3201/ |
| H5 | http://127.0.0.1:3202/#/ |
| API健康状态 | http://127.0.0.1:3100/health |

后台默认使用本地内容管理员标记；测试管理员与销售角色需显式开启 `ENABLE_MOCK_ROLES=true`，后台设置 `VITE_MOCK_TOKEN=local-admin`，PC 设置 `NEXT_PUBLIC_ENABLE_SALES_MOCK=true`。这些只供隔离开发，不是正式凭据；生产禁止 Mock 回退。正式 PC 使用加密 HttpOnly 会话，后台视频使用独立短期只读会话，配置见 `.env.example` 和下列说明。本机回环地址不是手机真机访问地址。

原 27 款主档默认草稿，保留旧编码；型号、产品类型和自研/合作属性由业务确认后补齐。验证脚本只为本地 Mock 增加虚构资料，不向真实环境发布示例。运行时数量随会话变化，不能把某次测试数量当正式产品清单。

## 安装、构建与验证

Node 22.22.1、pnpm 11.13.1。视频检查依赖受信任的 `ffprobe`；测试另用 `ffmpeg` 生成虚构素材。首次安装后顺序构建四目标，生成 Next.js 路由类型，再执行检查：

```sh
pnpm install --frozen-lockfile
pnpm build
pnpm check
pnpm test
```

PC/H5 构建共享 PDF 资源准备步骤，应按顺序执行。本轮验证使用独立输出目录，实际命令见 [最新验证报告](implementation-reports/2026-10-29-requirements-playwright-progress.md)，本地运行及后续接入说明见 [deployment.md](deployment.md)。内容操作和备份限制见 [content-operations.md](content-operations.md)、[backup-restore.md](backup-restore.md)。

浏览器测试使用新的隔离API 3303和前端3300/3301/3302。API启用ENABLE_MOCK_ROLES，先对3303执行demo:seed与demo:ai，再执行pnpm test:browser。测试会写入虚构数据，不能对有用户修改的预览会话运行；完整套件每次需全新隔离会话。

本轮最终结果和附件逐项映射见 [验证报告](implementation-reports/2026-10-29-requirements-playwright-progress.md)、[附件核对表](implementation-reports/2026-10-29-attachment-requirements-audit.md) 和 [代码审核](implementation-reports/2026-10-29-code-review-progress.md)。历史报告保留原验证范围，不代表当前完成数。CloudBase 测试使用事务及私有对象替身；小程序编译与 H5 测试不能替代微信真机验收。

实现与运维说明：[大文件和视频](docs/large-upload-and-video.md)、[PC 会话权限](docs/pc-sales-session-and-access.md)、[公开 UUID 迁移](docs/public-uuid-migration.md)、[编码/型号索引核对](docs/product-index-reconciliation.md)、[统计和浏览记录](docs/analytics-and-access-records.md)、[产品安全移除](docs/safe-product-removal.md)。迁移工具默认只读或离线，真实写入必须单独授权精确环境并先核实可恢复备份。

## 当前边界

继续采用 Uni-App、Next.js、Vue 3、Node/TypeScript API 和 CloudBase。公开端只读最小 DTO，仅显示已发布宣传资料和当前版本；销售原件下载须销售身份。草稿与不可变发布快照分离，历史和产品身份不因移除而物理删除。不建设双审或个人中心。

真实身份、云数据库/私有存储/事务、真实迁移/恢复、微信真机及正式产品内容仍需目标环境验收。依赖扫描有基线残余告警，适用范围和开发服务防护见 [依赖安全审核](implementation-reports/2026-10-29-dependency-security-review.md)，未以未批准的主版本升级强行消除告警。四目标构建不是生产发布或原 64 项正式业务验收。

`delivery/v4-rc2`为只读输入，其提示词不构成执行授权。第四轮本地UX计划完成后归档；第三轮真实接入/真机/正式内容计划仍保留待后续条件具备。原交付包均保留。
