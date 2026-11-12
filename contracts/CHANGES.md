# 第一轮契约差异（2026-10-19）

来源快照：../delivery/v4-rc2/contracts；原文件保持不变。

已按确认计划实施两项补齐：

- 公共产品、公共资料、后台产品列表的 q 参数增加 maxLength: 100。长度按 JSON Schema Unicode 字符计数，超长或重复参数返回 400 INVALID_ARGUMENT，检索按普通文本处理。
- GET /api/v1/admin/templates 增加可选 templateId（四种模板 ID）和 version（正整数）。默认返回可用于新建的版本；includeDisabled=true 返回全部符合条件的版本；同时指定 templateId 和 version 时允许读取已禁止新建的历史版本。不存在的版本返回空列表，不静默切换至新版本。

接口仍为 28 项。原有分类和账号 PATCH 中 allOf 的 expectedVersion 约束保留。第一轮仅实现 9 项读取接口，完整写业务不在本轮范围。

后续仍需独立计划明确：搜索覆盖口径、首批推荐跨分页、结果总量。当前代码未擅自新增这些查询字段。

# 第三轮反馈修复（2026-11-09）

- `CreateProduct` 新增可选 `sequence`（1~999）：填写时按手填三位流水创建，省略时保持自动分配并跳过已占用编号。
- 新增 `RenumberProduct` 与 `POST /api/v1/admin/products/{productId}/renumber`：仅未发布草稿可重算编号与配置项，已发布或曾发布产品不可改号。
- 首页“产品一览”不再按 `pilotOrder` 过滤，展示全部已发布产品；契约中的 `pilotOrder` 字段与种子数据保持不变。
- 新增 `RestoreDraft` 与 `POST /api/v1/admin/products/{productId}/restore-draft`：将已下架产品恢复为草稿，保留编号、公开标识、发布快照与历史。

# 移除即彻底删除（2026-11-09）

- `POST /api/v1/admin/products/{productId}/remove` 改为不可恢复的彻底删除：`ProductRemoval` 新增必填 `confirmation`（须与产品编号一致），成功响应改为 `RemoveResult{productId}`。
- 删除 `POST /api/v1/admin/products/{productId}/restore` 与 `POST /api/v1/admin/products/{productId}/purge`，以及 `PurgeProduct` 定义；不再提供已移除列表与恢复。
- 彻底删除会清除该编号的产品、草稿、资料历史、全部发布快照、资产与上传记录、型号与公开标识索引，并扣减分类引用计数；审计保留；编号可重新使用。

# 后台账号改为本地登录账号（2026-11-10）

- `AdminUserWrite`：移除 `subjectId`，新增 `username`（3~64）与可选 `password`（8~128）；创建时密码由服务端强制必填。
- `AdminUser` 响应新增可选 `username`；旧账号在列表中由 `auth_users` 反查补齐，不修改存量密码。
- 账号创建、改密、启停直接作用于 `auth_users`；改密或禁用会清除该账号现有会话。路由与登录接口不变。


