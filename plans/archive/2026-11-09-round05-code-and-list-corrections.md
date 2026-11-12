# 第三轮反馈修复：编号手填、草稿改号、首页列表口径

日期：2026-11-09（Asia/Shanghai）
来源：用户提供的《产品资料平台 · 第三轮反馈：问题与建议》，经代码与本机接口核实后确认范围。

## 一、已核实的事实

1. 编号由服务端自动生成：`ZJ-{系列}-{类型}-{来源}-{三位流水}`，流水 001~999；计数器持久化在 `control/code-<前缀>`，删除/下架不回退。
2. 新建表单没有编号输入与确认卡，只提示“编号将在创建后生成”。
3. 编辑页允许改“所属分类”，但编号不重算，导致编号前缀与新分类脱节；`productId` 本身不可改。
4. 本机接口实测：密翼有 1 款已发布产品，`pilotOrder` 为 `null`；首页“产品一览”只展示 `pilotOrder` 非空产品，所以上方 1 款、下方空态。分类计数与列表接口本身口径一致。
5. 仓库中没有 28 款对照表，本轮不改任何现有数据。

## 二、本轮已确认的决定

- 编号：保留三位流水，改为**支持手填 001~999**；系列/类型/来源仍为下拉选择；重复时提示“编号已被××产品占用”。
- 首页：取消首批筛选，首页“产品一览”展示全部已发布产品；统一文案与空态。
- 改号：新建保存前增加确认卡；**未发布草稿**可返回修改配置项并重算编号与型号；已发布产品仍走下架流程，不提供直接改号。
- 数据：只改机制，不删除、不改写任何现有产品数据；由用户在后台逐条操作。

## 三、实施范围

### 1. 编号手填（三位）

- `contracts/domain.schema.json`
  - `CreateProduct` 新增可选 `sequence`：integer，1~999。省略时保持现有自动分配行为，兼容既有脚本与测试。
  - 新增 `$defs/RenumberProduct`：`expectedDraftVersion`、`categoryId`、`productType`、`ownership`、`sequence`、`reason`（均必填）。
- `contracts/api-contract.yaml`、`contracts/api-inventory.json`、`contracts/CHANGES.md`
  - 记录 `sequence`；新增 `POST /api/v1/admin/products/{id}/renumber`（仅 ADMIN）。
- `services/domain/src/engine.ts`
  - `create()`：有 `sequence` 按手填编号创建；无 `sequence` 时从计数器起寻找第一个未占用编号（最多到 999）。
  - 冲突返回 409 `CODE_CONFLICT`，消息含被占用编号与占用产品名（引擎内能查到时；生产路径由 `domain-backend` 复核）。
- `services/api/src/domain-backend.ts`
  - 创建前用 `tx.get("products", 目标编号)` 做权威占用检查，并读取对方草稿名生成提示。
  - 计数器保存为 `max(当前, sequence + 1)`，避免手填小号后自动分配撞号。
- `apps/admin/src/components/ProductWizard.vue`
  - 新增三位流水输入（数字，001~999）、实时编号预览、格式校验。
  - 提交前弹确认卡：产品名 / 编号 / 型号 / 系列 / 类型 / 来源；确认后才调用创建。
  - 服务端返回编号占用错误时原样展示在表单内。

### 2. 首页“产品一览”展示全部已发布

- `apps/portal/app/page.tsx`：`featured` 改为全部已发布产品（保持服务端发布时间倒序）；标题“首批产品”→“产品一览”；仅 0 款时显示空态“暂无已发布产品”。
- `apps/mobile/src/components/CatalogView.vue`：首页不再按 `pilotOrder` 过滤与截断，直接展示接口返回的全部已发布产品；空态文案区分首页/系列/搜索。
- `apps/portal/components/catalog.tsx`：选中系列且为 0 款时显示“该系列暂无产品”。
- 不删除 `pilotOrder` 字段与种子数据，仅停止在首页使用；“点系列卡片进入该系列列表”沿用现有 `choose()` 逻辑，回归验证。

### 3. 未发布草稿改号

- `services/api/src/repository.ts` + `services/api/src/mysql-repository.ts`
  - `Transaction` 增加 `delete(collection, id)`；MySQL 实现为参数化 `DELETE`。同步更新测试用内存 Repository 替身。
- `services/domain/src/engine.ts`
  - 新增 `renumber()`：仅允许 `DRAFT` 且 `releaseSequence === 0`、无 `lastReleaseId`、未删除、草稿版本匹配；按新配置项重算编号，更新草稿中的 `categoryId/productType/ownership`，`draftVersion+1`，写入 `RENUMBER_PRODUCT` 审计（原因含“旧编号 → 新编号”）。
- `services/api/src/domain-backend.ts`
  - `command()` 新增 `renumber`：事务内迁移 `products/drafts/history` 到新编号，删除旧文档；更新 `control/public-<uuid>`、`model-<hash>`、`code-<前缀>`；调整 `catalog.references` 旧/新分类计数；同步草稿引用到的 `assets` 文档的 `productId`。
  - 新编号被占用时返回 409，消息含占用产品名。
- `services/domain/src/http.ts`、`services/domain/src/backend.ts`、`packages/api-client/src/index.ts`
  - 新增路由与客户端方法 `renumber(productId, body, key)`。
- `apps/admin/src/components/ProductEditor.vue`
  - 未发布草稿展示“编号与配置”区（系列/类型/来源/三位流水/原因），先保存脏数据再改号。
  - 点击“修改编号”弹确认卡（旧编号 → 新编号、产品名、型号），成功后刷新并切换到新编号。
  - 已发布/曾发布产品该区域只读，仍使用现有下架流程。

### 4. 明确不在本轮范围

- 已发布产品“作废旧编号 + 新建 + 留痕”自动流程。
- 28 款对照表批量改号、测试数据删除/改写、任何数据库迁移脚本。
- 取消 `pilotOrder` 字段或修改种子数据。

## 四、验证计划

1. `pnpm generate && pnpm check:generated`
2. `pnpm test`（新增/更新：手填编号创建、自动分配跳号、重复编号 409、草稿改号成功、已发布拒绝改号、改号冲突、Repository delete）
3. `pnpm check`（根 tsc + portal/admin/mobile 类型检查）
4. `pnpm build:portal && pnpm build:admin && pnpm build:h5 && pnpm build:mp-weixin`
5. 本机浏览器回归：
   - 首页系列数量与下方产品列表一致，已发布产品可见；
   - 系列卡片进入对应系列列表；
   - 新建产品手填编号 + 确认卡 + 重复编号提示；
   - 草稿改号后编号、系列、列表同步更新，审计可查。
6. 记录实际命令与结果到 `implementation-reports/`，不把构建成功当作业务验收通过。

## 五、风险与回滚

- 编号即主键：改号必须单事务完成，任何一步失败整体回滚；仅限无发布快照的草稿。
- 公开链接使用 UUID `publicId`，改号不影响对外访问。
- 旧编号保留在审计事件中可追溯；不物理删除产品内容。
- 回滚方式：按本轮文件清单回退代码；本轮不写数据迁移，无需数据回滚。
