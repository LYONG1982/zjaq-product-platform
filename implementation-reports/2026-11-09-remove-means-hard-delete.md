# 实施记录：移除即彻底删除

日期：2026-11-09
计划：`plans/archive/2026-11-09-remove-means-hard-delete.md`
取代：`implementation-reports/2026-11-09-purge-removed-product.md` 中的两步式彻底删除方案。

## 背景

用户要求「直接给我搞成完全删除的，别在整个已删除列表了」，并确认把现有 4 个已移除产品一并彻底删除。

## 实际改动

1. 契约
   - `ProductRemoval` 新增必填 `confirmation`（须与产品编号一致）。
   - `PurgeResult` 更名为 `RemoveResult`，新增 `RemoveResultResponse`；`/remove` 成功响应改为该类型。
   - 删除 `PurgeProduct` 定义与 `POST /restore`、`POST /purge` 路由；同步 `api-inventory.json` 与 `CHANGES.md`。
   - 执行 `corepack pnpm generate` 重新生成类型。
2. 领域层 `services/domain/src/engine.ts`
   - `removeProduct` 改为不可恢复删除：校验草稿状态、原因、完整编号、两个版本；写 `REMOVE_PRODUCT` 审计；清理内存中的产品、发布快照、元数据与型号/资料版本归属；返回 `{ productId }`。
   - 删除 `restoreProduct`、`purgeProduct`。
3. 持久化 `services/api/src/domain-backend.ts`
   - `remove` 命令在事务内删除 `products`/`drafts`/`history`、全部 `releases`、`control/model-*`、`control/public-*`、`assets`、`uploads`，扣减分类引用计数；事务提交后删除私有文件字节。
   - 删除 `restore`/`purge` op 与对应入口方法。
4. 路由与客户端
   - `http.ts` 仅保留 `POST /remove`（ADMIN）；删除 `/restore`、`/purge`。
   - `api-client` 删除 `restoreProduct`、`purgeProduct`，`removeProduct` 返回 `RemoveResult`。
   - 列表筛选 `removed=true` 固定返回空数组，不再提供已移除视图。
5. 后台 `apps/admin/src/App.vue`
   - 删除「记录范围」「查看已移除」「恢复产品」入口。
   - 「移除产品」按钮对草稿可见，弹窗要求原因、输入完整编号并勾选不可恢复。
6. 文档
   - 重写 `docs/safe-product-removal.md`。
7. 数据处理
   - 通过旧 `purge` 接口删除 4 个已移除产品：`ZJ-D-H-A-002`、`ZJ-D-H-B-001`、`ZJ-D-S-A-001`、`ZJ-D-S-A-999`。

## 实际命令与结果

- `corepack pnpm generate`：成功。
- `corepack pnpm exec tsc -p tsconfig.json`：通过。
- `node --import tsx --test tests/unit/product-removal.test.ts`：5/5 通过。
- `node --import tsx --test tests/unit/workflow.test.ts`：10/10 通过。
- `node --import tsx --test tests/unit/contracts.test.ts tests/unit/api.test.ts`：11/11 通过。
- `corepack pnpm --filter @zj/admin check`：通过。
- `corepack pnpm --filter @zj/admin build`：成功。
- 以 `DEMO_LAN_HOST=192.168.150.155` 与 MySQL 配置重启四端；`/health` 返回 200，`provider:"mysql"`。
- 真实数据验证（临时产品 `ZJ-D-S-A-901`）：新建 200 → 错误编号确认 422 → 移除 200（返回 `{productId}`）→ 草稿读取 404 → `/restore` 404 → `/purge` 404 → 同号同型号新建 200 → 再次移除 200 清理完成。
- 数据库核对：products 6 条、带 `deletedAt` 的 0 条；`REMOVE_PRODUCT` 审计 8 条。

## 限制

- 移除不可恢复，旧发布链接立即 404。
- 文件字节删除失败会留下孤儿文件。
- 已有历史审计保留，旧记录的 `targetId` 仍指向已删除编号。
