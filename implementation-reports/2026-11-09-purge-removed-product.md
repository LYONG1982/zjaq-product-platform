# 实施记录：彻底删除已移除产品并释放编号

日期：2026-11-09
计划：`plans/archive/2026-11-09-purge-removed-product-to-free-code.md`

## 背景

用户反馈「我移除产品后，编号还是会被占用」。核实结论：移除为软删除，产品文档以原编号为主键保留，编号必然被占用；要释放编号必须新增不可恢复的「彻底删除」。用户确认采用该方案。

## 实际改动

1. 契约
   - `contracts/domain.schema.json`：新增 `PurgeProduct`（`expectedDraftVersion`、`expectedPublicationVersion`、`reason`、`confirmation`、`confirmed: true`）。
   - `contracts/response.schema.json`：新增 `PurgeResult`、`PurgeResultResponse`。
   - `contracts/api-contract.yaml`：新增 `POST /api/v1/admin/products/{productId}/purge`（`x-required-role: ADMIN`）。
   - `contracts/api-inventory.json`：登记 `purgeProduct`。
   - `contracts/CHANGES.md`：追加本轮说明。
   - 执行 `corepack pnpm generate` 重新生成类型。
2. 领域层 `services/domain/src/engine.ts`
   - 新增 `purgeProduct`：仅 ADMIN；要求产品已移除；`confirmation` 必须等于产品编号；校验草稿/发布版本；记录 `PURGE_PRODUCT` 审计；清理内存中的产品、发布快照、元数据与型号/资料版本归属。
3. 路由与客户端
   - `services/domain/src/backend.ts`：新增 `purgeProduct`。
   - `services/domain/src/http.ts`：新增 `/purge` 路由，仅 ADMIN。
   - `packages/api-client/src/index.ts`：新增 `purgeProduct`。
4. 持久化 `services/api/src/domain-backend.ts`
   - 命令 op 增加 `purge`；事务外预取该产品的全部发布快照、`model-*` 索引、`assets` 与 `uploads`。
   - 事务内：删除 `products`/`drafts`/`history`、全部 `releases`、`control/model-*`、`control/public-*`、`assets`、`uploads`；按 `previousRefs` 扣减 `catalog.references`；不修改 `code-<前缀>` 计数器；审计与幂等记录照常写入。
   - 事务提交成功后调用资产存储删除 `fileId`/`previewFileId`。
   - `before` 取值改为 `engine.products.get(id)`，使幂等重放（产品已不存在）不会先行抛 404。
5. 资产 `services/api/src/asset-repository.ts`
   - 新增 `PersistedAssets.purgeFiles`，失败仅忽略，不回滚数据库。
6. 后台 `apps/admin/src/App.vue`
   - 已移除行新增「彻底删除」按钮（仅 ADMIN）。
   - 新增确认弹窗：原因必填、需输入完整产品编号、勾选不可恢复；按钮在条件不满足时禁用。
   - 审计动作名与筛选下拉加入 `PURGE_PRODUCT`。
7. 测试
   - `tests/support/backend.ts` 绑定 `purgeProduct`。
   - `tests/unit/product-removal.test.ts` 新增 2 项：
     - HTTP：401/403/422/409 校验、成功删除、幂等重放、删除后 404、同号新建成功、审计唯一。
     - 持久化：事务回滚、文档/快照/型号索引/公开 UUID 索引/资产/上传索引清除、分类引用扣减、编号计数器不变、文件字节删除、恢复返回 404、同号同型号重建成功、索引核对 0 项待修复。

## 实际命令与结果

- `corepack pnpm generate`：成功。
- `corepack pnpm exec tsc -p tsconfig.json`：通过。
- `node --import tsx --test tests/unit/product-removal.test.ts`：8/8 通过。
- `node --import tsx --test tests/unit/workflow.test.ts`：10/10 通过。
- `node --import tsx --test tests/unit/contracts.test.ts tests/unit/api.test.ts`：11/11 通过。
- `corepack pnpm --filter @zj/admin check`：通过。
- `corepack pnpm --filter @zj/admin build`：成功（97 modules，1.02s）。

## 限制与未完成

- 本地 demo 服务在重启时因当前终端缺少 `MYSQL_USER`/`MYSQL_DATABASE` 等配置而未能启动，等待用户提供 MySQL 连接信息后重启并做真实数据验证（移除 → 彻底删除 → 同号新建）。
- 文件字节删除失败会留下孤儿文件，需后续人工清理。
- 彻底删除不可恢复，旧发布链接立即 404。
