<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
onLaunch(() => {
  // #ifdef H5
  // Uni renders custom button elements; supply standard keyboard activation once.
  document.addEventListener('keydown', event => {
    if (event.defaultPrevented || !['Enter', ' '].includes(event.key)) return;
    const button = (event.target as HTMLElement | null)?.closest<HTMLElement>('uni-button[role="button"]');
    if (!button || button.hasAttribute('disabled') || button.getAttribute('aria-disabled') === 'true') return;
    event.preventDefault();
    button.click();
  });
  // #endif
});
</script>
<style>
@import "@zj/design-tokens/mobile.css";
@import "./styles/h5-v2.css";
@import "./styles/h5-v3.css";
/* #ifndef H5 */
@import "./styles/mp-overrides.css";
/* #endif */
page {
  background: var(--zj-color-canvas);
  color: var(--zj-color-text);
  font-family:
    system-ui,
    -apple-system,
    "PingFang SC",
    "Microsoft YaHei",
    sans-serif;
  font-size: var(--zj-font-size-body, 16px);
  line-height: 1.7;
}
button {
  box-sizing: border-box;
  font: inherit;
}
button::after {
  border: none;
}
/* #ifdef H5 */
/* Uni 在 H5 渲染 uni-button，并在运行时注入 ::after 的 1px 描边，整页会出现线框。
   该样式晚于本文件注入且同优先级，需 !important 才能覆盖。 */
uni-button::after {
  border: 0 !important;
}
/* Uni 在 H5 为 uni-button 注入 display:block、line-height:2.55555556 和 14px 左右内边距，
   会让筛选胶囊/按钮组比同一行的其他元素高出一截。这里按项目尺寸显式收敛，仅 H5 生效。 */
.h5-v2.v2-catalog .v2-filters uni-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  min-height: 44px;
  padding: 0 14px;
  font-size: 12px;
  line-height: 1;
  border-radius: 16px;
  box-sizing: border-box;
}
.h5-v2.v2-detail .section-nav uni-button,
.h5-v2.v2-viewer .v2-view-controls uni-button,
.h5-v2.v2-viewer .v2-zoom-controls uni-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  line-height: 1;
  box-sizing: border-box;
}
/* 分享入口与分享面板按钮只设了 min-height，uni-button 的默认行高会把文字顶在按钮上沿。 */
.h5-v2 .share-entry,
.h5-v2 .share-panel uni-button {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 44px;
  min-height: 44px;
  line-height: 1;
  box-sizing: border-box;
}
/* #endif */
</style>
