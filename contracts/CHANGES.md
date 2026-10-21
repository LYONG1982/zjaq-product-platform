# 第一轮契约差异（2026-10-19）

来源快照：../delivery/v4-rc2/contracts；原文件保持不变。

已按确认计划实施两项补齐：

- 公共产品、公共资料、后台产品列表的 q 参数增加 maxLength: 100。长度按 JSON Schema Unicode 字符计数，超长或重复参数返回 400 INVALID_ARGUMENT，检索按普通文本处理。
- GET /api/v1/admin/templates 增加可选 templateId（四种模板 ID）和 version（正整数）。默认返回可用于新建的版本；includeDisabled=true 返回全部符合条件的版本；同时指定 templateId 和 version 时允许读取已禁止新建的历史版本。不存在的版本返回空列表，不静默切换至新版本。

接口仍为 28 项。原有分类和账号 PATCH 中 allOf 的 expectedVersion 约束保留。第一轮仅实现 9 项读取接口，完整写业务不在本轮范围。

后续仍需独立计划明确：搜索覆盖口径、首批推荐跨分页、结果总量。当前代码未擅自新增这些查询字段。
