<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Domain } from "@zj/contracts";
import Modal from "./Modal.vue";
import AssetViewer from "./AssetViewer.vue";
import { api, errorInfo } from "../api";
const props = defineProps<{ productId: string }>();
const emit = defineEmits<{ close: [] }>();
const rows = ref<Domain["MaterialRef"][]>([]), next = ref<string | null>(null), loading = ref(false), error = ref(""), selected = ref<Domain["MaterialRef"] | null>(null);
async function load(append = false) {
  loading.value = true; error.value = "";
  try { const result = await api.materialVersions(props.productId, { cursor: append ? next.value ?? undefined : undefined }); rows.value = append ? [...rows.value, ...result.data] : result.data; next.value = result.page.nextCursor; }
  catch (e) { error.value = errorInfo(e).message; }
  finally { loading.value = false; }
}
onMounted(() => void load());
</script>
<template>
  <Modal title="资料历史版本" wide @close="emit('close')">
    <p>这里显示已保存的版本，包括从草稿移除的资料；未保存的修改不在列表中。</p>
    <p v-if="error" role="alert">{{ error }}</p><p v-if="loading">正在读取…</p><p v-else-if="!rows.length">暂无已保存的资料版本。</p>
    <div v-for="item in rows" :key="item.versionId" class="history-line"><span>{{ item.name }} · {{ item.versionLabel }}</span><button @click="selected = item">预览</button></div>
    <button v-if="next" :disabled="loading" @click="load(true)">加载更多</button>
    <template #footer><button @click="emit('close')">关闭</button></template>
  </Modal>
  <Modal v-if="selected" :title="`历史预览：${selected.name} ${selected.versionLabel}`" wide @close="selected = null">
    <AssetViewer :product-id="productId" :kind="selected.preview.kind" :asset-ids="selected.preview.kind !== 'images' ? [selected.preview.assetId] : selected.preview.pages.map((page) => page.assetId)" />
    <template #footer><button @click="selected = null">关闭预览</button></template>
  </Modal>
</template>
<style scoped>.history-line{display:flex;justify-content:space-between;gap:20px;align-items:center;border-top:1px solid #e4e9ef;padding:12px 0}</style>
