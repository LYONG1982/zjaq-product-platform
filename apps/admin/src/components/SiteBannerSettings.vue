<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api, errorInfo } from "../api";
type BannerItem = Responses["SiteBanner"]["items"][number];
const props = defineProps<{ canManage: boolean }>();
const items = ref<BannerItem[]>([]), version = ref(0), busy = ref(false), message = ref("");
const introduction = ref(""), introLink = ref(""), defaultImageUrl = ref("");
const displayDate = (value?: string | null) => value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : "";
function toApiDate(value: string) { return value ? value + ":00+08:00" : null; }
async function load() {
  if (!props.canManage) return;
  try { const result = (await api.adminSiteBanner()).data; items.value = result.items; version.value = result.version; introduction.value = result.introduction ?? ""; introLink.value = result.introLink ?? ""; defaultImageUrl.value = api.siteBannerDefaultImageUrl(); }
  catch (error) { message.value = errorInfo(error).message; }
}
function selectFile(id: string, event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 400 * 1024) { message.value = "请选择不超过 400 KiB 的 PNG 或 JPG 图片。"; return; }
  const reader = new FileReader();
  reader.onload = () => { const item = items.value.find(row => row.id === id); if (item) item.imageData = typeof reader.result === "string" ? reader.result : null; message.value = "图片已选择，请保存后生效。"; };
  reader.onerror = () => { message.value = "读取图片失败，请重试。"; };
  reader.readAsDataURL(file);
}
function addItem() {
  if (items.value.filter(item => !item.isDefault).length >= 5) { message.value = "最多添加 5 张自定义 Banner。"; return; }
  items.value.push({ id: crypto.randomUUID(), isDefault: false, imagePath: null, imageData: null, link: null, startsAt: null, endsAt: null });
  message.value = "已新增自定义页，请上传图片并保存。";
}
function removeItem(id: string) {
  if (!confirm("确定删除这张自定义 Banner？保存后将从首页移除。")) return;
  items.value = items.value.filter(item => item.id !== id);
}
async function save() {
  busy.value = true; message.value = "";
  try {
    const writeItems = items.value.map(item => item.isDefault ? ({ id: "default", imageData: null, link: null, startsAt: null, endsAt: null }) : ({
      id: item.id, imageData: item.imageData, link: item.link?.trim() || null,
      startsAt: toApiDate((item as BannerItem & { startsAtLocal?: string }).startsAtLocal ?? displayDate(item.startsAt)),
      endsAt: toApiDate((item as BannerItem & { endsAtLocal?: string }).endsAtLocal ?? displayDate(item.endsAt)),
    }));
    const result = (await api.updateSiteBanner({ expectedVersion: version.value, items: writeItems, introduction: introduction.value.trim() || null, introLink: introLink.value.trim() || null })).data;
    items.value = result.items; version.value = result.version; message.value = "Banner 列表已保存。";
  } catch (error) { message.value = errorInfo(error).message; }
  finally { busy.value = false; }
}
function setDate(id: string, field: "startsAt" | "endsAt", value: string) {
  const item = items.value.find(row => row.id === id); if (item) (item as BannerItem & Record<string, unknown>)[field + "Local"] = value;
}
function getDate(item: BannerItem, field: "startsAt" | "endsAt") {
  return (item as BannerItem & Record<string, unknown>)[field + "Local"] as string | undefined ?? displayDate(item[field]);
}
onMounted(load);
</script>
<template>
  <section v-if="canManage" class="table-card spaced banner-settings">
    <h2>小程序首页 Banner</h2>
    <p>默认首张固定显示且不可删除。后续自定义页最多 5 张，支持 PNG / JPG（每张不超过 400 KiB）、HTTPS 或小程序页面链接与有效期。</p>
    <article v-for="(item, index) in items" :key="item.id" class="banner-item">
      <header><strong>{{ item.isDefault ? '默认首张' : '自定义 Banner ' + index }}</strong><span v-if="item.isDefault" class="badge">不可删除、不可停用</span></header>
      <img v-if="item.imageData || (item.isDefault ? defaultImageUrl : item.imagePath)" :src="item.imageData || (item.isDefault ? defaultImageUrl : item.imagePath) || ''" :alt="item.isDefault ? '默认 Banner 预览' : '自定义 Banner 预览'" class="banner-preview" />
      <div v-else class="banner-placeholder">尚未选择图片，请上传 PNG 或 JPG 图片。</div>
      <template v-if="!item.isDefault">
        <label class="field">上传或替换图片<input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="selectFile(item.id, $event)" /></label>
        <label class="field">跳转链接（可选）<input v-model="item.link" maxlength="2048" placeholder="https://... 或 /pages/products/index" :disabled="busy" /></label>
        <div class="form-grid"><label class="field">开始时间（北京时间，可选）<input :value="getDate(item, 'startsAt')" type="datetime-local" :disabled="busy" @input="setDate(item.id, 'startsAt', ($event.target as HTMLInputElement).value)" /></label><label class="field">结束时间（北京时间，可选）<input :value="getDate(item, 'endsAt')" type="datetime-local" :disabled="busy" @input="setDate(item.id, 'endsAt', ($event.target as HTMLInputElement).value)" /></label></div>
        <button type="button" :disabled="busy" @click="removeItem(item.id)">删除自定义页</button>
      </template>
      <p v-else>随应用内置原图，长期有效，始终位于首位。</p>
    </article>
    <div class="banner-actions"><button type="button" :disabled="busy || items.filter(item => !item.isDefault).length >= 5" @click="addItem">新增自定义 Banner</button><button type="button" class="primary" :disabled="busy" @click="save">保存 Banner 列表</button></div>
    <hr />
    <h3>首页介绍位</h3>
    <label class="field">介绍文字（可选）<input v-model="introduction" maxlength="120" :disabled="busy" placeholder="例如：了解中技安全" /></label>
    <label class="field">介绍链接（可选）<input v-model="introLink" maxlength="2048" :disabled="busy" placeholder="https://..." /></label>
    <p>链接仅在填写介绍文字后生效。</p>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<style scoped>
.banner-settings{padding:20px}.banner-item{border:1px solid #dfe5eb;border-radius:10px;padding:16px;margin:14px 0}.banner-item header{display:flex;align-items:center;gap:10px}.badge{border-radius:999px;background:#eaf3ff;color:#255d96;padding:4px 9px;font-size:12px}.banner-preview{display:block;width:min(100%,640px);max-height:220px;object-fit:contain;background:#f4f7fa;margin:12px 0}.banner-placeholder{display:grid;place-items:center;width:min(100%,640px);min-height:100px;margin:12px 0;background:#f4f7fa;color:#687684;border-radius:8px}.banner-actions{display:flex;gap:10px;margin-top:12px}
</style>
