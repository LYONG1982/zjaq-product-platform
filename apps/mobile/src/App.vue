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
/* #ifdef H5 */
@import "./styles/h5-v2.css";
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
</style>
