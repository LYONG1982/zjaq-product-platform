# 实施记录：后台账号改为本地登录账号

日期：2026-11-10
计划：`plans/archive/2026-11-10-admin-accounts-local-login.md`

## 背景

后台「系统设置 → 后台账号」仍沿用旧身份提供方模型：列表显示 `mysql:<uuid>` 身份主体；新增账号只写 `users` 文档，不写 `auth_users`，新建账号无法登录；无法设置或重置密码。用户确认按「完整改造」实施。

## 实际改动

1. 契约
   - `AdminUserWrite`：移除 `subjectId`，新增 `username`（3~64、`^[A-Za-z0-9][A-Za-z0-9._-]*$`）与可选 `password`（8~128）。
   - `AdminUser` 响应新增可选 `username`，兼容尚未回填的旧账号。
   - `contracts/CHANGES.md` 记录本轮变更；执行 `corepack pnpm generate`。
2. 认证存储 `services/api/src/mysql-auth.ts`
   - 新增 `usernameOf(userId)` 与 `deleteUser(userId)`（同时清理会话）。
3. 领域层 `services/domain/src/engine.ts`
   - `writeUser` 改为接受 `username`：创建时生成 `userId` 与 `subjectId = mysql:<userId>`；更新时保留 `subjectId`，用户名只读；用户名在用户列表中唯一。
   - 新增可选第 4 参数 `userId`，让后端与 `auth_users` 使用同一 ID。
4. 持久化 `services/api/src/domain-backend.ts`
   - 新增 `LocalAccounts` 接口并注入 `MysqlAuthStore`。
   - `writeUser`：校验用户名占用与密码长度；创建时先写 `auth_users`，文档事务失败时删除刚创建的登录行作为补偿；更新时支持重置密码并踢掉会话；禁用时也踢掉会话。
   - `users()`：对旧账号缺少 `username` 的情况从 `auth_users` 反查补齐。
5. 身份 `services/api/src/auth.ts`
   - `identityFor` 返回身份时剔除 `username`，避免登录/`/admin/me` 响应因契约 `additionalProperties: false` 校验失败。
6. 装配 `services/api/src/main.ts`
   - 将 `authStore` 注入 `DomainBackend`。
7. 后台 `apps/admin/src/components/Management.vue`
   - 列表改为「登录账号 / 显示名称 / 角色 / 状态 / 操作」。
   - 表单新增登录账号（创建后只读）与密码（创建必填、修改留空不改），移除身份主体与相关文案。
8. 文档与测试
   - 更新 `README.md` 账号创建说明。
   - `tests/unit/management.test.ts`、`tests/unit/sales-identity.test.ts`、`tests/unit/contracts.test.ts` 改用用户名/密码。
   - 新增 `tests/unit/admin-accounts.test.ts`：创建登录、重复用户名 409、缺少密码 422、用户名不可改 422、改密踢会话、禁用踢会话、文档失败补偿删除登录行。

## 实际命令与结果

- `corepack pnpm generate`：成功。
- `corepack pnpm exec tsc -p tsconfig.json`：通过。
- `tests/unit/admin-accounts.test.ts`、`management.test.ts`、`contracts.test.ts`：13/13 通过。
- `tests/unit/sales-identity.test.ts` 等：5/5 通过。
- `corepack pnpm --filter @zj/admin check` 与 `build`：通过。
- 重启服务后真实数据验证（临时账号 `verify_editor`）：
  - 新建 200，账号可立即登录；`/admin/me` 200。
  - 重置密码后旧会话 401、旧密码 401、新密码可登录。
  - 禁用后现有会话 401、再次登录 403。
  - 账号列表显示 `admin` / `sales1` 用户名（旧账号由 `auth_users` 反查）。
- 验证完成后删除临时账号的 `auth_users`、`auth_sessions`、`users`、`subjects` 记录；审计事件保留。

## 修复记录

首次真实验证时 `/admin/me` 对新账号返回 500。原因是用户文档新增 `username` 后，`identityFor` 将其一并放进登录身份，而 `AdminIdentity` 契约为 `additionalProperties: false`，响应校验失败。已在 `identityFor` 中剔除 `username` 并重新验证通过。

## 限制

- `auth_users` 与文档表不在同一事务：创建时以补偿删除兜底，极端崩溃窗口仍可能留下无法登录的登录行，需要维护人员清理。
- 未提供删除账号的 UI；停用即可阻止登录。
- 存量账号密码未重置，用户名以 `auth_users` 为准。
