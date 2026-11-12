# 移除「本地演示」文字与修正 H5 uni-button 按钮组高度（2026-11-11）

## 1. 任务与授权

用户明确要求执行，视为对计划的确认（AGENTS.md 要求先落计划再实施，不再另行等待确认）：

1. 删除界面上所有可见的「本地演示」文字（删除，不是隐藏），并清理因此失效的样式与空壳容器。
2. 修正 H5 产品列表页「全部」筛选按钮比其他胶囊明显偏高的问题；全仓库排查其它把 `uni-button` 当筛选标签／胶囊／按钮组使用、H5 下高度与同行元素不一致的地方，一并修正。
3. 不执行 `git commit`，不连接服务器。

## 2. 现状核查（已完成的只读定位）

### 2.1 「本地演示」

全仓库检索 `本地演示`，`apps/` 下仅剩 2 处可见文案：

| 文件 | 位置 | 说明 |
| --- | --- | --- |
| `apps/mobile/src/components/CatalogView.vue` | 第 268 行 | `v2-page-header` 内 `<text class="v2-demo">本地演示</text>`，产品一览／资料中心共用 |
| `apps/mobile/src/pages/viewer/index.vue` | 第 215 行 | `v2-viewer-header` 内 `<text class="v2-demo">本地演示</text>` |

产品详情页 `apps/mobile/src/pages/detail/index.vue` 已在前一轮删除，本次无需再改。

样式引用：`.v2-demo` 仅定义于 `apps/mobile/src/styles/h5-v2.css` 第 10 行，删除上述两处后无任何引用。`v2-page-header`、`v2-viewer-header` 仍分别承载标题与返回按钮，不是空壳，保留。

`apps/portal`（Next.js）与 `apps/admin`（Vue3）无可见「本地演示」：portal 仅 `next.config.ts` 注释、admin 仅「演示文稿」业务分类，均不改。

`tests/browser/h5-branding.spec.ts` 第 81–83 行仍断言 `.v2-brand-row`／`.v2-demo`，但该文件早在品牌行移除后即失效（其它用例已断言 `.v2-brand-row` 数量为 0），属于既有失效测试，本次不动测试代码，仅在报告中标注。

### 2.2 H5 uni-button 高度

根因：uni-app 在 H5 把 `<button>` 渲染为 `<uni-button>`，并注入默认样式
`display:block; padding-left/right:14px; font-size:18px; line-height:2.55555556; border-radius:5px; box-sizing:border-box`。
项目胶囊尺寸依赖 `padding:9px 14px; line-height:18px; min-height:44px`，一旦默认 `line-height`／`display` 未被显式覆盖，按钮就会比同排胶囊高出一截。

本地构建产物实测（Chrome + Playwright，390px 视口）：当前源码的 `.v2-filters` 5 个按钮均为 44px，说明仓库源码已有部分收敛；但规则分散、依赖级联顺序，部署侧仍出现偏差。本次在 H5 专属层显式补齐 `display/height/min-height/padding/line-height/box-sizing`，使结果不再依赖 uni 默认值。

排查到的 `uni-button` 按钮组：

| 位置 | 现状 | 处理 |
| --- | --- | --- |
| `.v2-filters`（产品一览／资料中心筛选胶囊） | 依赖基础规则，缺显式 height/display | 显式 44px、flex 居中、`padding:0 14px`、`line-height:1` |
| `.section-nav`（详情页 价值/能力/场景/资料） | `line-height:28 + padding:4` 与 `min-height:44` 叠加 | 统一 44px 高、flex 居中、`line-height:1` |
| `.v2-view-controls`（资料预览上一页/下一页） | 显式 `height:44`，但 `display/line-height` 仍受默认值影响 | 统一 44px 高、flex 居中、`line-height:1` |
| `.v2-zoom-controls`（缩小/放大） | `line-height:44` 撑高，非显式高度 | 统一 44px 高、flex 居中、`line-height:1` |
| `.v2-bottom-nav`（底部导航） | 已显式 `height:72px` 且 flex 排版 | 不改 |
| `.v2-banner-dots` | 已显式 28×28 | 不改 |
| `.v2-search` 按钮 | 已显式 40×40 | 不改 |
| SharePanel／反馈表单按钮 | 全宽、`min-height:44` 且 flex 居中，无同行胶囊 | 不改 |

## 3. 实施内容

### 3.1 删除「本地演示」

1. `apps/mobile/src/components/CatalogView.vue`：删除第 268 行整段 `<text class="v2-demo">本地演示</text>`，保留 `v2-page-header` 与页面标题。
2. `apps/mobile/src/pages/viewer/index.vue`：删除第 215 行同段文字，保留 `v2-viewer-header` 与返回按钮。
3. `apps/mobile/src/styles/h5-v2.css`：删除第 10 行 `.h5-v2 .v2-demo { ... }`。

### 3.2 H5 按钮组高度收敛

在 `apps/mobile/src/App.vue` 既有 `/* #ifdef H5 */` 块内（`uni-button::after` 规则之后）新增：

```css
.h5-v2.v2-catalog .v2-filters uni-button {
  display: flex; align-items: center; justify-content: center;
  height: 44px; min-height: 44px; padding: 0 14px;
  font-size: 12px; line-height: 1; border-radius: 16px; box-sizing: border-box;
}
.h5-v2.v2-detail .section-nav uni-button,
.h5-v2.v2-viewer .v2-view-controls uni-button,
.h5-v2.v2-viewer .v2-zoom-controls uni-button {
  display: flex; align-items: center; justify-content: center;
  height: 44px; line-height: 1; box-sizing: border-box;
}
.h5-v2.v2-detail .section-nav uni-button,
.h5-v2.v2-viewer .v2-zoom-controls uni-button { padding: 0 4px; }
```

选择器放在 `App.vue` 的 H5 条件编译块内，小程序端不引入，渲染不受影响；选择器直接命中 H5 运行时标签 `uni-button`，不再依赖编译器对 `button` 的转换。

不改动：接口调用、数据加载、事件、路由、模板结构、非按钮组布局。

## 4. 验证

1. `pnpm --filter @zj/mobile check`（vue-tsc）无新增类型错误。
2. `pnpm --filter @zj/mobile build:h5` 成功，构建产物 CSS 内含新规则、不含 `本地演示`／`v2-demo`。
3. `grep -rn "本地演示\|v2-demo" apps/` 仅剩业务无关命中（应为 0）。
4. 用本机 Chrome + Playwright 加载构建产物（mock API fixture）检查：
   - 产品一览／资料中心 `.v2-filters` 全部胶囊高度均为 44px、顶边一致；
   - 详情页 `.section-nav` 四个按钮高度均为 44px；
   - 资料预览翻页／缩放按钮组高度均为 44px；
   - 页面不再出现「本地演示」。
5. 小程序端仅做静态检查：`App.vue` 新增规则在 `#ifdef H5` 内，`mp-weixin` 构建不包含 `uni-button` 选择器（必要时执行 `pnpm --filter @zj/mobile build:mp-weixin` 验证构建通过）。

## 5. 构建产物与镜像

| 改动 | 构建产物 | 镜像 |
| --- | --- | --- |
| `apps/mobile`（H5） | `apps/mobile/dist/build/h5` → `work/docker/web-context/h5` | `zjaq/web`（`deploy/docker/Dockerfile.web`，同时包含 admin 静态站点） |
| portal／admin 业务代码 | 未改动 | `zjaq/portal`、admin 无源码变更，无需因本次改动重建 |
| API | 未改动 | `zjaq/api` 不重建 |

结论：只需重建 `zjaq/web`；`zjaq/portal` 与 `zjaq/api` 不受影响。

## 6. 补丁包

目录：`2026-11-11/demo-text-cleanup/outputs/`

- 按仓库相对路径收录改动文件：`apps/mobile/src/App.vue`、`apps/mobile/src/components/CatalogView.vue`、`apps/mobile/src/pages/viewer/index.vue`、`apps/mobile/src/styles/h5-v2.css`。
- `PATCH-README.md`：改动说明、影响镜像、应用与回滚方式。
- 打包为 `zjaq-demo-text-and-h5-button-patch-2026-11-11.tar.gz`，生成同名 `.sha256` 并写入 `SHA256SUMS.txt`。

不执行 `git commit`，不连接服务器。

## 7. 回滚

1. 「本地演示」：把 `<text class="v2-demo">本地演示</text>` 分别插回 `CatalogView.vue` 第 268 行、`viewer/index.vue` 第 215 行，并恢复 `h5-v2.css` 第 10 行样式 → 重建 `zjaq/web`。
2. 按钮高度：删除 `App.vue` 的 H5 新增规则块 → 重建 `zjaq/web`。
3. 补丁包内文件均为完整文件副本，可直接用备份原文件覆盖回滚。

## 8. 风险与边界

- 高度统一为 44px 与现有 `min-height:44px` 触控目标一致，不缩小可点击区域。
- 仅 H5 条件编译块内的 `uni-button` 选择器生效，小程序与 PC 门户不受影响。
- 不连接真实服务器、不改部署配置、不执行 git 提交。

## 9. 实施结果（2026-11-11）

### 9.1 实际改动

- `apps/mobile/src/components/CatalogView.vue`：删除页头 `<text class="v2-demo">本地演示</text>`。
- `apps/mobile/src/pages/viewer/index.vue`：删除页头 `<text class="v2-demo">本地演示</text>`。
- `apps/mobile/src/styles/h5-v2.css`：删除 `.h5-v2 .v2-demo` 规则。
- `apps/mobile/src/App.vue`：H5 条件块新增 `.v2-filters`、`.section-nav`、`.v2-view-controls`、`.v2-zoom-controls`、`.share-entry`、`.share-panel uni-button` 尺寸与垂直居中规则。
  - 追加处理用户新反馈：资料预览/详情页「分享资料/分享产品」入口及分享面板「复制链接 / 关闭」按钮，统一 `display:flex; align-items:center; justify-content:center; height/min-height:44px; line-height:1`。

### 9.2 实际验证

| 命令/方式 | 结果 |
| --- | --- |
| `apps/mobile/node_modules/.bin/vue-tsc.CMD --noEmit` | 通过，退出码 0 |
| `uni build -p h5` + `node ../../scripts/sync-preview-assets.mjs --h5` | 成功 |
| `uni build -p mp-weixin` | 成功；`app.wxss` 中 `uni-button`/`v2-filters uni-button` 均为 false |
| 构建产物检索 `本地演示`、`v2-demo` | 0 命中 |
| Playwright + 本机 Chrome 实测产品一览/资料中心 | 5 个筛选胶囊均为 44px，`line-height:12px`、`padding:0 14px` |
| 实测详情页 `.section-nav` | 4 个按钮均为 44px、`display:flex` |
| 实测详情页 `.share-entry` | 44px、`display:flex`，文字中心偏移 0px |
| 实测分享面板按钮 | 「复制链接」「关闭」均 44px、`display:flex`，文字中心偏移 0px |

未执行：git commit、服务器连接、镜像构建与部署。

### 9.3 补丁包

- 目录：`2026-11-11/demo-text-cleanup/outputs/`
- `zjaq-demo-text-and-h5-button-patch-2026-11-11.tar.gz`
- `zjaq-demo-text-and-h5-button-patch-2026-11-11.tar.gz.sha256`、`SHA256SUMS.txt`
- `PATCH-README.md`（含 `/home/zjaq` 重部署步骤、compose 命令、本机与外网 curl 验证、回滚）

