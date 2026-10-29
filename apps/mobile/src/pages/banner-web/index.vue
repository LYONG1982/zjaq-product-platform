<script setup lang="ts">
import { ref } from "vue";
import { onLoad } from "@dcloudio/uni-app";
const url = ref("");
onLoad((options) => {
  try {
    const value = decodeURIComponent(String(options?.url ?? ""));
    if (/^https:\/\/[a-z0-9.-]+(?::\d{1,5})?(?:[/?#]|$)/i.test(value)) url.value = value;
  } catch { url.value = ""; }
});
</script>
<template><web-view v-if="url" :src="url" /><view v-else>链接不可用，请返回首页。</view></template>
