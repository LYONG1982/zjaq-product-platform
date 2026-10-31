<script setup lang="ts">
import { computed } from "vue";
import { getSeriesVisual, seriesStyle } from "../series-display";
import SeriesArtwork from "./SeriesArtwork.vue";
const props = defineProps<{ categoryId: string; name: string; detail?: boolean }>();
const theme = computed(() => getSeriesVisual(props.categoryId));
</script>
<template>
  <view class="v2-series-hero" :style="seriesStyle(categoryId)">
    <SeriesArtwork :category-id="categoryId" eager />
    <view class="v3-hero-copy">
      <text class="v2-hero-name">{{ theme.name || name }}</text>
      <text class="v2-hero-description">{{ theme.description || name }}</text>
      <text class="v2-hero-narrative">{{ detail ? '中技于密，安全于行。' : theme.narrative }}</text>
    </view>
  </view>
</template>
