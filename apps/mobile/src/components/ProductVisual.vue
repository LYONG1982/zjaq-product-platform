<script setup lang="ts">
import { ref, watch } from "vue";
import { resourceUrl } from "../api";
const props = defineProps<{
  path?: string | null;
  alt: string;
  large?: boolean;
  categoryId?: string;
}>();
const failed = ref(false);
watch(
  () => props.path,
  () => {
    failed.value = false;
  },
);
</script>
<template>
  <view :class="['product-visual', { large, failed }]">
    <image
      v-if="path && !failed"
      :src="resourceUrl(path)"
      :alt="alt"
      mode="aspectFit"
      :lazy-load="true"
      @error="failed = true"
    />
    <image v-else-if="categoryId && ['miding', 'miyi', 'mishu', 'ai'].includes(categoryId)" :src="'/static/series/' + categoryId + '.png'" mode="aspectFit" class="series-icon" aria-hidden="true" />
    <view v-else class="visual-symbol" aria-hidden="true"
      ><view /><view /><view
    /></view>
    <view v-if="large && failed" class="visual-error"
      ><text>图片暂不可用</text
      ><button @click.stop="failed = false">重试图片</button></view
    >
  </view>
</template>
<style scoped>
.product-visual {
  width: 64px;
  height: 64px;
  flex: none;
  border-radius: 12px;
  background: var(--zj-color-brand-soft);
  display: flex;
  align-items: center;
  justify-content: center;
  position: relative;
  overflow: hidden;
}
.product-visual image {
  width: 100%;
  height: 100%;
}
.visual-symbol {
  width: 26px;
  height: 32px;
  border: 2px solid var(--zj-color-brand);
  border-radius: 4px;
  padding: 7px 5px;
  box-sizing: border-box;
}
.visual-symbol view {
  height: 2px;
  background: var(--zj-color-brand);
  margin-bottom: 4px;
}
.visual-symbol view:last-child {
  width: 60%;
}
.large {
  width: 100%;
  height: 220px;
}
.large .visual-symbol {
  opacity: 0.7;
}
.visual-error {
  position: absolute;
  bottom: 16px;
  font-size: 14px;
  color: var(--zj-color-text-secondary);
}
.large.failed {
  height: 120px;
  justify-content: flex-start;
  padding-left: 24px;
  box-sizing: border-box;
}
.visual-error {
  left: 72px;
  bottom: auto;
  display: flex;
  align-items: center;
  gap: 12px;
}
.visual-error button {
  font-size: 14px;
  line-height: 44px;
  padding: 0 8px;
  margin: 0;
  background: transparent;
  color: var(--zj-color-brand-hover);
}
</style>
