# 彻底删除已移除产品并释放编号

日期：2026-11-09
来源：用户反馈「我移除产品后，编号还是会被占用」，并在选项中确认「增加『彻底删除』释放编号」。

## 背景

当前「移除」是软删除：产品文档仍以原编号为主键保留在 `products`/`drafts`，发布快照 `releases` 也指向它，用于支持恢复。因此编号始终被判定占用，新建或改号命中该编号会返回 `409 CODE_CONFLICT`。

要释放编号，必须提供不可恢复的「彻底删除」。为降低误删风险，彻底删除只作用于**已移除（`deletedAt` 非空）**的产品，形成「移除 → 彻底删除」两步。

## 规则

- 仅 `ADMIN` 可执行；必须填写原因，且 `confirmation` 必须与产品编号（如 `ZJ-D-S-A-001`）完全一致。
- 仅当产品已被移除时允许；未移除返回 409 `INVALID_STATE`。
- 校验 `expectedDraftVersion`、`expectedPublicationVersion`，不一致返回 409。
- 清除该编号下全部数据：`products`、`drafts`、`history`、该产品的全部 `releases`、`assets` 与 `uploads` 记录、`model-*` 型号索引、`public-*` 公开 UUID 索引，并扣减 `control/catalog` 分类引用计数。
- 编号立即可重新使用（手填流水）；`code-<前缀>` 计数器**不回退**，自动分配仍继续向前，避免与在册产品冲突。
- 审计事件不删除，并新增 `PURGE_PRODUCT` 记录（含原因、操作者、当时版本）。
- 资产字节按 `fileId`/`previewFileId` 调用私有存储的 `remove`；删除失败仅记录日志，不回滚数据库事务，也不阻断返回。
- 彻底删除后产品不可恢复；`restoreProduct` 对该编号返回 404。

## 实施清单

1. 契约
   - `contracts/domain.schema.json`：新增 `PurgeProduct`（`expectedDraftVersion`、`expectedPublicationVersion`、`reason`、`confirmation`、`confirmed: true`，`additionalProperties: false`）与 `PurgeResult`（`productId`）。
   - `contracts/api-contract.yaml`：新增 `POST /api/v1/admin/products/{productId}/purge`，`x-required-role: ADMIN`，引用上述类型。
   - `contracts/api-inventory.json`：登记同一条目（operationId `purgeProduct`）。
   - `contracts/CHANGES.md`：追加本轮说明。
   - 运行 `corepack pnpm generate` 重新生成类型。
2. 领域层 `services/domain/src/engine.ts`
   - 新增 `purgeProduct(id, body, key, requestId)`：`adminOnly`、要求 `deletedAt`、校验版本与确认编号；推送 `PURGE_PRODUCT` 审计事件；从内存映射移除产品、发布快照、元数据、资料历史与型号归属；返回 `{ productId }`。
   - 幂等键固定为 `POST /admin/products/<id>/purge`。
3. 路由与类型
   - `services/domain/src/backend.ts`：新增 `purgeProduct: Method<"purgeProduct">`。
   - `services/domain/src/http.ts`：新增 `/api/v1/admin/products/{id}/purge` 路由，仅 `ADMIN`。
   - `packages/api-client/src/index.ts`：新增 `purgeProduct(id, body, key)`。
4. 持久化 `services/api/src/domain-backend.ts`
   - 命令 op 增加 `purge`。
   - 事务外预取：该产品的全部 `releases`、归属它的 `model-*` 索引、`assets`、`uploads`。
   - 事务内（`op === "purge"` 分支，先于通用写回逻辑）：删除 `products`/`drafts`/`history`、各 `releases`、`control/model-*`、`control/public-*`、`assets`、`uploads`；按 `previousRefs` 扣减 `catalog.references`；写审计事件与幂等记录；`advance(tx)`。
   - 事务提交成功后调用资产存储删除对应文件。
   - 不修改 `code-<前缀>` 计数器。
5. 资产 `services/api/src/asset-repository.ts`
   - `PersistedAssets` 新增 `purgeFiles(fileIds: string[])`，内部调用 `this.storage.remove`。
6. 后台 `apps/admin/src/App.vue`
   - 仅对 `r.deletedAt` 的行使 ADMIN 显示「彻底删除」按钮；确认弹窗要求输入产品编号 + 原因，文案明确不可恢复、编号将被释放、快照与原件将删除。
   - 审计动作名补充 `PURGE_PRODUCT: "彻底删除产品"`。
7. 测试
   - `tests/support/backend.ts` 绑定 `purgeProduct`。
   - `tests/unit/workflow.test.ts`：移除 → 彻底删除 → 用同一流水重新新建成功；未移除直接彻底删除返回 409；确认编号不匹配返回 422；彻底删除后恢复产品返回 404；彻底删除后原型号可再次使用。
   - `tests/unit/product-removal.test.ts`：持久化路径验证 `products`/`drafts`/`history`/`releases`/`assets`/`uploads`/`model-*`/`public-*` 全部清除、分类引用计数扣减、审计保留、幂等重放不重复执行；彻底删除后启动索引核对无孤儿。

## 不做的事

- 不改变「移除」的软删除语义与恢复能力。
- 不批量清理现有已移除产品；由用户按需逐个彻底删除。
- 不回退编号计数器，不重排其他产品编号。
- 不删除 `audit` 与 `analytics` 记录。

## 限制

- 彻底删除不可逆，旧发布链接立即 404。
- 文件字节删除失败会留下孤儿文件，需要后续人工清理。

## 验证

`corepack pnpm generate`、`tsc`、单元测试、admin 类型检查与构建；重启本地服务后用真实数据执行一次「移除 → 彻底删除 → 同号新建」。
