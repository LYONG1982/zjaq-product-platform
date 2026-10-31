# H5 V2 与后台多 Banner 实施报告

日期：2026-10-31（Asia/Shanghai）
确认依据：用户明确要求按全部已展示计划开始实施，并强调H5高度遵循Figma，保持功能/逻辑/交互。
状态：本地实施与约定验证完成；源码发布记录见2026-10-31-github-h5-v2-delivery.md；未部署。

## 实现结果

- H5首页、产品/系列列表、详情、资料中心、预览页按当前Figma V2转换为Uni-App/Vue布局。采用独立H5 CSS变量与平台条件编译，未引入新框架、依赖或重写数据层。
- 首页完整公司LOGO126×42；白色品牌卡改为用户附件Banner，1796×876完整等比显示；四系列卡片使用原始插画矢量和动态名称/数量；删除冗余系列标题。三项底栏图标文字居中，72px基准并考虑安全区。
- 产品卡基准180px、资料卡基准156px，长内容允许自然扩展；产品原图优先，原系列PNG作为既有兜底；四系列主题及图形来自Figma，接口正式分类身份/名称不改。
- 后台配置为固定默认首张＋最多5张自定义Banner。默认首张使用附件原图，不提供删除/清空/移位/失效操作；服务端同时拒绝绕过UI修改。后续自定义支持图片、链接、有效期、新增与删除、版本冲突与审计。H5首次从第1张显示，滑动/指示点切换，不叠加第二个Banner区域；固定1796:876展示画布，自定义图片等比容纳，切换时不推移搜索栏。
- 旧单图配置在读取时非破坏兼容为后续自定义项；旧PUT不删除默认页，也不会为兼容而静默丢弃其他自定义项。默认图通过受控API路径返回，后续上传仍400 KiB/张，Banner专用请求体上限3 MiB，其他接口上限不扩大。
- 默认原图1,593,894字节，不使用超过上传限制的base64写入。原图SHA-256：7900797454610182f6dbdbc5f7d9332dbb17c564e227a37fedd0868c92207359。
- 保留搜索/系列筛选、分页与查询滚动状态、详情锚点和能力说明弹窗、联系/反馈、PDF/图集/视频预览、版本校验和来源返回。补齐Uni H5自定义按钮键盘激活，避免显式键盘处理与统一处理重复触发。
- 小程序只做共享Banner列表消费和缓存兼容，不套用H5新视觉；定时失效/删除时清理原生自定义图片缓存，视频版本失败时停止轮询。

## Figma依据与边界

文件：https://www.figma.com/design/MkL5O8ZvONq4C4KANjtO5w

实际读取高保真get_design_context与截图：16:126、16:523、16:621、16:705、16:787、16:871、16:916、16:1136、16:1216。Figma生成代码仅作为设计尺寸/层级/资源依据，转换为既有Vue/Uni-App，未复制React/Tailwind工程。未把整页截图放进应用。

资源映射及截图位于 `evidence/2026-10-31/h5-v2-implementation/`。背景/插画来自用户原SVG；导航/搜索/主题纹样直接下载Figma矢量。原系列PNG和公司LOGO沿用已核准本地原图，移除了下载后重复的未使用资源。

本轮附件Banner按用户最新要求覆盖旧Figma白色品牌文案卡片。保留真实业务所需的详情锚点、能力弹窗、资料日期、实际图片和配置内容。动态内容不以固定高度裁切；Figma设计示例电话/示例数量未写死。

Figma使用Noto Sans SC，本机H5继续使用项目系统中文字体；验收关注尺寸、色彩、层级、间距与正常交互，不承诺跨操作系统字体逐像素一致。

## 本地验证环境

- H5：http://127.0.0.1:3302/#/
- 后台：http://127.0.0.1:3301/
- 隔离Mock API：http://127.0.0.1:3303/api/v1
- H5使用构建后的静态预览；后台使用开发服务。实际以服务进程存活为准。
- 开始前读取监听端口，以上为本轮独立创建的服务。测试数据只写入本轮3303会话，未清理/重置用户原有UAT、真实数据库或云资源。
- 使用 `DEMO_API_BASE=http://127.0.0.1:3303/api/v1 pnpm demo:seed` 和 `pnpm demo:ai` 初始化隔离验证数据。保留原27主档为草稿；当前3款发布样例没有pilotOrder推荐配置，首页因此显示推荐空态，产品一览与资料中心正常展示。没有为了仿照Figma填充示意强制推荐或发布内容。
- Banner联动测试结束后恢复默认首张；未遗留定时自定义运营页。

## 实际执行命令及结果

| 命令 | 结果与范围 |
| --- | --- |
| `pnpm check` | 退出0；生成一致性、根TypeScript、PC/后台/H5类型检查通过 |
| `pnpm test:contracts` | 退出0；11项合同/API检查通过 |
| `node --import tsx --test tests/unit/site-banner.test.ts tests/unit/cloud-adapter.test.ts tests/unit/site-images.test.ts` | 退出0；15项通过，CloudBase仅内存事务/私有对象替身 |
| `VITE_API_BASE_URL=http://127.0.0.1:3303/api/v1 pnpm build:h5` | 退出0；H5构建与PDF静态资源同步通过 |
| `pnpm build:admin` | 退出0；后台生产构建通过 |
| `pnpm build:mp-weixin` | 退出0；小程序编译通过，不代表微信真机 |
| `pnpm exec playwright test tests/browser/h5-branding.spec.ts tests/browser/h5-v2-regression.spec.ts tests/browser/product-detail-visual.spec.ts tests/browser/site-banner.spec.ts tests/browser/series-icon-assets.spec.ts --grep 'H5|detail|V2|protected default|scheduled custom|all twelve' --max-failures=2` | 退出0；22项全部通过，0失败/0跳过/0不稳定；覆盖320/375/390/414/430px、资源几何与真实交互 |
| `pnpm exec playwright test tests/browser/feedback.spec.ts --reporter=line` | 退出0；1项通过，提交后仅管理员可读，HTML输入按普通文字显示 |
| `git diff --check` | 退出0 |

浏览器覆盖：LOGO原图/尺寸、SVG解码与系列跳转、产品实图优先/加载失败兜底、搜索/Tab/返回状态、长内容与触控目标、详情锚点/能力弹窗/电话边界、错误重试/无内容、实际PDF翻页/输入页码/缩放、图集翻页、视频播放与版本失效、反馈空内容校验、后台Banner新增/删除/链接/有效期/默认首张保留。

过程中的旧版外观断言、Uni组件包装节点选择器已经随V2更新；截图复核发现的旧产品卡样式覆盖、资料卡额外高度已经修复，并加入17px标题、54px右侧图标、180/156px卡片几何断言。具体最终结果见同目录verification-summary.json，不把早期失败轮次当完成验收。

## 既有修改保护

实施前的原始差异、文件清单及回退副本仅保存在本地，不随源码公开。对18项既有PC、后台向导、原系列PNG与旧测试差异/资源进行校验，均未被本轮覆盖；详情见baseline-preservation.json。未执行reset/clean，未提交或推送Git。

## 尚未验证/未执行

真实CloudBase连接、真实身份与数据迁移、云部署、正式产品内容、微信开发者工具预览/真机、手机网络与生产验收未执行。小程序编译和本地替身测试不能替代上述验收。本轮不是全部64项业务验收。

## 最终证据与当前入口

- 共23项浏览器检查通过（22项主回归＋1项反馈提交检查）；主回归结果已复制到 `evidence/2026-10-31/h5-v2-implementation/verification-summary.json`。
- 15项Banner/CloudBase替身/原生图片缓存单元测试，以及11项合同/API测试通过。
- 320/390实际页面截图：home、home-full、products、detail、materials、pdf各两张，均在上述证据目录。页面已目视核对；产品卡的图标位置/尺寸、文字字号、资料卡156px高度与四系列配色已修正到当前V2规范。
- 独立静态复核识别到的两项P3资源清理问题已处理：删除/过期Banner清原生slot缓存；视频版本失败停止轮询。
- 本轮使用独立的本地Mock验证会话。服务保留运行以供审阅，进程退出后Mock数据不保证保留。
- H5：[打开本地H5](http://127.0.0.1:3302/#/)；后台：[打开本地后台](http://127.0.0.1:3301/)。
