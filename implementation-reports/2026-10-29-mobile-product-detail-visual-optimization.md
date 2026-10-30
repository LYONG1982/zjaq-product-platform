# 详情视觉、四系列图标及 H5 品牌实施与验证报告

> 归档说明（2026-10-30）：本文件保留该轮实施与验证状态。最新 H5 已取消 LOGO；当前入口为后台 3301、销售 PC 3300、H5 3302。销售 PC 已改为本地开发验证模式并实测模拟登录及产品目录 HTTP 200。GitHub 交付与最新边界见 [源码交付记录](2026-10-30-source-delivery.md) 和 [用户旅程 HTML 报告](2026-10-30-user-journey-and-features.html)。本机绝对路径与会话细节已脱敏。

日期：2026-10-29（Asia/Shanghai）
状态：已实施、代码审核及本地自动验证通过，待用户 UAT；未提交、未推送、未部署。
分支：`codex/mobile-detail-visual-20261029`；基线：`838e8949d34584d4633309db60c30664120a49a0`。本报告只覆盖本轮三份已确认计划，不代表整个项目生产验收完成。

## 1. 本地验收入口

- 新版 H5：<http://127.0.0.1:3402/#/>。
- 新版产品列表：<http://127.0.0.1:3402/#/pages/products/index>。
- 新版详情样例：<http://127.0.0.1:3402/#/pages/detail/index?id=3339e006-26a7-40b1-a6d9-2ce8023211cf>。
- 旧版 H5 对照：<http://127.0.0.1:3302/#/>。原管理端 3301、销售 PC 3300、Mock API 3303 均保留。

新版独立构建在 `work/detail-visual/build/h5-uat`，读取原 3303 本地 Mock 会话。原 3302 使用的默认 H5 构建目录未覆盖。地址仅供本机使用，不是公网或微信真机入口。

## 2. 已实施范围

| 范围 | 结果与保留行为 |
| --- | --- |
| 产品详情 | 统一 Hero、标题、内容卡、资料卡和联系卡的间距、圆角、轻边框与文字层级；四系列原主题色、动态数据、章节条件、两个返回、四锚点、能力弹窗及资料预览保留。 |
| 易用性 | 关键按钮和能力标签至少 44px；保留摘要 16px、32px 首行缩进与原空格；长标题/型号换行；补充焦点、按压与减少动态效果适配。 |
| 联系方式 | 仅详情页局部样式覆盖，保留号码、占位、读取和原拨号事件；首页共享联系组件行为保持。 |
| 四系列图标 | 按用户文件名映射密鼎/miding、密翼/miyi、密塾/mishu、AI+/ai；H5/小程序、PC、后台 12 份 PNG 与原图逐字节一致。首页系列入口和产品系列占位统一；已上传专属封面继续优先，失败时回退，未知分类保留通用占位。 |
| H5 LOGO | 首页、产品、资料三个页面使用用户完整透明 LOGO，192×64px 等比显示；去掉独立“中技”方块与“中技安全产品平台”文字，保留图内中英文品牌及“本地演示”。小程序及 PC/后台 LOGO 不随此补充修改。 |

详情页和三个 Vue 组件的 script 与基线逐字节一致。详情 template 与基线一致；CatalogView 的结构变更仅涉及品牌区和系列入口。API、数据库、权限、产品编码、用户数据、种子、依赖、锁文件与部署配置未改。

## 3. 文件清单

- `apps/mobile/src/pages/detail/index.vue`：局部视觉样式。
- `apps/mobile/src/components/{CatalogView,ProductVisual}.vue`：H5 品牌与移动系列入口/占位表现。
- `apps/mobile/src/static/series/*.png`；`apps/mobile/src/static/h5/brand/zhongji-security-logo.png`：原始素材。
- `apps/portal/components/product-visual.tsx`、`apps/portal/app/{page.tsx,globals.css}`、`apps/portal/public/series/*.png`：销售 PC 系列入口、占位与局部样式。
- `apps/admin/src/components/ProductWizard.vue`、`apps/admin/src/style.css`、`apps/admin/public/series/*.png`：后台系列提示图标与局部样式。
- 新增 `tests/browser/{product-detail-visual,series-icon-assets,h5-branding}.spec.ts`。
- 现有 `tests/browser/series-icons.spec.ts` 仅将已替换图标的 SVG 后缀预期对齐 PNG，保留全部原行为与图片解码断言。

## 4. 实际验证结果

| 验证 | 结果 | 证据范围 |
| --- | --- | --- |
| `pnpm check` | 通过 | 生成物一致性、根 TypeScript、PC TypeScript、后台和移动端 Vue 类型检查。 |
| H5 构建 | 两套通过 | 测试 API 3323 和验收 API 3303 分别构建至独立目录。 |
| 小程序构建 | 通过 | 60 文件，共 1,766,508 字节，约 1.685 MiB 原始输出；不等于微信上传测量或真机通过。 |
| 后台构建 | 两套通过 | 独立测试和 UAT 目录。 |
| PC 生产构建 | 通过 | 在隔离源码快照内直接运行 Next CLI，避免重写主工作区生成物。 |
| 现有浏览器用例 | **53/53** | 最终组合源码执行，0 失败/跳过/重试异常。 |
| 旧用例移植等价断言 | **3/3** | 原 3 个 smoke 用例硬编码 3301/3302；为避免向用户 UAT 写数据，在隔离新端口执行相同断言。未把排除用例算作原样通过。 |
| 新增详情专项 | **7/7** | 四宽度长内容、主题、热区、四锚点、弹窗、图集实际预览、两个返回、电话点击/键盘目标、空态/错误重试/失败图片及首页联系组件兼容。 |
| 新增图标专项 | **8/8** | 12 文件哈希/IHDR、H5 四宽度系列导航、专属封面优先/失败回退/未知占位、PC 实际图片、后台切换四系列与取消零写。 |
| 新增 LOGO 专项 | **4/4** | 三页×四宽度、实际解码/哈希/比例、旧独立品牌移除、状态保留、搜索、Tab 与图集返回。 |
| 同数据前后截图 | **4/4 宽度** | 每页 28 个详情文本节点逐字一致；375/390/414/430px 无横向溢出、无页面异常，请求仅 GET。 |
| 独立代码审核 | 无未关闭阻断项 | 源码哈希固定，Vue script 保持，素材一致及平台编译边界核查。 |
| `git diff --check` | 通过 | 无差异格式错误。 |

合计 **72 个 Playwright 测试通过，另有 3 项移植等价断言通过**；未把截图数量、构建或跳过项重复计入测试数。电话仅核对浏览器发出的 `tel:` 目标，没有实际拨号。

关键构建命令（均已实际执行）：

```sh
UNI_OUTPUT_DIR="$PWD/work/detail-visual/build/h5-tests" VITE_API_BASE_URL=http://127.0.0.1:3323/api/v1 pnpm --filter @zj/mobile build:h5
UNI_OUTPUT_DIR="$PWD/work/detail-visual/build/h5-uat" VITE_API_BASE_URL=http://127.0.0.1:3303/api/v1 pnpm --filter @zj/mobile build:h5
UNI_OUTPUT_DIR="$PWD/work/detail-visual/build/mp-weixin" VITE_API_BASE_URL=http://127.0.0.1:3323/api/v1 pnpm --filter @zj/mobile build:mp-weixin
```

后台使用 `vite build --outDir ../../work/detail-visual/build/admin-tests` 与 `admin-uat`，分别配置上述测试/UAT API。PC 在 `work/detail-visual/pc-source/apps/portal` 使用 `NEXT_DIST_DIR=.next-icons-build` 和 `node node_modules/next/dist/bin/next build`，保留当前依赖。

浏览器测试配置 Chrome 可执行文件，测试 URL 使用 PC 3320、后台 3401、H5 3400、API 3323；原 330X 不作为自动化写入环境。现有用例使用 `--grep-invert` 排除三条硬编码端口 smoke，其余 53 条全部执行。三个新文件分别完整执行。

测试结束已按进程身份核对停止上述临时回归服务，仅保留原 3300–3303 和新版 H5 3402。最终再查新版 HTTP 200、原 3303 同一 Mock session，原进程 PID 保持。

初次隔离端口触发既有 CORS 白名单拒绝，产生 9 失败、8 通过、39 未运行的中止记录；随后改用已允许的 3400/3401/3402，**未放宽 API 白名单**，最终 53 条全部重新通过。初次记录保存在 `work/detail-visual/regression-initial-origin-failure.json`。新测试早期选择器对 Uni 内层 image/首页规范路由的假设已修正，行为断言未移除。

## 5. 审核修复

1. 原过宽 `.media-list text` 规则会覆盖“产品展示”章节标题，已缩小为直接内容层；专项断言标题 20px 与主题颜色。
2. 图标测试不应绑定临时端口或把 3303 永久当作禁用端口，已改为可配置 URL、精确本机主机校验及只读 Mock health 核查。
3. H5 LOGO 放在当前 Uni CLI 支持的平台目录 `static/h5`，小程序编译主动排除该图片及 H5 品牌模板，保持原品牌区，避免增加未使用资源。

## 6. 原 UAT 保持情况与验收期间变更

独立只读核查确认：3303 原 Mock 会话持续，3300/3301/3302/3303 的原 PID 和启动时间相同；3 项站点配置哈希相同；旧 H5 228 文件逐项哈希相同，manifest 为 `d94764935519ff7f9205c2b82fd9c59a207c81a00ce8ac66ae0adb3432b8eb72`。

不能宣称所有产品数据哈希不变：基线 32 款，13:23 核查为 33 active + 1 removed，共 34 份可读取草稿。原 32 份中 31 份一致；审计记录显示 13:11 新增、13:13 安全移除原 ZJ-001、13:15 再新增。审计元信息本身不能绝对识别人或自动化来源；本轮保留全部观察到的新增/移除状态，没有恢复、清除或重置。

机器证据将此差异保留为 false，未篡改为“全部数据不变”。所有自动化写操作使用另套 3323 会话；新增视觉/LOGO夹具请求仅 GET，后台图标取消用例零写。

## 7. 截图与可复核证据

| 对照 | 旧版 | 新版 |
| --- | --- | --- |
| 首页品牌/图标 390px | [旧首页](evidence/2026-10-29/detail-visual/before-home-390.png) | [新首页](evidence/2026-10-29/detail-visual/after-home-390.png) |
| 详情全页 390px | [旧详情](evidence/2026-10-29/detail-visual/before-390.png) | [新详情](evidence/2026-10-29/detail-visual/after-390.png) |
| 详情首屏 390px | [旧首屏](evidence/2026-10-29/detail-visual/before-390-viewport.png) | [新首屏](evidence/2026-10-29/detail-visual/after-390-viewport.png) |

其他宽度全页、新版产品页、PC 首页、后台系列提示及产品封面回退截图保存在同目录。390px 首页和详情已目视检查，完整 LOGO 无裁切、透明图标无黑底，原内容保持。

- [verification.json](evidence/2026-10-29/detail-visual/verification.json)：实际测试统计、用例名称、源码哈希、独立审核与 UAT 差异。
- [comparison.json](evidence/2026-10-29/detail-visual/comparison.json)：相同虚构设备响应、四宽度文本/截图哈希、溢出与 GET 记录。
- 原始本机测试 JSON：`work/detail-visual/{regression,visual,icon,branding}-browser-results.json`；移植断言：`portable-smoke-results.json`。

## 8. 明确限制与后续

- 用户手工 UAT 尚未完成；当前均是本机 Mock、浏览器及编译证据，不是真实云、微信真机、小程序送审或生产验收。
- 未提供 Figma Frame；没有宣称逐像素还原或实际读取 Figma。详情前后对照使用同一明确标识的虚构样例，不写入产品数据。
- 本轮未安装/升级依赖；既有依赖审计风险（此前 35 项，其中 7 high）不因视觉验证消失，未在本轮重新审计或处理。
- 最新提出的“上传资料旅程”与“操作记录视觉”是新范围，另写待确认计划：[上传资料](../plans/archive/2026-10-29-material-upload-journey.md)、[操作记录](../plans/archive/2026-10-29-audit-page-visual-optimization.md)，不计入本轮已完成结果。
- 依照用户约束，当前代码保留本地功能分支，未提交、未推送 GitHub、未连接真实云。后续发布须以用户 UAT 和后续明确指令为准。
