# 二次测试反馈迭代实施记录

日期：2026-11-05。状态：本轮代码实施与隔离本地验证完成；尚未提交、推送或部署，未进行用户现场验收。

补充复核：最初交付的 #07/#11 仅 H5 验证完整，小程序存在样式覆盖与首页品牌栏遗漏。现已按用户指示补齐，并完成 #17 超过 6 个系列专项验证；实际增量和保护证据见 [小程序补齐报告](./2026-11-05-mini-program-followup.md)，其余验收项见 [清单](./2026-11-05-remaining-acceptance-checklist.md)。本报告中原轮“完成”不表示真实环境或微信实机验收完成。

## 基线与原 UAT 保护

- 本轮分支：`codex/second-test-feedback-20261105`，从 GitHub main `4346746d715b311ae568a1fc255cf942c364762d` 建立。实施前以 `git ls-remote` 核对主分支。
- 实施目录：`/Users/lvyong198201/.codex/worktrees/second-test-feedback-20261105/中技-产品资料平台 2026`。
- 原本地 UAT：`/Users/lvyong198201/.codex/worktrees/github-h5-two-rounds-20261101/中技-产品资料平台 2026`。601 个受控文件 SHA-256 全部与实施前一致；原未跟踪的 `apps/portal/AGENTS.md` 保留。没有在原目录运行构建、seed/reset 或重启服务。
- 原用户工作目录的旧脏分支未作为实施基线，仅同步本轮计划归档与设计证据；未改其中应用代码。
- 隐藏技术参数、边界与旧资料类型的界面入口，保留 technical、boundaries、kind、原件关联、旧媒体 role、历史资料与发布快照；契约没有删除既有字段。分享设置使用独立配置，公开资料响应只新增可选权限提示字段。

## 已完成的功能与样式

| 对应需求 | 实施结果 |
| --- | --- |
| 后台侧栏与按钮 | 208px 深蓝到浅蓝渐变侧栏，菜单可滚动；底部 44px 退出按钮距底 24px。主、次、文字按钮采用蓝色体系，保留危险操作红色、禁用与键盘焦点状态。列表状态/记录范围/新增/已移除四控件同高 44px、上下对齐；原有筛选与七列表格保留。 |
| #01、#02 上传 | 新文档预览和可选原件仅 PDF；视频独立入口，保持 MP4/MOV H.264、WebM VP8/VP9 兼容与 500 MiB 限制。保留先上传后填写、进度、校验、失败重试、暂存替换及默认 V01.0。视频错误区分服务缺失、超时、损坏、容器/编码问题，并显示可复制的问题详情。 |
| #03、#22 图片 | 多选后立即缩略显示并按选择顺序上传；最多 6 张、每张 2,000,000 字节、JPG/PNG/WebP。独立重试、去重及移除；失败未处理时阻止保存。旧超过六张的记录可保留或减少。阅读端按原比例竖排，全屏查看后恢复位置。 |
| #04、#05 字段兼容 | 编辑和阅读端隐藏参数与边界，取消相关发布必填条件；新资料类型按分类推导，历史 kind 不重写。旧 Office 原件和图集继续按既有权限读取。 |
| #06 名称 | 输入法组合完成或粘贴后规范中英文括号；前后端按 15 个全角显示单位检查，新建/编辑显示计数。旧长标题不因修改其他字段而被截断或阻止保存；列表通过两行 CSS 省略，详情保留完整名称。 |
| #07、#08、#11 H5 | 五个系列 Tab 常驻、同页切换，空态/失败/快速请求切换仍保留导航，详情返回保留系列上下文；正文首行 2em、行高 1.8、段后 .75em。移除首页重复 Logo 栏，保留品牌 Banner 和 main 上已有 H5 更新。 |
| #12 返回 | 销售 PC 返回按钮、后台草稿预览“返回编辑”均为 144×44；保留后台 PC/移动宽度切换与发布入口。PC 返回 URL 保留关键词、系列、分页、属性和起止日期，仍限制本站合法页面。 |
| #13 分享 | 系统设置集中配置，ADMIN 维护且带版本冲突校验。二维码本地生成、黑白无 Logo，固定尺寸 256/512/1024，目标使用公开 UUID；产品/资料可预览、复制、下载。每次生成先验证当前发布版本，权限继续在访问端校验；技术资料要求销售 PC 登录。 |
| #17、#20 列表 | 系列条不换行、横向滚动，选中项滚入视区。仅从未发布的 DRAFT 可安全移除；原因、二次确认、版本/权限/幂等性和审计保留；恢复不自动发布。既有历史移除记录仍可受控恢复。 |
| #09 数据保留 | 原 UAT 指纹保护；CloudBackend 分享配置持久化、版本冲突、重建读取以本地 Repository 替身验证。未连接真实云，也未把本地结果等同于连续两次真实部署不丢数据。 |
| 后置事项 | #15 系列主题色、#21 销售 PC 整体换肤、#23 搜索框裁切专项继续后置。 |

## 验证结果与命令

所有命令均在本轮隔离目录执行，浏览器/API 仅访问 127.0.0.1 的 3400–3403。浏览器使用 `/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`。

| 检查 | 结果 | 证据（本目录上一级的 work/second-test-20261105） |
| --- | --- | --- |
| 生成物一致性 | 通过 | `node --import tsx scripts/generate.ts --check` |
| 类型检查 | 根项目、后台、H5/小程序、PC 均通过 | `check-root.log`、`check-admin.log`、`check-mobile.log`、`check-portal.log` |
| 服务/契约/领域测试 | 87/87 通过，包含既有上传、身份、权限、事务、备份、版本与新规则 | `unit-complete.log` |
| 主要浏览器回归 | 21/21 通过 | `browser-complete.log` |
| 补充核心流程 | 5 个独立用例均通过；旧脚本选择器校正后定向复测通过 | `browser-workflow.log`、`browser-workflow-final.log`、`browser-final-recheck.log` |
| 最终新增界面复核 | 标题计数、144×44 返回、分享设置、图片与导航复核通过 | `browser-workflow-final.log` 中通过项及 `browser-final-recheck.log` |
| 构建 | admin、portal、h5、mp-weixin 均通过 | 四份 `build-*-final.log` |
| 二维码 | 512×512、不透明纯黑白像素；macOS Vision 解码与生成目标逐字一致 | `qr-fixture.png`、`qr-target.txt`、`qr-decode.log` |
| 原 UAT 与服务 | 601 文件无变化；3400–3403 HTTP 均正常 | `original-uat-verification.json`、`final-local-health.json` |
| 补丁格式 | `git diff --check` 通过 | 最终命令记录 |

浏览器共覆盖 26 个不同用例（不是在此宣称原 64 项业务验收全部通过）。包括：输入法、未保存退出保护、重新登录、PDF 可选原件、网络重试不重复 PUT、终态拒绝后创建新任务、旧 PDF 替换/取消/版本递增、历史资料预览、发布和不可变快照、下架、草稿冲突比较、删除冲突/留档/恢复、三端视频播放及销售下载、500 MiB 成功/501 MiB 上传前拦截、图片顺序与全屏返回、H5 请求竞态、设置冲突、二维码下载、联系方式/统计/反馈原功能。旧全量视觉脚本及所有历史演示数据场景未整体重跑。

执行的主要命令：

```sh
node --import tsx scripts/generate.ts --check
node node_modules/typescript/bin/tsc -p tsconfig.json
node --import tsx --test tests/unit/*.test.ts
# apps/admin 与 apps/mobile 下：
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
# apps/portal 下：
node node_modules/typescript/bin/tsc --noEmit
# apps/admin 下：
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 VITE_MOCK_TOKEN=local-admin node node_modules/vite/bin/vite.js build
# apps/portal 下：
NEXT_DIST_DIR=.next-second-test-build PORTAL_API_BASE_URL=http://127.0.0.1:3403/api/v1 NEXT_PUBLIC_ENABLE_SALES_MOCK=true node node_modules/next/dist/bin/next build --webpack
# apps/mobile 下分别执行：
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin
# 根目录补齐已有 PDF 阅读资源：
node scripts/sync-preview-assets.mjs --h5
```

浏览器命令统一指定 `TEST_API_URL=http://127.0.0.1:3403`、`TEST_ADMIN_URL=http://127.0.0.1:3401`、`TEST_H5_URL=http://127.0.0.1:3402`、`TEST_PORTAL_URL=http://127.0.0.1:3400`、`CHROMIUM_PATH` 后执行 `node node_modules/@playwright/test/cli.js test`。主要文件为 second-test-iteration、material-upload-journey、upload-video、site-contact、analytics、feedback，补充 product-removal 和 workflow。analytics 另以 `TEST_ANALYTICS_PRODUCT=(演示)二测密鼎`、`TEST_ANALYTICS_MATERIAL=second-test-pdf`、`TEST_ANALYTICS_MATERIAL_NAME=虚构产品介绍 PDF` 指定本轮虚构数据。

初次核验发现并处理了：Uni 的 qrcode 传递依赖解析、图片队列并发、全屏关闭滚动恢复、构建 H5 的 PDF worker 资源同步，以及历史测试的旧按钮/页面选择器。历史 Office/图集测试改用明确的旧资产导入测试夹具；生产上传校验仍禁止新 Office/图集文档。没有为通过测试放开格式或权限。

## 当前可查看的本地环境

- 后台：http://127.0.0.1:3401 （最终构建静态预览）
- H5：http://127.0.0.1:3402 （最终构建静态预览）
- 销售 PC：http://127.0.0.1:3400 （Next 开发服务，显式本地销售模拟身份；生产构建另已通过）
- API：http://127.0.0.1:3403/health ，session `e83342ef-6252-41ee-ae9c-2bd201569ea3`，provider 为 Mock。

后台搜索“(演示)二测”可查看四款虚构样例：密鼎和 AI+ 已发布、密翼已下架、密塾为草稿。另有明确标注测试的自动回归记录；未写入真实产品参数。此 Mock 为内存数据，重启会重新初始化，不代表正式持久化。

分享设置在验证结束恢复为未配置状态。测试二维码只使用保留域 `https://uat.example.invalid`，不作为真实可访问地址。正式使用需另行登记同项目 HTTPS 地址到 `SHARE_ALLOWED_ORIGINS` 并由管理员保存配置。二维码不含令牌和内部产品编码；这不是微信小程序码。

新增依赖仅 `qrcode@1.5.4` 及其锁定的传递依赖，既有框架主版本保持。Next 自动生成的 next-env 引用已恢复基线内容；本地生成类型放在忽略的构建目录内。

## 交付边界

本轮尚未 Git 提交/推送、合并、部署、修改域名、连接或迁移真实 CloudBase、清理原业务数据。真实身份注销（尤其全设备令牌失效）、云存储与网关 500 MiB/Range、连续两次真实发布的数据指纹、iOS/Android 微信真机与扫码均待独立验收。小程序仅完成构建，不代表微信送审或实机通过。

设计依据为原 Figma 文件 https://www.figma.com/design/MkL5O8ZvONq4C4KANjtO5w 的二测页与蓝色按钮规范；设计评审、代码验证和用户验收分别记录。
