# GitHub源码交付：两轮H5调整

日期：2026-11-01（Asia/Shanghai）。用户明确授权把以下已确认并完成的修改更新到GitHub：产品一览搜索栏上方移除系列Banner；首页四系列名称字号增加10%。目标为LYONG1982/zjaq-product-platform的main，仅源码更新，不部署。

## 交付范围

- 列表：四系列及未知分类搜索栏上方均无系列Banner；搜索、标题和卡片依次上移，手机及宽屏布局对齐；首页品牌Banner与详情Banner继续保留。
- 首页名称：手机17.6px/26.4px行高，宽屏≥768为19.8px/29.7px行高，原字体、粗细、颜色、简介及数量不变。
- 远端基线031d4df仍为V2，缺少两轮改动依赖的H5 V3样式、插画层及配置。本次仅补齐已实施的H5依赖，共13个运行源码/素材文件，包括四张WebP、H5组件/样式及共享视觉配置导出。产品卡和详情的H5系列视觉依赖一并保持与本地验收版本一致。
- 相关三个浏览器测试文件、两份已完成计划、设计映射/基准、实施报告和选定截图/脱敏摘要随源码交付。PC测试段落保留远端版本，PC V3及其他后台工作未纳入。

## 隔离验证

交付副本基于最新origin/main建立；原开发工作区与330X用户UAT保持。隔离API3433、H5静态构建3400、后台3401仅使用独立虚构数据。

| 验证 | 实际结果 |
| --- | --- |
| H5 vue-tsc --noEmit | 退出0 |
| Uni-App H5生产构建及PDF静态资源同步 | 退出0 |
| series-visual-v3与series-icon-assets，排除未更改PC的运行场景 | 17通过，0失败；包含四屏宽无列表Banner、检索/返回、产品封面、未知分类及后台取消无写入 |
| h5-v2-regression中320/390px实际目录、PDF翻页/缩放/返回 | 2通过，0失败 |
| 四屏宽字号专项只读核验 | 320/390/430/1440下16组名称字号/行高及16次系列跳转通过，简介与数量样式对基线一致；写请求尝试0 |
| apps/portal、apps/admin、services、contracts及锁文件 | 117份现有文件逐字节与origin/main一致 |
| 原3303 UAT | 同一会话和32份产品/草稿摘要与上一轮验收一致；无重启、重置或重灌样例 |
| 提交增量文件边界、隐私路径与高置信度凭据扫描 | 见交付摘要；只检查本次候选增量，不代表全历史审计 |

实际命令通过已安装固定版本CLI直接运行：移动目录`node node_modules/vue-tsc/bin/vue-tsc.js --noEmit`、`node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5`，根目录`node scripts/sync-preview-assets.mjs --h5`及`node node_modules/@playwright/test/cli.js test ...`；浏览器显式指定TEST_H5_URL为3400、TEST_API_URL为3433、TEST_ADMIN_URL为3401。构建与测试输出位于ignored的work/github-h5-two-rounds，不随源码提交。

依赖复用说明：初次pnpm命令检测到隔离目录需要重新安装，已取消其重装请求；没有升级包或修改锁文件，改用已安装工具及指向隔离工作区自身的workspace链接。未宣称完成全新安装验证。PC临时启动因Turbopack对外部依赖链接的根目录约束失败，已停止且撤销该启动生成的文件；本次PC保证依据为117文件字节核对，未把PC运行检查算入19项浏览器结果。

## 公开内容与限制

本次仓库已核对为PUBLIC，使用明确白名单提交；环境文件、依赖、构建、运行数据、临时回退差异、机器路径、浏览器原始结果及Figma临时资源URL均排除。选定图像仅来自已批准本地虚构验收内容。具体相对路径摘要见[evidence](evidence/2026-11-01/github-h5-two-rounds/verification.json)。

字体轮次的Figma字号读回已通过，设计预览服务超时的既有限制保留在原报告中。源码更新不等于真实云部署、微信真机/送审或完整64项业务验收；本次未执行这些操作。推送采用普通快进，不重写远端历史。
