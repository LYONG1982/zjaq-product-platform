# PC 销售边界及迁移恢复独立复核

日期：2026-10-29（Asia/Shanghai）。本记录是已确认计划内的源码、本地替身及浏览器复核，不代表真实身份、云或微信设备验收。未执行任何云 `--apply`、部署、真实数据迁移、Git 提交或推送。

## 变更及审核修复

| 问题 | 处理与证据 |
|---|---|
| 原 PC 首页、产品/资料目录、详情和查看器仍可匿名访问 | 页面在服务端重新验证销售会话。原 `/api/catalog` 兼容路径也要求会话并转销售 API；H5 的独立公共 API 继续只提供对外宣传资料。匿名页面/代理 Playwright 通过。 |
| 销售预览/下载依赖页面内 Bearer 与整份 Blob | AES-256-GCM 加密 HttpOnly、SameSite Strict Cookie；生产强制独立 32 字节 secret 和 Secure `__Host` Cookie。下载直接同源链接，Next 透传流；PDF 使用共享 URL/Range 会话，视频使用同源 URL。单元测试用尚未产出字节的源流证明代理无需聚合完整文件即可返回，浏览器测试读取 4 字节 Range 并完成 PDF 下载。 |
| 生产身份失败可能与本地验证混淆 | 真实登录只验证对应环境官方身份服务，失败不自动进入 Mock。开发按钮/服务器接受本地身份均需明确开关，production 拒绝。单元及浏览器负向测试通过。 |
| Next dev 将内部请求 URL 规范化为 localhost，导致合法 127.0.0.1 登录被 CSRF 校验拒绝 | CSRF 优先使用显式 `PORTAL_PUBLIC_ORIGIN`，本地以实际 Host 和请求协议校验；不采信任意 X-Forwarded-Host。跨站/同站跨源拒绝保留。修复后登录浏览器用例通过。 |
| 销售资料中心和产品图片缺完整受保护链路 | 添加 `sales/catalog/materials`（当前所有分类、名称/别名、分类、产品、分页）及销售 media 路由，沿用版本与资源归属校验。单元测试确认技术与未分类资料仅销售能读，公开端不出现。 |
| 管理员无法在现有账号表单显式选择销售角色 | 角色新增 SALES 选项及说明，列表显示“销售”；默认仍为原内容制作人，不自动提升或改变已有账号。 |
| 简介只有整个容器首行缩进 | 纯文本按自然段渲染，每段 `pre-wrap`、2em 首行缩进、独立段距。浏览器两段均 32px 缩进、双空格保留、行距及段距实测通过。 |
| 已存在公开 UUID 索引可绕过库中重复 UUID | 已向主执行代理提交 P1 发现；主执行代理修复为独立核验库中唯一性，并新增已有索引与重复 UUID 用例。相关迁移测试通过。 |
| UUID 迁移只验证备份 JSON，未确认私有对象可恢复 | 新 `verifyBackupObjects` 在维护锁之前逐文件验证原件及派生预览 SHA-256；同样用于 restore 首次上传之前。拒绝缺文件/坏校验、`.assets` 根符号链接、文件符号链接及非普通文件，使用有界流式读取。单元覆盖原件、派生预览、缺失、损坏、符号链接、目录及无文件备份。 |
| 备份产品文档 `_id` 与 `productId` 错配仍可通过 | 校验二者一致，增加错配拒绝用例，防止恢复后产品列表指向不存在文档。 |
| 维护 CLI 缺值、重复/未知标志可被含糊解释 | 在构建云客户端前纯解析；真实操作要求明确环境和相关文件，恢复要求隔离目标；拒绝 `plan --apply`、未知/重复/缺值参数。离线 UUID 计划工具也严格解析 backup/output，拒绝将另一个标志当文件路径。测试不构造云客户端。 |

## 本地执行记录

- `pnpm --filter @zj/portal check`、`pnpm --filter @zj/admin check`：通过。
- `node --import tsx --test tests/unit/portal-session.test.ts`：3/3，通过加密、防篡改、到期、生产配置、CSRF、不回退 Mock、Range 代理流及过期清 Cookie。
- `node --import tsx --test tests/unit/sales-catalog.test.ts`：1/1，包含技术/旧资料、别名、筛选分页、预览/源件权限与当前版本。
- `node --import tsx --test tests/unit/operations-arguments.test.ts tests/unit/backup-objects.test.ts tests/unit/public-id-migration.test.ts`：6/6（包括主执行代理增加的重复 UUID 索引用例）。
- `CHROMIUM_PATH='…Google Chrome' pnpm test:browser tests/browser/sales-workbench.spec.ts`：前三项 3/3 通过；其后新增的管理员绑定销售角色用例单独执行 1/1 通过，完整最终结果由本轮全量报告记录。
- PC 读取/UX 子集：`reading`、`ux`、`requirements-ux`、`series-icons`、`smoke` 中 12 项通过，覆盖 PDF 翻页/缩放/键盘/全屏、图片序列、版本失效、导航返回、1280/1440/720 宽度及按钮同行 ≤2px。
- `reading.spec.ts --grep 'an open reader'`：补充自然段样式断言后 1/1 通过。

## 证据边界与后续全量

生产 PC 的 HTTPS、实际 CloudBase 凭证、账号绑定和多实例同密钥仍需实际部署配置验证；本地 session Cookie 不代表真实身份验收。代理不转发任意客户端 IP，API 默认观察到 Next 代理的来源；真实来源需部署可信代理链。已下载/已缓冲字节不能远程召回。

本轮完整构建、完整单元和完整 Playwright 由主执行流程统一执行并更新总报告；上述子集不能替代全量。其后用户明确批准安全移除补充计划，实施证据见下节；未物理清理任何历史。


## 已确认补充：产品安全移除与恢复

用户随后明确确认 `2026-10-29-safe-product-removal-addendum.md`。实现 ADMIN 专用移除/恢复接口、必填原因与显式确认、两个预期版本及幂等；已发布产品原子下架后软移除，草稿保留 DRAFT。默认列表隐藏已移除，管理员可筛选、查看只读留档/历史并恢复；恢复不自动上架。

`product-removal.test.ts` 三项通过，覆盖角色拒绝、版本冲突、幂等、恢复后再次移除并回放旧恢复不复活、旧发布/上传 key 不绕过、默认列表与已移除筛选、公开/销售有效及无效 Range 拒绝、CONTENT_MANAGER 媒体 Cookie Range 拒绝、ADMIN 原件历史可读、恢复不上架和明确再发布、原型号/公开 UUID/内部编码及索引不复用、不可变快照/文件/历史保留、备份状态校验、Cloud 事务回滚及上传过程中移除后拒绝提交。Cloud 使用内存事务与私有对象替身。

新增 `product-removal.spec.ts` 验证完整管理交互和并发冲突恢复。浏览器和最终完整构建由主执行流程重启隔离 API 后统一运行，未用单元通过代替浏览器通过。

## Banner 与小程序缓存独立复查

发现原小程序图片缓存清空时没有保留版本 tombstone，旧异步写完成会恢复旧图；同一版本的有效期显示/隐藏变化也可能复用错误文件。已改为 slot entry 身份检查、唯一临时文件名、保留 null 版本及旧版本拒绝，并在 API 响应后先检查请求 sequence。进程启动只清理本 helper 生成的历史缓存文件，保留其他用户文件。`site-images.test.ts` 两项 fake-filesystem 测试通过；这不是微信真机证据。

发现首页一直停留前台时有效期不会自动刷新。公共响应新增服务端计算的 `refreshAfterSeconds`（1–30 秒），不返回内部开始/结束日期。首页用相对定时器重载，在 onHide/unmount 停止并作废旧请求，onShow 重启；不依赖客户端时钟，不进行毫秒轮询。日期 rollover、包含边界/排除结束边界和刷新间隔已有单元断言，另新增常驻首页开始与到期 Playwright 用例等待最终运行。
