<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { getSeriesVisual } from "../series-display";
const props = defineProps<{ categoryId: string; eager?: boolean }>();
const theme = computed(() => getSeriesVisual(props.categoryId));
const failed = ref(false);
watch(() => theme.value.assetFile, () => { failed.value = false; });
</script>
<template>
  <view class="v3-series-artwork" aria-hidden="true">
    <image v-if="theme.assetFile && !failed" :key="theme.assetFile" :src="'/static/h5/series-v3/' + theme.assetFile" mode="aspectFit" :lazy-load="!eager" @error="failed = true" />
  </view>
</template>
