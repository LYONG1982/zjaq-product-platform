# H5 产品一览移除系列 Banner · 实施报告

日期：2026-10-31（Asia/Shanghai）。状态：已按用户“开始实施”的明确确认完成 Figma、代码及本地验证。未提交、推送或部署。

## 结果与入口

H5 产品一览中，密鼎、密翼、密塾、AI+以及未知分类搜索栏上方的系列 Banner 已移除；搜索栏和列表上移，不补出替代说明或保留空白占位。系列名称、数量、产品卡插画、搜索、空态、返回及详情旅程继续工作。

- 当前 UAT：[H5](http://127.0.0.1:3302/#/)；进入任意系列查看。
- [Figma 手机系列页](https://www.figma.com/design/MkL5O8ZvONq4C4KANjtO5w?node-id=52-297)；[Figma 宽屏系列页](https://www.figma.com/design/MkL5O8ZvONq4C4KANjtO5w?node-id=52-467)。
- [最终390px实际截图](evidence/2026-10-31/h5-list-no-banner/uat-list-390.png)；[最终1440px实际截图](evidence/2026-10-31/h5-list-no-banner/uat-list-1440.png)。

首页品牌 Banner、首页系列入口、产品卡插画、详情 SeriesHero 保留。PC、后台、小程序页面、API及数据未作本轮代码变更。

## Figma 先行与代码映射

使用既有文件 MkL5O8ZvONq4C4KANjtO5w、V3页面48:2、session d79b9022-bea3-43da-94e3-010e258df5c1。已核对本地没有 Code Connect 文件，库检索没有适用的完整系列列表组件；沿用原搜索、产品卡和导航实例，不导入无关库。

先删除四手机画板52:297/52:340/52:383/52:424的Banner实例52:300/52:343/52:386/52:427及宽屏52:467内的52:473，核对原生节点、字体与截图后才修改代码。五个画板系列Hero数均为0，剩余字体均Noto Sans SC，非整页栅格化。

手机搜索/系列标题/产品卡或空态的y分别为76/156/208，底栏y=772保持。宽屏内容容器仍为x144/y76/宽1152；初次移除后自动收拢高342，最终新增标题与列表Auto Layout分组87:429，搜索后间距28、标题后间距22，总高352，对齐相同的y位置。

代码仅涉及：

- `apps/mobile/src/components/CatalogView.vue`：移除H5列表的SeriesHero引用及调用，显式约束说明文案只显示于全部产品和资料中心；selectedCategory继续提供名称/数量。
- `apps/mobile/src/styles/h5-v2.css`：移除列表Hero占位间距，为选中系列搜索栏保留30px标题间距；提高系列标题间距规则的选择器优先级，使28/22px规则实际生效。
- 两个既有浏览器测试文件：替换失效Hero断言，增加四屏宽无Banner搜索/返回与只读UAT详情往返验证。

共享SeriesHero.vue、h5-v3.css、PC、详情、后台及API的原有源码摘要均与实施前一致。原工作区差异已备份于ignored目录work/round04/h5-list-no-banner/baseline；726份已有文件摘要核对仅上述四代码/测试文件和两设计记录发生本轮预期变化，无额外变化。

## 实际命令与验证

工作目录为项目根目录。所有自动化均指向本地服务；展示用替身不写入UAT，实际UAT验证还拦截并拒绝所有非GET/HEAD/OPTIONS请求，最终写请求尝试为0。

| 命令/检查 | 结果 |
| --- | --- |
| `TEST_H5_URL=http://127.0.0.1:3302 TEST_API_URL=http://127.0.0.1:3303 PLAYWRIGHT_JSON_OUTPUT_FILE=work/round04/h5-list-no-banner/browser-results.json pnpm exec playwright test tests/browser/series-visual-v3.spec.ts tests/browser/series-icon-assets.spec.ts --output=work/round04/h5-list-no-banner/browser-artifacts` | 17通过，0失败/跳过；覆盖四系列、未知、长文、业务封面与背景、搜索/清空/全部产品返回、PC图像及后台取消无写入 |
| 相同TEST变量，`PLAYWRIGHT_JSON_OUTPUT_FILE=work/round04/h5-list-no-banner/live-results.json pnpm exec playwright test tests/browser/series-visual-v3.spec.ts --grep 'H5 live series list' --output=work/round04/h5-list-no-banner/live-artifacts` | 新增1项通过：320/390/430/1440实际UAT搜索、详情Banner保留、返回后查询/系列状态保留，以及密塾零产品空态 |
| 相同TEST变量，`PLAYWRIGHT_JSON_OUTPUT_FILE=work/round04/h5-list-no-banner/browser-final-results.json pnpm exec playwright test tests/browser/series-visual-v3.spec.ts --grep 'H5 series lists\|H5 live series list' --output=work/round04/h5-list-no-banner/final-artifacts` | 间距修正后定向复核5项全部通过；断言搜索/标题/产品卡y=76/156/208。累计为18个不同检查，复测不重复计数 |
| `pnpm --filter @zj/mobile check` | 退出0 |
| `UNI_OUTPUT_DIR="$PWD/work/round04/h5-list-no-banner/build/h5" VITE_API_BASE_URL=http://127.0.0.1:3303/api/v1 pnpm build:h5` | 首次和最终CSS修正后的构建均退出0；PDF资源同步完成 |
| `UNI_OUTPUT_DIR="$PWD/work/round04/h5-list-no-banner/build/mp-weixin" VITE_API_BASE_URL=http://127.0.0.1:3303/api/v1 pnpm build:mp-weixin` | 退出0；条件编译通过，H5素材目录按既有配置排除 |
| `git diff --check` | 退出0 |
| 只读读取API health、全部产品与32份草稿并计算摘要 | 会话、数量和完整摘要前后一致 |

终端输出分别重定向到work/round04/h5-list-no-banner内相应log。选定日志、JSON结果、Figma结构及截图已保存在[evidence目录](evidence/2026-10-31/h5-list-no-banner)。最终H5构建日志另为build-h5-final.log。

Figma补充核对时，尝试直接移动宽屏搜索实例内部按钮，工具拒绝不允许覆盖的relative-transform并回滚该次调用；已只读确认未残留修改，随后仅对页面外层做Auto Layout分组并成功验证。既有搜索组件内部宽屏约束和字体渲染差异不属于本轮重做范围；对照通过范围为Banner删除、内容位置与既有业务旅程。

## UAT 数据保护与边界

API3303会话前后均为c28e1b32-2513-4d85-8288-d31a9958d019；32条产品及其草稿摘要前后均为4b1b845895801281c5581907e2e0c061b2b49b93c34dd73804b70138241e0ae0。详见[保留核验](evidence/2026-10-31/h5-list-no-banner/uat-preservation.json)。未重启API、reset、重灌样例或写入自动化测试产品；当前H5开发服务通过热更新生效。

仅为本机浏览器和Mock验证。没有连接真实CloudBase、发布真实内容、微信真机验收、推送或部署；小程序只完成编译，不代表真机验收。未重跑全项目64项业务验收及无关全套测试。


公开源码交付说明（2026-11-01）：仅随附选定实际截图和脱敏摘要；完整本地日志、运行会话、浏览器原始结果与临时工作文件未上传。源码整合验证和最终推送结果另见2026-11-01-github-h5-two-rounds-delivery.md。
