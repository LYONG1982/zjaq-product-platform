<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api } from "../api";
const notice = ref<Responses["AnalyticsNotice"]>();
let recorded = false;
// This identifier only deduplicates one viewer open. It is not an identity or an access credential.
const viewId = "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (part) => { const value = Math.floor(Math.random() * 16); return (part === "x" ? value : (value & 3) | 8).toString(16); });
const ready = api.analyticsNotice().then((result) => { notice.value = result.data; }).catch(() => {});
onMounted(() => ready);
async function record(manifest?: Responses["PreviewManifest"]) {
  await ready;
  if (!notice.value?.viewEnabled || recorded || !manifest) return;
  recorded = true;
  let client: "H5" | "WECHAT" = "H5";
  // #ifdef MP-WEIXIN
  client = "WECHAT";
  // #endif
  try { await api.submitAnalyticsView({ productId: manifest.productId, materialId: manifest.materialId, releaseId: manifest.releaseId, versionId: manifest.versionId, viewId, client }); }
  catch { recorded = false; } // Telemetry failure must never interrupt reading.
}
defineExpose({ record });
</script>
<template><view v-if="notice?.viewEnabled" class="analytics-notice" role="note"><text>{{ notice.notice }}</text></view></template>
<style scoped>.analytics-notice{display:block;font-size:12px;line-height:1.6;color:#c7d6df;background:#223946;border-radius:6px;padding:10px 12px;margin:12px 0;overflow-wrap:anywhere}</style>
