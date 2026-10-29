# 依赖安全与开发服务可达性审核（2026-10-29）

## 结论和证据边界

本轮 `pnpm audit --prod --json` 的基线结果为 **35 条：7 high、20 moderate、8 low、0 critical**。这些告警没有被清零，不能标成全部修复或误报。本次未安装依赖、未改锁文件、未升级主版本；新增开发服务前置防护用于缩小现有 Vite 工具链的暴露面。

`--prod` 会沿 Uni-App 的 production dependencies 走入其构建工具，不等于 35 项全部出现在对外 API 或静态 H5 中。反过来，开发依赖也不是自动安全。官方明确说明某些 Vite / esbuild 问题在只监听 localhost 时仍可能由恶意网页触发，故不能以本地绑定为“已修复”依据。[Vite 官方公告](https://github.com/advisories/GHSA-vg6x-rcgg-rjx6)、[esbuild 官方公告](https://github.com/advisories/GHSA-67mh-4wv8-2f99)

GitHub 源码推送、静态构建成功、真实生产部署安全是三个不同结论。本项目没有获准或执行真实部署；残余依赖风险仍需在后续技术栈升级时解决，不把源码推送解释为正式生产放行。

## 实际源码可达性

| 依赖 / 告警数 | 当前版本及入口 | 本次可核实的业务路径与风险 |
|---|---|---|
| Vite / 20 | Uni-App 5.2.8，开发服务与构建器 | 手机端配置 `127.0.0.1`，管理端也绑定本地；当时 3300–3303 的监听经 `lsof` 均为 `127.0.0.1`。H5/小程序正式目标是构建产物，不发布 Vite 开发服务。部分 DOM clobbering 可涉及构建代码，因此另查应用无不可信 HTML 注入、无动态用户标签。新 guard 缓解开发入口；没有改写 Vite 包，也不宣称解决全部 20 条。 |
| esbuild / 1 | 0.20.2，经 Uni CLI / Vite | 应用与 Uni CLI 可见源码未调用 esbuild `.serve()`；它承担本地编译。Vite 本身的开发服务问题另行防护。官方修复版本是 0.25.0，0.x 小版本可含破坏性改动，不盲目 override。 |
| lodash.set / 1 high | 4.3.2，经 `@cloudbase/database@1.4.3` | 唯一已安装源码调用在 `src/realtime/virtual-websocket-client.ts:734` 的实时监听 `updatedFields[fieldPath]` 应用。项目未调用数据库 `.watch()` 或实时监听，仅使用受限集合的 get/set/list/transaction。这里是“未找到应用可达调用”，并非库已安全。官方列 standalone lodash.set 无已发布修复；registry 确认 latest 4.3.2、无 4.3.3，不能照 audit 的形式化 `>=4.3.3` 填入不存在版本。[官方公告](https://github.com/advisories/GHSA-p6mc-m468-83gw) |
| Vue I18n 相关 / 5（含 3 high） | vue-i18n / core-base / shared 9.14.5 | 应用无 `createI18n`、`useI18n`、`$t`、`v-html`、`srcdoc`、`innerHTML` 或动态翻译 HTML。用户资料和反馈以 Vue/React 文本节点呈现。官方高危前提包括 HTML 翻译、escapeParameter 和不可信消息/参数；当前应用未满足该入口。DCloud 内部静态文案不能等同于允许用户上传 HTML 翻译。正式修复在 11.4.14，不能把 9→11 静默当兼容补丁。[官方公告](https://github.com/advisories/GHSA-83rm-6c8r-g728)、[参数逃逸公告](https://github.com/advisories/GHSA-8rc2-428q-7ww3) |
| Vue server-renderer / 1 high | 3.4.21，与 Uni-App Vue 版本绑定 | 应用无 Vue `renderToString` / stream SSR HTTP 服务，也无把用户键名 `v-bind="userObject"` 交给 SSR 的入口。`createSSRApp` 是 Uni-App 客户端约定，本身不证明存在对外 SSR。PC 是独立 Next.js/React。3.5.42 是官方修复，但不单独升级 renderer 破坏 Vue compiler/runtime 对齐；应随兼容 DCloud 版本整体验证。[官方公告](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) |
| fast-uri / 4 | 3.1.8，经 Ajv | 仅编译本仓库静态 JSON Schema / $ref。应用不接受用户自带 Schema，不使用该包验证 Banner 外链（外链用 WHATWG URL + allowlist）。3.1.9 是同 3 主版本修复，适合隔离补丁验证。[官方公告](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) |
| postcss-selector-parser / 1 | 6.1.4，Uni CSS 编译 | 只编译仓库 CSS；接口不接受用户 CSS/selector 并实时编译。官方明确普通可信源码构建不满足 CPU 耗尽的请求路径前提。6.1.5 是同 6 主版本补丁候选。[官方公告](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| @babel/core / 1 | 7.25.2，Uni 编译链 | 只编译仓库源码，未把上传 PDF/Office/视频当代码编译。官方要求攻击者可控制输入源码并读取输出；本项目没有此服务入口。官方当前公告修复为 **7.29.6**，不能仅按 audit 展示的 `>=7.29.1` 猜最低安全版本。[官方公告](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| phin / 1 | 2.9.3，微信自动化 → Jimp | 已安装 `uni-mp-weixin/lib/uni.automator.js` 以 Buffer 解码调试二维码；业务上传解析走 sharp / PDF.js / ffprobe / yauzl，没有调用 Jimp URL 读取或附身份头跟随重定向。正式修复 3.7.1 跨主版本，不能直接替换所有 Jimp 依赖。[官方公告](https://github.com/advisories/GHSA-x565-32qp-m3vf) |

## 已增加的开发服务前置防护

共享实现为 `scripts/dev-server-guard.ts`，在后台和手机端 Vite 配置的插件列表首位启用，`apply: serve`，构建过程不启用该中间件。

- 要求 socket 对端为 loopback，Host 为 `127.0.0.1` 或 `localhost`，且端口必须等于实际监听端口，阻断伪造 Host / DNS rebinding 的常见入口。
- 存在 Origin 时只接受匹配本地端口的规范 HTTP/HTTPS origin；拒绝 `null`、外站和附路径 origin。
- 拒绝 `Sec-Fetch-Site: cross-site` 及未知值；允许 same-origin / same-site / none。无 Origin / Sec-Fetch-Site 的本地非浏览器工具仍可使用。
- 拒绝 `__open-in-editor` 路径段，包括编码形式，不允许开发服务启动编辑器执行链。
- 给 HTTP server 的 `upgrade` 事件注册前置检查，拒绝不可信浏览器 HMR 握手。

这不修补 Vite 的内部路径解析器，不等价于完整沙箱，也不能证明宿主机被恶意本地进程控制时安全。不能把旧开发服务置于公网或通过代理绕过本地 guard 作为正式服务。

本地隔离验证：`node --import tsx --test tests/unit/dev-server-guard.test.ts` **2/2 通过**，使用真实 HTTP / net socket，覆盖 Host、Origin、Sec-Fetch-Site、编辑器编码路径和 HMR 前置拒绝。原生 Node fetch 会覆盖 Host，测试使用 native http 保证伪造头确实发送。新增防护及跨 Vite 类型兼容修订后 `pnpm check` 也通过；完整 build/browser 结果由最终总报告记录。

## 同主版本的最小更新建议（未实施）

优先级可按以下顺序在隔离安装目录执行，不能对当前已验证的 node_modules 直接离线安装或强制升级：

1. `fast-uri@3.1.8 → 3.1.9`：同主版本，限定现 3.x 解析链，保留其他主版本；跑全部契约、Ajv 和 URL 测试。
2. `postcss-selector-parser@6.1.4 → 6.1.5`：仅限定 6.x 依赖，重建 H5/小程序并比对 CSS 和四目标构建。
3. `@babel/core@7.25.2 → 7.29.6`：保持 7 主版本，但涉及编译器输出，需 DCloud 构建和浏览器回归后才能纳入锁文件。
4. Vite `5.2.8 → 5.4.21` 只能修复较早的部分公告；2026 年新问题官方修复从 6.4.2/6.4.4 起，无 5.x 全部修复证明。不能把“5.4.21 + guard”描述为清零，也不能在本轮盲目跨主版本。[Vite 2026 路径公告](https://github.com/advisories/GHSA-4w7w-66w2-5vf9)
5. lodash.set 若上游迟迟未更换，可用经过评审的 package patch 回移 lodash 官方对 `__proto__` / `constructor` / `prototype` 路径段的防护，并新增原型污染负向测试；这属于真正依赖修改，需要生成可复现 patch、锁文件及完整重验。不能把 `lodash.set` alias 成整个 lodash（导出 API 不兼容），不能写不存在的 4.3.3。

可用 scoped overrides 表达前两项，例如 `fast-uri@3.1.8: 3.1.9`、`postcss-selector-parser@6.1.4: 6.1.5`；此处是建议，没有将其写入配置。所有改动需先在独立临时目录根据锁文件安装并验证，成功后再更新本仓库锁文件。此次没有运行 `pnpm install`，未改现有依赖目录。

## 审计条目索引

以下为本次原始审计条目索引，版本建议与上文官方核对结论不同时以上文为准；基线数量不因可达性解释而减少。

| 模块 | 已装版本 | 等级 | 官方条目 |
|---|---|---|---|
| phin | 2.9.3 | moderate | [GHSA-x565-32qp-m3vf](https://github.com/advisories/GHSA-x565-32qp-m3vf) |
| vite | 5.2.8 | moderate | [GHSA-9cwx-2883-4wfx](https://github.com/advisories/GHSA-9cwx-2883-4wfx) |
| vite | 5.2.8 | moderate | [GHSA-64vr-g452-qvp3](https://github.com/advisories/GHSA-64vr-g452-qvp3) |
| esbuild | 0.20.2 | moderate | [GHSA-67mh-4wv8-2f99](https://github.com/advisories/GHSA-67mh-4wv8-2f99) |
| vite | 5.2.8 | moderate | [GHSA-vg6x-rcgg-rjx6](https://github.com/advisories/GHSA-vg6x-rcgg-rjx6) |
| vite | 5.2.8 | moderate | [GHSA-x574-m823-4x7w](https://github.com/advisories/GHSA-x574-m823-4x7w) |
| vite | 5.2.8 | moderate | [GHSA-356w-63v5-8wf4](https://github.com/advisories/GHSA-356w-63v5-8wf4) |
| vite | 5.2.8 | moderate | [GHSA-859w-5945-r5v3](https://github.com/advisories/GHSA-859w-5945-r5v3) |
| vite | 5.2.8 | moderate | [GHSA-xcj6-pq6g-qj4x](https://github.com/advisories/GHSA-xcj6-pq6g-qj4x) |
| lodash.set | 4.3.2 | high | [GHSA-p6mc-m468-83gw](https://github.com/advisories/GHSA-p6mc-m468-83gw) |
| vite | 5.2.8 | low | [GHSA-g4jq-h2w9-997c](https://github.com/advisories/GHSA-g4jq-h2w9-997c) |
| vite | 5.2.8 | low | [GHSA-jqfw-vq24-v9c3](https://github.com/advisories/GHSA-jqfw-vq24-v9c3) |
| vite | 5.2.8 | moderate | [GHSA-93m4-6634-74q7](https://github.com/advisories/GHSA-93m4-6634-74q7) |
| vite | 5.2.8 | moderate | [GHSA-4r4m-qw57-chr8](https://github.com/advisories/GHSA-4r4m-qw57-chr8) |
| vite | 5.2.8 | moderate | [GHSA-4w7w-66w2-5vf9](https://github.com/advisories/GHSA-4w7w-66w2-5vf9) |
| vite | 5.2.8 | high | [GHSA-c27g-q93r-2cwf](https://github.com/advisories/GHSA-c27g-q93r-2cwf) |
| vite | 5.2.8 | moderate | [GHSA-v6wh-96g9-6wx3](https://github.com/advisories/GHSA-v6wh-96g9-6wx3) |
| @babel/core | 7.25.2 | low | [GHSA-4x5r-pxfx-6jf8](https://github.com/advisories/GHSA-4x5r-pxfx-6jf8) |
| @vue/server-renderer | 3.4.21 | high | [GHSA-g2v6-rqmx-r4w6](https://github.com/advisories/GHSA-g2v6-rqmx-r4w6) |
| vite | 5.2.8 | moderate | [GHSA-698v-4r3x-3vcv](https://github.com/advisories/GHSA-698v-4r3x-3vcv) |
| vite | 5.2.8 | moderate | [GHSA-r825-w8mm-5pxw](https://github.com/advisories/GHSA-r825-w8mm-5pxw) |
| vite | 5.2.8 | high | [GHSA-587h-7wmj-h5pm](https://github.com/advisories/GHSA-587h-7wmj-h5pm) |
| vite | 5.2.8 | low | [GHSA-9jrq-w75r-8gcw](https://github.com/advisories/GHSA-9jrq-w75r-8gcw) |
| vite | 5.2.8 | moderate | [GHSA-rq7h-c2jc-7f22](https://github.com/advisories/GHSA-rq7h-c2jc-7f22) |
| fast-uri | 3.1.8 | moderate | [GHSA-w74x-v6f9-j3xg](https://github.com/advisories/GHSA-w74x-v6f9-j3xg) |
| fast-uri | 3.1.8 | low | [GHSA-xhq7-xmqj-769h](https://github.com/advisories/GHSA-xhq7-xmqj-769h) |
| fast-uri | 3.1.8 | moderate | [GHSA-wjr9-j795-jxcr](https://github.com/advisories/GHSA-wjr9-j795-jxcr) |
| fast-uri | 3.1.8 | low | [GHSA-333x-w4r6-6crp](https://github.com/advisories/GHSA-333x-w4r6-6crp) |
| postcss-selector-parser | 6.1.4 | moderate | [GHSA-rj75-hqrm-r3gf](https://github.com/advisories/GHSA-rj75-hqrm-r3gf) |
| vite | 5.2.8 | moderate | [GHSA-fx2h-pf6j-xcff](https://github.com/advisories/GHSA-fx2h-pf6j-xcff) |
| @intlify/core-base | 9.14.5 | low | [GHSA-8rc2-428q-7ww3](https://github.com/advisories/GHSA-8rc2-428q-7ww3) |
| vue-i18n | 9.14.5 | low | [GHSA-8rc2-428q-7ww3](https://github.com/advisories/GHSA-8rc2-428q-7ww3) |
| @intlify/shared | 9.14.5 | high | [GHSA-83rm-6c8r-g728](https://github.com/advisories/GHSA-83rm-6c8r-g728) |
| @intlify/core-base | 9.14.5 | high | [GHSA-83rm-6c8r-g728](https://github.com/advisories/GHSA-83rm-6c8r-g728) |
| vue-i18n | 9.14.5 | high | [GHSA-83rm-6c8r-g728](https://github.com/advisories/GHSA-83rm-6c8r-g728) |
