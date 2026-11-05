# 二测小程序遗漏补齐与多系列验证报告

日期：2026-11-05。状态：本轮指定修复、隔离本地验证及剩余验收清单已完成；未推送、部署或进行微信真机验收。

## 结果与修改范围

- #07：合并小程序 `.category-wrap` 样式，去掉后置 `position: relative` 覆盖，最终编译产物只保留一条 `sticky; top: 0; z-index: 12` 规则。
- #11：按原已确认方案，仅去除小程序首页独立品牌栏，保留默认品牌 Banner 和产品/资料页既有品牌。真实小程序编译产物中的品牌栏绑定为首页 false、产品/资料页 true。
- #17：后台代码无需再改。用浏览器临时响应呈现 8 个系列（加“全部”共 9 项），完成普通名称/长名称 × 1280/1440 四组专项验证。
- 业务源文件仅改 `apps/mobile/src/components/CatalogView.vue` 的模板和 CSS；`<script setup>` 完整保持。新增 `tests/browser/mini-followup.spec.ts`，未改 API、领域逻辑、契约、字段、上传流程、V01.0、已有 H5 业务脚本或分类配置。
- 剩余项见 [剩余验收清单](./2026-11-05-remaining-acceptance-checklist.md)，其中 #09、#06、#13、真实上传/身份/微信实机、完整业务验收与明确后置项分别列明。

## 验证结果

| 验证 | 结果 | 证据（相对本项目） |
| --- | --- | --- |
| 移动端类型检查 | 通过 | `work/mini-followup-20261105/check-mobile.log` |
| 小程序构建 | 通过；最终 WXSS 仅一条吸顶规则 | `build-mini.log`；`apps/mobile/dist/build/mp-weixin/` |
| H5 构建及 PDF 资源同步 | 通过 | `build-h5.log`、`sync-h5-assets.log` |
| #11 编译后原生渲染绑定 | 首页隐藏独立品牌栏，产品/资料页保留；Banner 模板保留 | `browser-results-final.json` 的 `native-render-conditions` |
| #07 编译后样式滚动 | 将实际 WXSS 应用于浏览器布局夹具，320/390 宽度、350/700 滚动位置均吸顶到 y=0 | `browser-results-final.json` 的 `compiled-wxss-scroll`；这不是微信运行环境 |
| #17 多系列 | 四组全部通过；单行、横滚、鼠标/键盘末项可达、选中/筛选、空态、返回“全部”、URL/返回栈及侧栏/表格稳定 | `browser-results-final.json` 的四组 `layout-evidence` 和 `admin-series-*.png` |
| H5 回归 | 品牌 Banner 保留，无独立品牌栏；五项 Tab 保持吸顶、同页切换，搜索空态仍保留导航/选中态，页面无横溢出 | `h5-results.json`、`h5-home-preserved.png`、`h5-tabs-preserved.png` |
| 补丁检查 | `git diff --check` 通过 | 无格式错误输出 |

上述证据文件除另注明路径外，均位于 `work/mini-followup-20261105/`。合计 7 个独立自动验证用例通过：编译渲染 1、编译样式布局 1、后台浏览器 4、H5 浏览器 1，无跳过或 flaky。未重新执行不受本轮修改影响的整套单元测试，不把这些结果等同原 64 项业务全验收。

### #17 尺寸与临时数据

| 视口宽度 | 系列数量 | 普通名称容器/内容宽度 | 长名称容器/内容宽度 |
| --- | --- | --- | --- |
| 1280 | 8 + 全部 | 1002 / 1002px | 1002 / 1771px |
| 1440 | 8 + 全部 | 1162 / 1162px | 1162 / 1771px |

长名称使用合同允许的长度范围，在浏览器响应内添加 4 个明确标注验证的系列，不创建数据库记录。超宽时只滚动导航容器；最后一项完整可见，表格和侧栏位置/宽度保持不变，页面无水平滚动。虚构系列筛选采用浏览器空响应，返回“全部”后原表格/7 个字段恢复。所有页面 API 写请求均由测试拦截保护，实际检测到的写请求为 0。

初次验证脚本有两处夹具问题：误把已有的“空结果不渲染表格”当作表头应继续存在，以及把小程序 WXSS 的作用域 class 写成了 HTML attribute。随后仅修正测试夹具并定向复测通过，没有为通过测试改动后台业务行为。

## 原 UAT 与数据保护

- 原 UAT 目录 `/Users/lvyong198201/.codex/worktrees/github-h5-two-rounds-20261101/中技-产品资料平台 2026` 未写入、构建、重启或执行 seed/reset。601 个受控文件 + 1 个原未跟踪 AGENTS.md，共 602 个文件前后 SHA-256 完全一致。
- 原 3300–3303 端口在开始时未监听，未启动或接管。验证继续使用已有隔离环境 3401/3402/3403，未重启 Mock。
- 隔离 Mock 会话前后均为 `e83342ef-6252-41ee-ae9c-2bd201569ea3`；正常产品 81、已移除 0、系列 4，前后不变。
- 只读比较产品列表、81 份草稿（包含字段/媒体/资料）、系列、分享配置、站点 Banner 和联系配置的归一化内容摘要，前后同为 `d6bd12b15ca46393c393e79bfff7a31579c03dde8acb00119b441baa1bfd9f2d`。分享地址仍保持未配置。
- 相对于本轮开始的工作区指纹，代码路径只变化 `CatalogView.vue` 与新增测试 `mini-followup.spec.ts`。保存了本轮小补丁，并用其逆向还原结果校验修改前指纹一致，确认脚本逻辑未变。
- 证据：`before.json`、`after.json`、`preservation-result.json`、`source-boundary.json`、`catalog-followup.diff`。文件/Mock 数据保护不能替代真实数据库连续两次部署验证。

## 实际命令

均在隔离工作区执行。构建/检查输出已保存至上述同名日志。

```sh
# apps/mobile 目录
node node_modules/vue-tsc/bin/vue-tsc.js --noEmit
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p mp-weixin
VITE_API_BASE_URL=http://127.0.0.1:3403/api/v1 node node_modules/@dcloudio/vite-plugin-uni/bin/uni.js build -p h5
# 项目根目录
node scripts/sync-preview-assets.mjs --h5
TEST_API_URL=http://127.0.0.1:3403 TEST_ADMIN_URL=http://127.0.0.1:3401 CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_JSON_OUTPUT_FILE=work/mini-followup-20261105/browser-results-final.json node node_modules/@playwright/test/cli.js test tests/browser/mini-followup.spec.ts --reporter=list,json --output=work/mini-followup-20261105/browser-artifacts-final
# H5 用例新增后单独执行，前六项代码未再变化
TEST_API_URL=http://127.0.0.1:3403 TEST_H5_URL=http://127.0.0.1:3402 CHROMIUM_PATH='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' PLAYWRIGHT_JSON_OUTPUT_FILE=work/mini-followup-20261105/h5-results.json node node_modules/@playwright/test/cli.js test tests/browser/mini-followup.spec.ts --grep 'H5 retains' --reporter=list,json --output=work/mini-followup-20261105/h5-artifacts
python3 work/mini-followup-20261105/snapshot.py before
python3 work/mini-followup-20261105/snapshot.py after
git diff --check
```

首条浏览器命令执行时文件包含前六项；现文件包含全部七项，后续同命令可重跑全部七项。快照 before/after 分别在修改前和验证后执行，未反向覆盖本次证据。

## 完成边界

当前目录仍基于 `4346746d715b311ae568a1fc255cf942c364762d` 的本轮隔离分支，保留前轮所有未提交改动。未 Git 提交/推送、合并、部署、连接真实 CloudBase、修改域名或迁移数据。电脑上未发现微信开发者工具，原生绑定测试使用实际编译 JS/WXML 与隔离生命周期替身，样式测试使用实际 WXSS 与浏览器夹具；两者均不冒充微信模拟器或真机验收。
