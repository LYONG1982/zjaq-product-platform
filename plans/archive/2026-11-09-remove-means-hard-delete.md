# 移除即彻底删除（取消回收站与恢复）

日期：2026-11-09
来源：用户明确要求「直接给我搞成完全删除的，别在整个已删除列表了」。

## 目标

把「移除产品」从软删除改为不可恢复的彻底删除：移除后编号立即释放，不再有「已移除」列表与恢复入口。当前「彻底删除」的两步流程并入「移除」。

## 规则

- 仅 `ADMIN` 可移除；仍只允许当前状态为 `DRAFT` 的产品（已发布先下架，已下架先恢复为草稿）。
- 请求体沿用 `ProductRemoval` 并新增必填 `confirmation`：必须与产品编号完全一致；原因必填、`confirmed: true`。
- 移除即清除：`products`、`drafts`、`history`、该产品全部 `releases`、`assets`/`uploads` 记录与私有文件、`model-*` 型号索引、`public-*` 公开 UUID 索引，并扣减分类引用计数。
- 审计保留，动作记为 `REMOVE_PRODUCT`（不再产生 `PURGE_PRODUCT`）。
- `code-<前缀>` 计数器不回退；同号可手填新建。
- 删除 `POST /restore`、`POST /purge` 两个路由与对应客户端方法；`GET /admin/products?removed=true` 不再作为可用筛选（已移除记录不存在）。
- `restore-draft`（已下架 → 草稿）保留，与移除无关。

## 实施

1. 契约
   - `ProductRemoval` 增加 `confirmation`（必填）；`/remove` 成功响应改为 `RemoveResult{productId}`。
   - 删除 `PurgeProduct`/`PurgeResult` 与 `/purge`、`/restore` 声明；同步 `api-inventory.json`、`api-contract.yaml`、`CHANGES.md`。
   - 重新生成类型。
2. 领域层
   - `removeProduct` 改为彻底删除：校验 DRAFT、原因、确认编号、两个版本；写 `REMOVE_PRODUCT` 审计；清理内存映射；返回 `{ productId }`。
   - 删除 `purgeProduct`、`restoreProduct`。
3. 持久化
   - `command("remove")` 走原 `purge` 分支的清理逻辑（文档、快照、索引、资产、分类计数、事务提交后删除文件字节）。
   - 删除 `restore`/`purge` op 分支。
4. 路由与客户端
   - 删除 `/restore`、`/purge` 路由；`/remove` 仅 ADMIN。
   - `api-client` 删除 `restoreProduct`、`purgeProduct`；`removeProduct` 返回 `RemoveResult`。
5. 后台
   - 删除「记录范围」下拉、「查看已移除」按钮、恢复按钮与相关状态。
   - 「移除产品」按钮对草稿可见，点击直接打开现有确认弹窗（原因 + 完整编号 + 不可恢复勾选）。
6. 测试
   - 重写 `product-removal.test.ts`：软删除/恢复/回收站用例改为彻底删除断言（文档、快照、索引、资产、分类计数、文件字节、审计、幂等重放、同号同型号重建）。
   - 移除 `restoreProduct` 相关断言；`workflow.test.ts` 仅保留下架→恢复草稿用例。
   - 更新 `tests/support/backend.ts`。
7. 文档
   - 更新 `docs/safe-product-removal.md`、`README`/`deployment` 中涉及恢复与回收站的描述。

## 数据处理（需确认）

库中现存 4 个已移除产品：`ZJ-D-H-A-002`、`ZJ-D-H-B-001`、`ZJ-D-S-A-001`、`ZJ-D-S-A-999`。改造后界面不再有入口，需要确认是否在本次一并彻底删除以释放编号。

## 验证

`corepack pnpm generate`、`tsc`、相关单测、admin 类型检查与构建；服务重启后用真实数据执行「新建 → 移除 → 同号新建」，并确认编号与型号可立即复用。

## 限制

移除不可恢复，旧发布链接立即 404；文件字节删除失败会留下孤儿文件。
