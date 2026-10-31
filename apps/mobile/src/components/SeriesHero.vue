<script setup lang="ts">
import { computed } from "vue";
import { seriesThemes, seriesStyle } from "../series-display";
const props = defineProps<{ categoryId: string; name: string; detail?: boolean }>();
const theme = computed(() => seriesThemes[props.categoryId]);
</script>
<template>
  <view class="v2-series-hero" :style="seriesStyle(categoryId)">
    <image v-if="theme" class="v2-hero-pattern" :src="'/static/h5/figma/' + theme.pattern" mode="aspectFit" aria-hidden="true" />
    <image v-if="theme" class="v2-hero-icon" :src="'/static/series/' + categoryId + '.png'" mode="aspectFit" aria-hidden="true" />
    <text class="v2-hero-name">{{ theme?.name ?? name }}</text>
    <text class="v2-hero-description">{{ theme?.description ?? name }}</text>
    <text class="v2-hero-narrative">{{ detail ? '中技于密，安全于行。' : theme?.narrative }}</text>
  </view>
</template>
