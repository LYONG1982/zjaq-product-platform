# 中技安全产品资料库：首轮实施交付报告

日期：2026-10-19（Asia/Shanghai）  
范围：V4.0-RC2 基线，TASK-00／TASK-01。用户在计划展示后回复“开始实施”，授权本轮工程创建、两项契约补齐、依赖安装与本地验证。

## 交付结论

第一轮工程骨架已完成。Next.js PC 门户、Vue 3 PC 后台、Uni-App H5 和微信小程序目标均实际编译成功；生成与类型检查、14 项单元／API 测试、6 项浏览器检查通过。当前实现 28 项契约中的 9 项只读接口，三前端共用统一 Mock API。

这是本地开发交付，尚未达到正式业务验收或上线条件。依赖安全审计 FAIL：18 项 high、25 项 moderate、8 项 low、0 项 critical。原 64 项业务验收全部保持 NOT_RUN，真实身份、CloudBase、发布写业务、文件上传及真机验收尚未实施。后续整改输入单独列出，不用本轮通过结果覆盖这些未完成项。

## 工程与已实现行为

项目根目录：`/Users/lvyong198201/Documents/Codex/2026-10-19/qin`。已初始化独立本地 Git；未提交、未配置远程、未推送。原交付包与缘分实验室父仓库未修改。

| 模块 | 当前行为 |
| --- | --- |
| PC 后台 | 明示模拟身份；草稿列表、搜索、分类／状态筛选、20＋7 分页读取、只读详情、分类与版本化模板查看 |
| PC 门户 | 首页、产品页、资料页；以生产模式读取 API；正确显示空目录，显式加载失败状态 |
| H5 | 首页、产品、资料导航；390／320 CSS 像素宽度检查通过；错误状态与空目录区分 |
| 微信小程序 | 相同 Uni-App 业务入口编译为 mp-weixin；不包含真实 AppID，尚未导入开发者工具或真机运行 |
| Mock API | 9 项读取接口与本地 health；固定 local-mock 标记；回环绑定；非开发／测试环境禁止启动 |
| 正式 API | 配置与适配边界；缺少 CloudBase 或真实适配器时退出，禁止自动回退 Mock |
| 共享包 | DTO 生成、JSON Schema 2020-12、模板字段／版本／分类校验、视觉 Token、浏览器／Uni-App API 客户端 |
| 种子 | 4 分类、4 模板、27 款 DRAFT；首批 001、002、009、008、006、015；纯计算 dry-run 与 insert-missing-only 校验 |

27 款主档未补写宣传文本、负责人或资料；前台空目录是尚未发布的正确结果。来源快照位于 `delivery/v4-rc2`，不进入应用 public 或 dist。

只读接口清单见 `scope-delta.md`。未实现写业务请求不返回伪成功。两项工作契约变更见 `contracts/CHANGES.md`：q 最大 100 个 Unicode 字符；模板接口补充 templateId／version 历史版本查询。原交付契约快照保持原样。

模板校验区分草稿不完整与发布必填，拒绝模板之外的技术字段；JSON Schema allOf 中 expectedVersion 约束保留。公共响应按白名单校验；查询参数拒绝重复、未知及越界输入，游标绑定查询条件。种子纯计算不覆盖已有编辑，不以数组长度重置编号计数器。

## 环境与固定版本

| 项目 | 实际版本 |
| --- | --- |
| Node／pnpm | 22.22.1／11.13.1 |
| 门户 | Next.js 16.4.2，React／React DOM 19.3.1 |
| PC 后台 | Vue 3.5.44，Vite 8.3.4，plugin-vue 6.0.10 |
| Uni-App 配套 | DCloud 3.0.0-5020620260917001；Vue 3.4.21；Vite 5.2.8；types 3.4.31；vue-i18n 9.14.5 |
| TypeScript／vue-tsc／tsx | 5.9.3／3.3.13／4.23.15 |
| Schema／生成 | Ajv 8.20.0，ajv-formats 3.0.1，json-schema-to-typescript 16.0.0，yaml 2.9.1 |
| 浏览器工具 | Playwright 1.64.1，复用本机 Google Chrome |
| 静态包校验 | Python 3.14.5，局部虚拟环境；PyYAML 6.0.3、jsonschema 4.26.0 |

pnpm 非 registry 配置保存在 `pnpm-workspace.yaml`，依赖 store／cache 最终位于项目 work 内。锁文件精确固定；门户与后台使用独立于 Uni-App 的兼容依赖组合，没有全局强制覆盖不同 Vite 版本。安装供应链策略验证不等于漏洞审计。

## 已执行验证

证据均保存在 `implementation-reports/evidence/`；结构化汇总为 `verification.json`。

| 命令／检查 | 实际结果 | 证据文件 |
| --- | --- | --- |
| `pnpm install --frozen-lockfile` | PASS，退出 0；锁文件无漂移 | frozen-install.log |
| `pnpm check` | PASS，退出 0；生成文件匹配，根工程与三前端类型检查通过 | check-verified.log |
| `pnpm test` | PASS，退出 0；14 通过、0 失败 | tests-verified.log |
| `pnpm seed:dry-run` | PASS，退出 0；27 个待插入 ID，counterNext=28；没有数据库写入 | seed-dry-run.json |
| 原包 `validate_delivery.py --report …` | PASS，退出 0；10 通过、0 失败 | delivery-validation.json |
| `pnpm build:portal` | PASS，退出 0；门户动态路由构建 | build-portal-final.log |
| `pnpm build:admin` | PASS，退出 0 | build-admin-final.log |
| `pnpm build:h5` | PASS，退出 0 | build-h5-final.log |
| `pnpm build:mp-weixin` | PASS，退出 0；仅目标编译 | build-weixin-final.log |
| `CHROMIUM_PATH=… pnpm test:browser` | PASS，退出 0；6 通过、0 失败 | browser-final.log、browser-results.json |
| `pnpm start:api` | EXPECTED_FAILURE，退出 1；REAL_API_REQUIRES_CLOUDBASE；未回退 Mock | real-api-guard.log |
| `pnpm audit --json` | FAIL，退出 1；51 条告警 | dependency-audit.json |
| 原包／快照完整性、工作输入保留 | PASS，逐文件 SHA-256 与 manifest 核对 | source-integrity.json |

14 项测试覆盖 Schema 编译与契约请求响应、模板版本和发布必填边界、额外字段拒绝、Unicode 搜索长度、种子不覆盖／幂等／计数器、真实本地 HTTP 的参数／游标／模拟身份／CORS／公共字段边界以及生产环境 Mock 保护。这些是本轮自动测试，不等于完整业务验收。

6 项浏览器检查覆盖门户生产空态与导航，后台读取全部 27 草稿／筛选／详情／模板，H5 两种宽度及导航、网络失败状态，以及构建预览拒绝外部 Origin 和目录越界访问。截图为 `outputs/admin-1440.png`、`portal-1440.png`、`mobile-390.png`、`mobile-320.png`；已检查最终截图。它们不是所有浏览器、完整无障碍或全部设计稿的视觉回归。

原包校验器含“HTML与Word结构”检查，其通过只证明容器和链接；其报告中的“版式另经渲染检查”是包内既有表述，本轮未重新渲染原 Word／PDF，也不把它认作新视觉验收证据。

实施中曾遇到依赖下载超时、pnpm 11 配置位置差异、Uni 插件导出兼容及浏览器测试对默认模板排序的错误假设，已分别修正并在最终代码上重新执行检查和四目标构建。首次失败记录不作为交付通过证据。依赖审计仍未通过，保留原始结果。

## 启动与构建产物

在项目根目录按 README 安装后，运行四目标构建。随后分别运行：

```sh
pnpm dev:api
pnpm start:portal
pnpm --filter @zj/admin preview
pnpm preview:h5
```

| 本地入口 | 地址 | 构建目录 |
| --- | --- | --- |
| 门户 | http://127.0.0.1:3200 | apps/portal/.next |
| 后台 | http://127.0.0.1:3201 | apps/admin/dist |
| H5 | http://127.0.0.1:3202 | apps/mobile/dist/build/h5 |
| Mock 健康检查 | http://127.0.0.1:3100/health | 直接运行 TypeScript 服务 |
| 微信小程序 | 未生成体验码 | apps/mobile/dist/build/mp-weixin |

这些地址仅供本机，进程关闭后需重新启动；手机上的 127.0.0.1 不指向此电脑。H5 当前运行构建后静态服务，限定静态根目录、Host、Origin，不将工作区当静态目录。尚未对外部署。

源码 ZIP 包含锁文件、应用／服务／共享包、来源快照、测试、计划、报告及证据；不包含 node_modules、work 缓存、Git 数据、真实环境文件或本机编译缓存。取得源码后按 README 安装与构建，ZIP 不是可直接上线的独立部署包。

## 已知限制与下一轮输入

1. **依赖安全审计未通过。** DCloud 配套旧依赖产生告警，详见 `dependency-risk.md`。需要独立明确兼容升级／替换方案并重新审计、四目标构建和回归；当前不能宣称适合外网部署。静态预览和回环绑定仅限制本地暴露，不修复依赖。
2. **业务只读。** 新建第 28 款、编辑保存、上传、预览代理、直接发布、版本更新／下架、并发和幂等写入尚未实现，需后续 TASK-02／03 计划。
3. **真实环境缺失。** 尚未验证 CloudBase 项目、身份来源、首个 ADMIN、私有存储、HTTPS、域名、微信 AppID／合法域名、备份恢复；没有真实云端数据或凭据。
4. **阅读端口径待统一。** 搜索覆盖字段、首页首批跨分页、结果数量仍需后续契约确认；本轮未擅加新参数。
5. **内容与验收待完成。** 27 主档都为草稿；六款正式内容待负责人提供。64 项原验收全部 NOT_RUN；微信模拟器／真机、正式 API、发布失效和文件 Range 验证未执行。

第一轮已按其完成标准交付并归档计划。后续轮次及依赖整改仍按用户规则先提出具体计划、获得显式确认后实施。没有创建远程仓库、推送代码、购买资源、发布真实资料或上传微信。
