# MySQL 后端迁移与 Mock/CloudBase 移除（2026-11-06）

状态：已获用户确认并实施完成。确认内容：MySQL 用 JSON 文档表；文件存本地磁盘目录；自建账号密码登录（ADMIN / CONTENT_MANAGER / SALES）；CloudBase 与 Mock 两个后端都删除；依赖 MockStore 的测试改用内存 Repository 替身；使用本机已安装的 MySQL 5.7。

## 范围

1. 把 `services/mock-api/src` 中的共用模块迁到 `services/domain`：`asset-store`、`asset-limits`、`contract`、`seed-products`、`site-image`、`media/parse-file.mjs`，并更新全部引用。
2. 新增内存测试替身 `tests/support/{store,backend,server,bootstrap}`，改写依赖 Mock 的单元测试。
3. 删除 `services/mock-api`、CloudBase 存储适配器、CloudBase 身份实现、Mock 专用种子脚本与 `@cloudbase/node-sdk` 依赖。
4. 新增 MySQL 仓储：`services/api/src/mysql-repository.ts` + `migrations/001_init.sql`（`documents`、`auth_users`、`auth_sessions`）。
5. 新增本地私有存储 `local-private-storage.ts`（`ZJ_STORAGE_DIR`，默认 `work/storage`）。
6. 新增自建认证：scrypt 密码散列、DB 会话（令牌只存 sha256）、`/api/v1/auth/login|me|logout`。
7. 初始化与运维：`initialize.ts`（分类、控制记录、首个管理员，不导入示例产品）、`db:migrate`、`db:init`、`db:user`、备份/恢复与索引核对脚本改为 MySQL。
8. 前端登录切换：后台与销售门户都调用 `/auth/login`；删除 `VITE_MOCK_*`、`VITE_CLOUDBASE_*`、`NEXT_PUBLIC_ENABLE_SALES_MOCK` 与本地验证按钮。
9. 文档：`README.md`、`deployment.md`、`backup-restore.md`、`content-operations.md`、`.env.example` 及相关 docs 更新。

## 已验证（本地实际执行）

- `tsc -p tsconfig.json --noEmit`、`pnpm --filter @zj/{portal,admin,mobile} check`、`pnpm check:generated` 全部通过；`pnpm --filter @zj/admin build` 通过。
- `pnpm test`：89 项中 84 通过、1 跳过；4 项失败均为 Windows 环境限制（缺少 `unzip`；Unix shebang 探测夹具无法在 Windows 执行；一项缓存 TTL 计时抖动）。
- MySQL 5.7.17 本机实例：创建 `zjaq` 库与 `zj_app` 专用账号；`pnpm db:migrate` 应用 `001_init.sql`；`pnpm db:init` 写入首个管理员；`user-cli.ts` 创建 SALES 账号。
- API `/health` 返回 `provider:"mysql"`、`video.status:"ready"`。
- 登录 `/auth/login` 200；错误密码 401；`/admin/me` 200；`/admin/products` 初始 0 条；`/admin/categories` 4 条。
- 完整业务链路：新建产品 → 上传 PDF（READY，2 页）→ 保存草稿 → 发布 → 公开 `/catalog/products`、详情与资料 manifest 均 200。
- 销售链路：SALES 登录 200，`/sales/me` 返回 SALES，`/sales/catalog/products` 200，访问 `/admin/products` 返回 403。
- 门户 `/api/sales/session` 用账号密码登录返回 200 并下发 HttpOnly 加密 Cookie；携带 Cookie 访问 `/` 与 `/materials` 200，匿名访问 307 跳转；错误密码 401。
- 重启 API 后产品、公开数据与登录仍可用（MySQL 持久化）。

## 限制与后续

- 单集合导出上限 10,000、单文档 750KB；生产分页与索引需按实际数据量设计。
- 私有文件为单机磁盘目录，多实例部署需共享存储或对象存储；备份须包含 `work/storage`。
- 浏览器测试套件仍基于旧 Mock 会话，尚未迁移到 MySQL。
- 微信真机、真实反向代理/HTTPS、生产环境账号与密钥轮换需目标环境独立验收。
- 本机初始化时设置的管理员、SALES 账号与数据库密码仅用于本地；可通过 `db:user` 重置，生产须由秘密管理注入。
