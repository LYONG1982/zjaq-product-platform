# 第三轮反馈修复实施报告

日期：2026-11-09（Asia/Shanghai）
计划：`plans/active/2026-11-09-round05-code-and-list-corrections.md`

## 实施内容

1. **编号手填（三位）**
   - `CreateProduct` 新增可选 `sequence`（001~999）；后台新建表单增加流水输入、完整编号预览、保存前确认卡。
   - 服务端手填编号冲突返回 409 `CODE_CONFLICT`，消息包含占用编号与产品名。
   - 计数器保存为 `max(当前, sequence + 1)`；自动分配会跳过已占用编号。
2. **草稿改号**
   - 新增 `RenumberProduct` 与 `POST /api/v1/admin/products/{productId}/renumber`（CONTENT_MANAGER / ADMIN）。
   - 仅 `DRAFT` 可改号（含发布后恢复为草稿的产品）；事务内迁移产品、草稿、历史、公开 UUID 映射、型号映射、分类计数、计数器、该产品的全部发布快照 `productId` 与草稿引用的资产 `productId`，并写入 `RENUMBER_PRODUCT` 审计。
   - 编辑页新增“编号与配置”区与确认卡；已发布/已下架产品不提供入口。
   - `Repository.Transaction` 增加 `delete`，MySQL 与内存测试替身同步实现。
3. **首页列表口径**
   - PC 首页与小程序首页不再按 `pilotOrder` 过滤，展示已发布产品；标题统一“产品一览”。
   - 首页最多展示 3 条（PC 与 H5/小程序一致），按现有“最新发布优先”顺序截取；“查看全部/浏览全部”入口保留。
   - 空态：首页“暂无已发布产品”，系列页“该系列暂无产品”，搜索“没有找到相关内容”。
   - `pilotOrder` 字段和种子数据未修改。

## 实际命令与结果

| 命令 | 结果 |
| --- | --- |
| `corepack pnpm generate` | 通过，生成类型已更新 |
| `node_modules/.bin/tsc -p tsconfig.json` | 通过 |
| `corepack pnpm --filter @zj/portal check` | 通过 |
| `corepack pnpm --filter @zj/admin check` | 通过 |
| `corepack pnpm --filter @zj/mobile check` | 通过 |
| `corepack pnpm test` | 89 项中 84 通过、4 失败、1 跳过 |
| `node --import tsx --test tests/unit/workflow.test.ts` | 8 项全部通过（含新增手填编号、改号、冲突、已发布拒绝） |
| `node --import tsx --test tests/unit/product-removal.test.ts` | 4 项全部通过（含新增事务迁移、回滚、公开 UUID/型号/计数器索引验证） |
| `node --import tsx --test tests/unit/contracts.test.ts tests/unit/api.test.ts tests/unit/seed.test.ts` | 15 项全部通过 |
| `node scripts/sync-preview-assets.mjs && corepack pnpm --filter @zj/portal build` | 通过 |
| `corepack pnpm --filter @zj/admin build` | 通过 |
| `corepack pnpm --filter @zj/mobile build:h5` | 通过 |
| `corepack pnpm --filter @zj/mobile build:mp-weixin` | 通过 |
| 浏览器回归 H5 `http://127.0.0.1:3202/` | 通过：显示“产品一览”和已发布产品卡片，无“暂无已发布产品” |

`pnpm test` 的 4 项失败均为本机环境限制，与本次改动无关：

- `backup-objects`：Windows 符号链接 `EPERM`。
- `upload-video`：缺少 `unzip` 命令。
- `second-test-iteration` / `video-errors`：测试进程未找到 FFmpeg，返回 `VIDEO_PROBE_UNAVAILABLE`。

## 限制与未执行项

- 未修改、删除或批量改写任何现有产品数据；28 款对照表改号由用户在后台操作。
- PC 门户全部读取走销售身份，缺少本地 SALES 凭据，未做 PC 首页浏览器回归；H5 公共端已验证。
- 管理后台改号界面未做浏览器点击回归（需要管理员账号）；接口行为由单元测试覆盖。
- 已发布产品“作废旧编号 + 新建 + 留痕”不在本轮范围。

## 补充：已下架产品恢复为草稿（同日追加）

- 新增 `RestoreDraft` 契约与 `POST /api/v1/admin/products/{productId}/restore-draft`（CONTENT_MANAGER / ADMIN）。
- 仅 `OFFLINE` 可恢复为 `DRAFT`；保留编号、公开 UUID、发布快照、`releaseSequence`、`lastPublishedDraftVersion` 与草稿内容，`publicationVersion + 1`，写入 `RESTORE_DRAFT` 审计。
- 后台编辑页对已下架产品显示“恢复为草稿”按钮与确认卡；恢复后公开端在看到重新发布前仍不展示该产品。
- 恢复为草稿本身不改变发布历史；移除规则随后单独放宽，见下文补充。

验证：`tsc`、`check:generated`、portal/admin/mobile 类型检查、admin 构建通过；`tests/unit/workflow.test.ts` 9 项全部通过（新增恢复草稿、版本冲突、重复调用拒绝、审计与再次发布）。本地 `demo-lan` 已重启，四入口就绪。

修复记录：首次上线后该接口在 MySQL 事务路径返回 500。原因是引擎幂等键写成 `.../restore-draft`，而事务层按 `.../restoreDraft` 读取幂等结果，取到 `undefined` 后写入失败。已统一为 `restoreDraft`，并补充 `tests/unit/product-removal.test.ts` 的持久化与幂等重放测试（5 项全部通过）。

## 补充：允许移除“曾发布但当前为草稿”的产品（同日追加）

- 移除条件由“从未发布”放宽为“当前状态为 DRAFT”；PUBLISHED 与 OFFLINE 仍不可直接移除，需先下架或恢复为草稿。
- 仍为软删除：编号、型号、公开 UUID、发布快照、历史资料和原文件全部保留；恢复后保持草稿状态，不自动上架。
- 后台列表“移除产品”按钮显示条件与确认文案同步调整。
- 验证：`tsc`、admin 类型检查与构建通过；`tests/unit/product-removal.test.ts` 6 项、`tests/unit/workflow.test.ts` 9 项全部通过（新增恢复草稿后可移除、恢复后仍为草稿、OFFLINE 拦截）。本地 `demo-lan` 已重启，四入口就绪。

## 补充：草稿改号不再限制“从未发布”（同日追加）

- “编号与配置”改为所有草稿可见（已删除除外）；已发布产品仍需先下架，已下架产品先恢复为草稿。
- 改号时同步迁移该产品全部发布快照的 `productId`，保证启动时的产品索引核对不会把旧快照判为孤儿；旧快照内容中的原编号不改写。
- 后台确认卡对已有发布记录的产品显示提示：改号只影响当前草稿与后续发布，旧快照保留原编号。
- 验证：`tsc`、admin 类型检查通过；`workflow` 16 项、`product-removal` 6 项全部通过（新增“恢复草稿后改号并重新发布”、快照 `productId` 迁移）。用真实数据副本验证了 6 个历史快照全部迁移到新编号。
