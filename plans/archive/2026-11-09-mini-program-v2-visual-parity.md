# 小程序对齐 H5 v2/v3 视觉（2026-11-09）

状态：已实施并通过构建验证；小程序视觉需在微信开发者工具逐页确认。用户于 2026-11-09 确认「完整移植 v2/v3」。

## 原因

- H5 使用 `#ifdef H5` 的 v2 模板与 `styles/h5-v2.css`、`h5-v3.css`；小程序走 `#ifndef H5` 的另一套旧模板，仅组件内旧样式。
- 小程序构建忽略 `static/h5/`，v2 依赖的系列插画、默认 Banner、搜索图标不会进包。
- 改造前小程序 `app.wxss` 1.6 KB、v2 规则 0 条。

## 实施

1. 新增 `apps/mobile/src/static/shared/`：`series-v3/*.webp`、`brand/default-banner.png`、`figma/search.svg`，并更新 `SeriesArtwork.vue`、`CatalogView.vue` 引用。
2. `App.vue`：`h5-v2.css`、`h5-v3.css` 改为全端引入；新增 `styles/mp-overrides.css`（仅 `#ifndef H5`），处理原生 tabBar 底部占位、安全区、`aspect-ratio` 兜底、触控态。
3. `CatalogView.vue`：删除旧 `#ifndef H5` 模板，统一 v2 模板；`SeriesArtwork` 改为全端导入；`H5BottomNav` 仍仅 H5。
4. `pages/detail/index.vue`：删除旧模板；`SeriesHero` 全端导入；`SharePanel` 仍仅 H5。
5. `pages/viewer/index.vue`：统一 v2 外壳（标题、错误、视频、页码、所属产品）；PDF.js 画布与缩放仅 H5；小程序保留图片预览与 `wx.openDocument` PDF 打开方式，并新增 `.v2-image-page`、`.v2-native-pdf` 样式。

## 附带修复（经用户确认）

H5 PDF 预览报 `Map.getOrInsertComputed is not a function`（pdfjs-dist 6.4 使用浏览器尚未实现的方法）：

- `packages/api-client/src/preview.ts` 改用 `pdfjs-dist/legacy/build/pdf.mjs`。
- `scripts/sync-preview-assets.mjs` 改用 `legacy/build/pdf.worker.min.mjs`（1,321,307 字节，自带 core-js polyfill）。
- 已清空 `apps/mobile/node_modules/.vite` 并重启验证。

## 验证结果

| 项目 | 结果 |
| --- | --- |
| `pnpm --filter @zj/mobile check` | 通过 |
| 小程序构建 | 通过；`app.wxss` 24,702 字节，v2 规则 186 条（改造前 1.6 KB / 0 条） |
| 小程序产物 | `static/shared/` 已包含 4 张系列插画、默认 Banner、搜索图标；JS 中 `window.`/`document.` 引用 0 处 |
| 小程序编译标记 | `CatalogView.wxml` 已使用 `h5-v2`/`v2-series-grid`/`v2-product-card`，旧 `mobile-body` 不再出现 |
| H5 构建 | 通过；`dist/build/h5/pdf/pdf.worker.min.mjs` 为 legacy 版本 |
| H5 首页 | 浏览器验证通过：Banner、搜索框、系列卡片、产品列表正常，控制台无异常 |
| H5 详情页 | 浏览器验证通过：Hero、分区导航、产品资料正常 |
| H5 PDF 预览 | 修复后验证通过：26 页正常渲染，翻页到第 2 页成功，无 `getOrInsertComputed` 报错 |

## 未完成

- 微信开发者工具内的逐页视觉确认（首页、产品、资料、详情、预览）需人工执行；本机无自动化渲染小程序能力。
- 小程序真机、微信送审不在本轮范围。

## 不做

- 未改接口、数据结构、权限、上传流程；未改后台与门户；未新增依赖。
