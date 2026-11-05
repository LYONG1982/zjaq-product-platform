# H5 底部联系二维码：实施与验证记录

日期：2026-11-05。用户在设计计划展示后回复“开始实施”。本轮完成代码与隔离本地验证，尚未提交、推送或部署到远端网站。

## 结果

管理员在“系统设置 → H5 底部联系方式”选择公众号和客服微信二维码，先看到未保存预览，再统一保存；H5 首页和产品详情在新打开或刷新后读取同一份最新配置。复用已有 API、权限、版本与审计，没有新增数据库字段或迁移。

- 系统设置顶部增加“ H5 底部联系方式 / 产品与资料分享”定位入口，保留原有分享设置。
- 图片可独立上传、替换、查看大图、移除和撤销；保留完整原图及留白。PNG/JPG 单张 ≤240 KiB，选图读取期间禁止保存，连续替换以最后一次选择为准。
- 后台提供 H5 展示预览；失败时保留原图、选图与电话。初次读取失败禁保存；版本冲突需显式重新读取。切换模块、退出和关闭页面保护未保存内容。
- H5 两张并排、一张居中；无二维码时收起图片行，所有联系方式为空时收起整个区域。区分未配置、图片加载失败、配置读取失败；失败可重试，刷新失败保留先前成功读取内容。
- H5 大图使用可关闭的原图弹窗，键盘可操作，弹窗居中；打开和关闭均保持原页面滚动位置。
- 共享图片校验错误文案按实际限制显示：联系方式 240 KiB、Banner 400 KiB；原限制不变。
- H5 的原生 DOM 弹窗与键盘逻辑通过平台条件编译隔离，小程序继续使用原有图片路径处理和展示方式。

## 代码位置

- 工作区：`/Users/lvyong198201/Documents/ChatGPT/中技-产品资料平台 2026/work/h5-footer-qr-20261105`
- 分支：`codex/h5-footer-qr-20261105`
- 基线：`df15a1c2a98abaf62a77a00807c37aab72dd4b6e`。实施前重新通过 GitHub 远端引用核对。
- 业务变更：`apps/admin/src/App.vue`、`apps/admin/src/components/SiteContactSettings.vue`、`apps/admin/src/style.css`、`apps/mobile/src/components/ContactBlock.vue`、`apps/mobile/src/styles/h5-v2.css`、`services/domain/src/site-banner.ts`。
- 验证变更：`tests/browser/site-contact.spec.ts`、`tests/unit/site-contact.test.ts`。

原主工作目录的旧分支及既有修改保留。此前二测工作区的 653 个受控文件 SHA-256 全部一致，且 git status 仍为空，证据为 `work/contact-qr/source-preservation.json`。本轮依赖复用既有安装，没有升级依赖或框架。

## 验证结果

| 检查 | 结果 | 证据 |
| --- | --- | --- |
| 单元/API 回归 | 9/9 通过：配置权限/版本/审计、PNG 真实读取、精确 240 KiB 与超限、Banner 400 KiB、原小程序图片缓存 | `unit.log` |
| 浏览器回归 | 9/9 独立用例通过：真实后台选图/保存→首页/详情、移除/撤销/隐藏、3 种窄屏、失败恢复、冲突、离开保护、连续选图竞态、前台错误重试 | `browser-final.log`、`browser-final-results.json` |
| 大图最终视觉与位置 | 320/390/430px 三项定向复测通过；属于前述用例复测，不重复计数 | `browser-layout.log`、`browser-layout-results.json` |
| 类型检查 | 根项目、后台、移动端通过 | `check-root.log`、`check-admin.log`、`check-mobile.log` |
| 构建 | 后台、H5、小程序通过；未执行 PC 生产构建，因为未改 PC 模块 | `build-admin.log`、`build-h5.log`、`build-mini.log` |
| 补丁格式 | `git diff --check` 通过 | 实际命令记录 |

证据文件均位于实施工作区 `work/contact-qr/`。已目视检查后台配置、单张二维码、320px 两列及大图。首轮回归暴露了 Uni-App 自定义按钮缺少显式可访问性角色，现已补齐键盘与按钮语义；同网址跳转测试改为真正刷新，以符合约定更新时机。目视检查发现弹窗位置问题后，补齐居中与打开时的背景滚动保持，并定向复测通过。

截图：

- [后台配置与手机效果预览](../work/contact-qr/admin-configured.png)
- [H5 320px 两张二维码](../work/contact-qr/h5-contact-320.png)
- [H5 390px 两张二维码](../work/contact-qr/h5-contact-390.png)
- [H5 单张居中](../work/contact-qr/h5-single.png)
- [H5 大图弹窗](../work/contact-qr/h5-large-image.png)

这些截图使用 `example.invalid` 保留域的虚构测试二维码和 `400-000-0000` 测试电话，不代表真实公众号、客服或电话。浏览器验收验证上传与展示，没有宣称真实微信扫码识别通过。

## 实际命令与本地环境

代码在独立 worktree 中实施，分支基于上述提交创建。运行 Node v22.22.1，构建复用当前锁定依赖。

```sh
# 实施工作区根目录
node --import tsx --test tests/unit/site-contact.test.ts tests/unit/site-banner.test.ts tests/unit/site-images.test.ts
node node_modules/typescript/bin/tsc -p tsconfig.json
node --import tsx work/contact-qr/api.ts
node scripts/preview-static.mjs work/contact-qr/admin 3421
node scripts/preview-static.mjs work/contact-qr/h5 3422

# apps/admin
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
VITE_API_BASE_URL=http://127.0.0.1:3423/api/v1 VITE_MOCK_TOKEN=local-admin node node_modules/vite/bin/vite.js build --outDir ../../work/contact-qr/admin

# apps/mobile
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
VITE_API_BASE_URL=http://127.0.0.1:3423/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5 --outDir ../../work/contact-qr/h5
VITE_API_BASE_URL=http://127.0.0.1:3423/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin --outDir ../../work/contact-qr/mini

# 根目录浏览器验收：显式设置下述隔离目标环境变量后运行
node node_modules/@playwright/test/cli.js test tests/browser/site-contact.spec.ts --reporter=list,json --output work/contact-qr/browser-final-artifacts
# 视觉修正后的定向复测
node node_modules/@playwright/test/cli.js test tests/browser/site-contact.spec.ts --grep 'H5 QR layout' --reporter=list,json --output work/contact-qr/browser-layout-artifacts
git diff --check
```

浏览器环境变量：

- `TEST_API_URL=http://127.0.0.1:3423`
- `TEST_ADMIN_URL=http://127.0.0.1:3421`
- `TEST_H5_URL=http://127.0.0.1:3422`
- `CONTACT_QR_TEST_SESSION=175dd8ab-e4a9-4d83-be99-b0f7e55c754d`（本次新建 Mock 会话；重启新建验证服务时必须使用新会话值，不能照抄旧值。）
- `CHROMIUM_PATH=/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`
- `PLAYWRIGHT_JSON_OUTPUT_NAME` 分别指定上述 JSON 报告。

测试每轮核验回环地址、Mock 提供方及显式会话标识，才允许写配置；每个用例恢复本次临时环境原配置。测试通过真实上传接口上传虚构 PDF 并创建测试产品，用于验证详情页。该数据只在独立 3423 会话中，未修改原 UAT 或线上配置。

Vite 提示未来版本的配置加载方式兼容建议及独立输出目录告警，构建正常完成；本轮没有为消除告警升级依赖或改动构建约定。

## 交付边界

本地验证包含管理员上传流程及 H5 浏览器展示，不能等同于 Windows 访问远端网站验收。真实服务器、CloudBase 持久化、部署后配置保留、Windows 浏览器线上操作、微信 iOS/Android 长按识别及扫码仍需真实目标和独立验证。

本轮没有推送 GitHub、上线部署、改域名或替换线上二维码，没有处理此前远端视频 `ffprobe` 故障。此前视频修复计划保留待确认状态。若回退，只撤销本轮代码增量，不清空已保存的联系方式或回滚业务数据库。
