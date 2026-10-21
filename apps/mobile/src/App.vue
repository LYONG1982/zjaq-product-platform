<script setup lang="ts">
import { onLaunch } from "@dcloudio/uni-app";
onLaunch(() => {});
</script>
<style>
@import "@zj/design-tokens/mobile.css";
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
