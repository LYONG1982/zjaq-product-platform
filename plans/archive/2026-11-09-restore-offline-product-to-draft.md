# 已下架产品恢复为草稿

日期：2026-11-09
来源：用户确认「已下架产品 → 新增恢复为草稿」。

## 背景

当前状态机只有 DRAFT / PUBLISHED / OFFLINE，路径单向：草稿 → 发布 → 下架。下架后没有回到草稿的入口；下架产品可继续编辑和重新发布，但后台始终显示“已下架”。用户需要把已下架产品恢复为草稿。

## 范围

新增“恢复为草稿”动作：`OFFLINE → DRAFT`，保留编号、公开 UUID、已发布快照、发布历史与草稿内容；可在之后继续编辑或再次发布。

明确不做：

- 不改变“移除只允许从未发布草稿”的规则，恢复为草稿后仍不可移除。
- 不删除、不改写任何现有产品数据。
- 不调整公开读取口径（公开/销售端仍只展示 PUBLISHED）。

## 实施

### 契约

- `contracts/domain.schema.json` 新增 `RestoreDraft`：`expectedDraftVersion`、`expectedPublicationVersion`、`reason`（1~300）、`confirmed: true`。
- `contracts/api-contract.yaml`、`contracts/api-inventory.json`：新增 `POST /api/v1/admin/products/{productId}/restore-draft`（CONTENT_MANAGER / ADMIN），响应 `AdminDraftResponse`。
- `contracts/CHANGES.md` 记录；执行 `corepack pnpm generate`。

### 服务端

- `services/domain/src/engine.ts` 新增 `restoreDraft()`：
  - 仅允许 `publicationState === "OFFLINE"`，校验草稿版本与发布版本。
  - 设为 `DRAFT`，`publicationVersion + 1`，保留 `lastReleaseId`、`releaseSequence`、`lastPublishedDraftVersion`、`publicId` 与草稿内容。
  - 写入 `RESTORE_DRAFT` 审计，原因必填。
- `services/api/src/domain-backend.ts`：`command` 增加 `restoreDraft` op，复用现有事务持久化（产品、草稿、历史、分类计数、审计）。
- `services/domain/src/backend.ts`、`services/domain/src/http.ts`、`packages/api-client/src/index.ts`：新增类型、路由与客户端方法。
- `tests/support/backend.ts`：测试后端绑定。

### 后台

- `apps/admin/src/components/ProductEditor.vue`：已下架产品显示“恢复为草稿”按钮，弹确认卡（产品名、编号、原因，默认“恢复为草稿”）；成功后更新状态与版本，刷新列表。

### 测试与验证

1. `corepack pnpm generate && corepack pnpm check:generated`
2. 新增单测：发布 → 下架 → 恢复为草稿 → 状态为 DRAFT、编号与草稿不变、可再次发布；对草稿和已发布产品调用返回 409；版本冲突返回 409；审计含原因。
3. `node_modules/.bin/tsc -p tsconfig.json`、portal/admin/mobile 类型检查。
4. 构建 portal / admin / H5 / 小程序。
5. `scripts/demo-lan.mjs` 重启本地服务后，用后台实际点击验证“恢复为草稿”。

## 风险

- 恢复为草稿只改发布状态，不产生新发布快照；再次发布时会基于当前草稿新建快照，符合现有发布流程。
- 历史发布版本继续保留，公开链接在恢复后仍不可访问，直到重新发布。
