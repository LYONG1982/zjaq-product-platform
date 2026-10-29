<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api, errorInfo } from "../api";
const rows = ref<Responses["FeedbackItem"][]>([]), next = ref<string | null>(null), loading = ref(false), error = ref("");
async function load(append = false) {
  loading.value = true; error.value = "";
  try { const result = await api.feedback({ cursor: append ? next.value ?? undefined : undefined }); rows.value = append ? [...rows.value, ...result.data] : result.data; next.value = result.page.nextCursor; }
  catch (e) { error.value = errorInfo(e).message; }
  finally { loading.value = false; }
}
onMounted(() => void load());
</script>
<template><section class="table-card spaced"><div class="toolbar"><h2>建议反馈</h2><button type="button" :disabled="loading" @click="load()">刷新</button></div><p v-if="error" role="alert">{{ error }}</p><p v-if="!rows.length && !loading">暂无反馈。</p><div v-if="rows.length" class="table-scroll"><table><thead><tr><th>时间</th><th>建议内容</th><th>联系方式</th></tr></thead><tbody><tr v-for="item in rows" :key="item.feedbackId"><td>{{ new Date(item.createdAt).toLocaleString() }}</td><td class="feedback-text">{{ item.content }}</td><td>{{ item.contact || '未填写' }}</td></tr></tbody></table></div><button v-if="next" :disabled="loading" @click="load(true)">加载更多</button></section></template>
<style scoped>.feedback-text{white-space:pre-wrap;overflow-wrap:anywhere;max-width:500px}</style>
