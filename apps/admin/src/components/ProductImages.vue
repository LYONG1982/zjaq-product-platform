<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from "vue";
import type { DraftContent } from "@zj/contracts";
import { api } from "../api";
import { uploadFile } from "../upload";
type Media = DraftContent["media"][number];
type Item = { id: string; media?: Media; file?: File; url: string; alt: string; state: "ready" | "uploading" | "failed"; status: string };
const props = defineProps<{ modelValue: Media[]; productId: string }>();
const emit = defineEmits<{ "update:modelValue": [Media[]]; pending: [boolean]; busy: [boolean] }>();
const items = ref<Item[]>(props.modelValue.map(media => ({ id: media.mediaId, media, url: "", alt: media.alt, state: "ready", status: "" }))), error = ref("");
let alive = true;
const urls = new Set<string>();
function notify() {
  if (!alive) return;
  emit("update:modelValue", items.value.filter(item => item.media).map(item => ({ ...item.media!, alt: item.alt })));
  emit("pending", items.value.some(item => !item.media));
  emit("busy", items.value.some(item => item.state === "uploading"));
}
const queue: Item[] = [];
let running = false;
async function enqueue(item: Item) {
  if (queue.includes(item)) return;
  item.state = "uploading"; item.status = "等待上传…"; queue.push(item); notify();
  if (running) return;
  running = true;
  try { while (queue.length && alive) { const next = queue.shift()!; if (items.value.includes(next)) await upload(next); } } finally { running = false; }
}
async function upload(item: Item) {
  item.state = "uploading"; item.status = "准备上传…"; notify();
  try {
    const result = await uploadFile(props.productId, item.file!, "media", status => { item.status = status; });
    if (!alive || !items.value.includes(item)) return;
    item.media = { mediaId: item.id, assetId: result.assetId, role: "screenshot", alt: item.alt };
    item.state = "ready"; item.status = "上传完成，保存草稿后生效";
  } catch (caught) { item.state = "failed"; item.status = caught instanceof Error ? caught.message : "上传失败，请重试"; }
  finally { notify(); }
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement, files = Array.from(input.files ?? []); input.value = ""; error.value = "";
  for (const file of files) {
    if (items.value.some(item => item.file?.name === file.name && item.file.size === file.size && item.file.lastModified === file.lastModified)) continue;
    if (items.value.length >= 6) { error.value = "每款产品最多 6 张图片"; break; }
    if (!/\.(png|jpe?g|webp)$/i.test(file.name) || !file.size || file.size > 2_000_000) { error.value = file.name + "：请选择非空 JPG、PNG 或 WebP，单张不超过 2 MB"; continue; }
    const url = URL.createObjectURL(file); urls.add(url);
    items.value.push({ id: crypto.randomUUID(), file, url, alt: file.name.replace(/\.[^.]+$/, "").slice(0,300) || "产品介绍图片", state: "uploading", status: "准备上传…" });
    // Queue order is selection order, independently of request completion order.
    void enqueue(items.value[items.value.length - 1]);
  }
  notify();
}
function remove(item: Item) {
  items.value = items.value.filter(current => current.id !== item.id);
  if (item.url) { URL.revokeObjectURL(item.url); urls.delete(item.url); }
  notify();
}
onMounted(async () => {
  await Promise.all(items.value.filter(item => item.media).map(async item => {
    try {
      const request = api.assetRequest(props.productId, item.media!.assetId);
      const response = await fetch(request.url, { headers: request.headers, signal: AbortSignal.timeout(20000) });
      if (!response.ok) throw new Error();
      const blob = await response.blob();
      if (!alive || !items.value.includes(item)) return;
      item.url = URL.createObjectURL(blob); urls.add(item.url);
    } catch { item.status = "缩略图暂不可用，已保存的图片仍保留"; }
  }));
});
onBeforeUnmount(() => { alive = false; urls.forEach(url => URL.revokeObjectURL(url)); });
</script>
<template>
  <p class="helper">最多 6 张，单张不超过 2 MB；支持 JPG、PNG、WebP，建议 16:9 或 4:3，保留原比例。选择后自动上传，按选择顺序展示。</p>
  <label class="field">添加产品介绍图片<input type="file" multiple accept=".jpg,.jpeg,.png,.webp" :disabled="items.length >= 6" @change="choose" /></label>
  <p v-if="error" class="error-inline" role="alert">{{ error }}</p>
  <ol class="intro-image-list">
    <li v-for="(item, index) in items" :key="item.id">
      <img v-if="item.url" :src="item.url" :alt="item.alt" /><span v-else>图片 {{ index + 1 }}</span>
      <div><label class="field">图片 {{ index + 1 }} 描述<input v-model="item.alt" maxlength="300" @input="notify" /></label><p role="status">{{ item.status }}</p></div>
      <button v-if="item.state === 'failed'" type="button" @click="enqueue(item)">重试</button><button type="button" @click="remove(item)">移除图片 {{ index + 1 }}</button>
    </li>
  </ol>
</template>
<style scoped>
.intro-image-list { padding:0; list-style:none; }.intro-image-list li { display:flex; align-items:center; gap:16px; padding:16px 0; border-bottom:1px solid #e1e9f4; }.intro-image-list img { width:128px; max-height:120px; object-fit:contain; }.intro-image-list li > div { flex:1; min-width:0; }.intro-image-list p { font-size:12px; overflow-wrap:anywhere; }
</style>
