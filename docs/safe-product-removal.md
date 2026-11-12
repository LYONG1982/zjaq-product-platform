# 产品移除（彻底删除）

2026-11-09 起，「移除产品」是不可恢复的彻底删除，取代此前的软删除与恢复方案（原始方案见 `plans/archive/2026-10-29-safe-product-removal-addendum.md`）。本轮依据用户确认的 `plans/archive/2026-11-09-remove-means-hard-delete.md`。

## 规则

- 仅 `ADMIN` 可移除；仅当前状态为 `DRAFT` 的产品可移除。已发布产品需先下架，已下架产品需先恢复为草稿。
- 弹窗必须填写原因，并输入完整产品编号作为确认；服务端同时核验 `expectedDraftVersion`、`expectedPublicationVersion` 与 Idempotency-Key。重复请求返回原结果，同一 key 提交不同内容拒绝。
- 移除即清除该编号下的产品、草稿、资料历史、全部发布快照、资产与上传索引、型号索引、公开 UUID 索引，并扣减分类引用计数；私有文件字节在事务提交后删除。
- 审计记录保留，动作记为 `REMOVE_PRODUCT`（含原因、操作者与当时版本）。
- 编号立即可重新使用（手填流水）；`code-<前缀>` 计数器不回退，自动分配继续向前。
- 不存在「已移除」列表、只读留档或恢复接口。`POST /restore` 已删除，`GET /admin/products?removed=true` 返回空列表。

## 影响

- 移除不可恢复，旧发布链接立即 404。
- 已下载或已缓冲的文件字节无法远程收回。
- 文件字节删除失败会留下孤儿文件，需要后续人工清理。

## 接口

`POST /api/v1/admin/products/{productId}/remove`，仅 ADMIN。请求体为 `ProductRemoval`（`expectedDraftVersion`、`expectedPublicationVersion`、`reason`、`confirmation`、`confirmed: true`），成功返回 `RemoveResult{productId}`。

验证使用隔离虚构产品、HTTP 测试服务与内存事务替身，不修改真实产品数据。
