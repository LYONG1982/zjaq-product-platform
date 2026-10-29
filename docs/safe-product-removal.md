# 产品安全移除与恢复

方案经用户于 2026-10-29 明确确认，见 `plans/archive/2026-10-29-safe-product-removal-addendum.md`。

管理员可从产品列表执行“移除产品”。弹窗必须给出原因并明确确认。服务端同时核验 `expectedDraftVersion`、`expectedPublicationVersion` 及 Idempotency-Key；重复请求返回原操作结果，重用同一 key 提交不同内容拒绝。内容制作人、销售和匿名身份均不能移除或恢复。

移除使用 `deletedAt`、`deletedBy`、`deletionReason` 标记。已发布产品在同一事务中下架，清空 activeReleaseId，保留 lastReleaseId 和不可变发布快照；草稿仍为 DRAFT，已下架仍为 OFFLINE，不新增状态枚举。移除和恢复均递增草稿版本，避免另一窗口使用旧基准继续操作。当前发布版本在实际下架时递增。

默认管理列表不返回已移除产品。管理员通过“已移除”筛选进入只读留档，可查看历史资料及原有文件，并执行恢复。内容制作人不能通过直达、历史接口或已签发的媒体 Cookie 读取已移除产品。公开与销售列表、详情、清单、预览及下载（包括 Range）均拒绝新访问。

移除后禁止保存、发布、下架和发起/续传/完成上传，旧发布或上传幂等 key 也不能绕过移除状态。Cloud 上传在获取处理租约和提交结果的事务内重复检查状态；若上传过程中移除，提交拒绝并尽力清理本次新上传的对象。已经保存的历史和原件不清理，已下载/已缓冲的字节也不能远程收回。

恢复清除当前移除标记，保留 REMOVE_PRODUCT/RESTORE_PRODUCT 审计及操作原因。恢复不恢复 activeReleaseId，不自动上架：曾发布产品保持 OFFLINE，需要重新检查并明确发布；未发布产品保持 DRAFT。恢复前后的产品内部编码、公开 UUID、型号占用、序号、历史、文件和索引均不变，不回收供其他产品使用。

接口为 `POST /api/v1/admin/products/{productId}/remove` 与 `/restore`，均限 ADMIN。请求包括两个预期版本、必填 reason、`confirmed: true`，返回 AdminDraft。`GET /admin/products?removed=true` 仅供管理员查看已移除记录，默认或 false 为正常产品。备份保留全部主档和审计；恢复校验拒绝带移除标记而仍处于 PUBLISHED/activeReleaseId 非空的损坏主档。

验证使用隔离虚构产品、Mock HTTP 和内存事务替身，不修改 27 款原始产品，不连接真实 CloudBase 或执行真实迁移。完整执行结果由实施和 Playwright 总报告记录。
