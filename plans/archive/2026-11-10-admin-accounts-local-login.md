# 后台账号模块改为管理 MySQL 登录账号

日期：2026-11-10
来源：用户反馈「系统设置里后台账号模块感觉怪怪的」，确认按「完整改造」实施。

## 问题

2026-11-06 迁移到 MySQL 自建账号后，后台账号模块仍沿用旧身份提供方模型：

- 列表显示内部「身份主体」`mysql:<uuid>`，不显示真正的登录用户名；
- 新增账号只写 `users` 文档，不写 `auth_users`，新建账号**无法登录**；
- 不能设置或重置密码；改密码只能使用 `services/api/src/user-cli.ts`。

## 目标

后台账号模块直接管理真实登录账号：新增填用户名 + 密码；列表显示登录账号；修改可重置密码；禁用或改密后立即踢掉现有会话。

## 设计

1. 契约
   - `AdminUserWrite`：移除 `subjectId`，新增 `username`（3~64，`^[A-Za-z0-9][A-Za-z0-9._-]*$`）与可选 `password`（8~128）；`required` 为 `username`、`displayName`、`role`、`enabled`。创建时密码由服务端强制必填。
   - `AdminUser` 响应新增可选 `username`（兼容旧数据，不破坏现有构造）。
   - `response-shapes.json` 同步。
2. 领域层 `services/domain/src/engine.ts`
   - `writeUser` 接受 `username`：创建时 `userId = randomUUID()`、`subjectId = mysql:<userId>`；更新时保留 `subjectId` 与用户名不变。
   - 校验用户名在 `users` 中唯一；移除 `subjectId` 相关校验。
   - 支持可选第 4 参数 `userId`，供后端在创建 `auth_users` 时复用同一 ID。
3. 持久化 `services/api/src/domain-backend.ts`
   - 注入 `LocalAccounts`（由 `MysqlAuthStore` 实现）：`userIdFor`、`createUser`、`updatePassword`、`deleteSessionsOf`、`deleteUser`、`usernameOf`。
   - 创建：先校验用户名未被占用 → 生成 `userId` → 写 `auth_users` → 事务写 `users`/`subjects`/`control.admins`；事务失败时删除刚创建的 `auth_users` 行作为补偿。
   - 更新：用户名必须与当前一致；填了 `password` 则重置密码并调用 `deleteSessionsOf`；`enabled: false` 时同样踢掉会话。
   - `users()` 列表对缺少 `username` 的旧账号从 `auth_users` 反查补齐。
4. 认证存储 `services/api/src/mysql-auth.ts`
   - 新增 `usernameOf(userId)`、`deleteUser(userId)`；其余方法已存在。
5. 装配 `services/api/src/main.ts`
   - 将 `authStore` 传给 `DomainBackend`。
6. 后台 `apps/admin/src/components/Management.vue`
   - 列表列改为：登录账号 / 显示名称 / 角色 / 状态 / 操作。
   - 表单：登录账号（创建后可改显示名但用户名只读）、密码（创建必填；修改时留空表示不改）、显示名称、角色、启用。
   - 文案不再出现「身份主体」。
7. 兼容
   - 现有 `admin`、`sales1` 不改密码、不删除；列表通过 `auth_users` 反查显示用户名。
   - `user-cli.ts` 保留，作为运维入口。
8. 文档与测试
   - 更新 `deployment.md` 账号创建说明与 `docs/safe-product-removal.md` 无关内容不动。
   - 更新 `tests/unit/management.test.ts`（请求体改用户名/密码）。
   - 新增测试：创建账号后可用该用户名密码登录；重复用户名返回 409；修改密码后旧会话失效；禁用账号后登录被拒。

## 不做的事

- 不提供删除账号的 UI（仅启停）。
- 不迁移或重置现有密码。
- 不改变登录接口与会话机制。

## 验证

`corepack pnpm generate`、`tsc`、相关单测、admin 类型检查与构建；重启服务后在后台新建一个临时账号，用其登录，改密后确认旧会话失效，最后禁用并清理。
