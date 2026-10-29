<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, errorInfo } from "../api";
const props = defineProps<{ canManage: boolean }>();
const imageData = ref<string | null>(null), link = ref(""), version = ref(0), busy = ref(false), message = ref("");
const startsAt = ref(""), endsAt = ref(""), introduction = ref(""), introLink = ref("");
const displayDate = (value?: string | null) => value ? new Date(Date.parse(value) + 8 * 3600000).toISOString().slice(0, 16) : "";
async function load() {
  if (!props.canManage) return;
  try { const result = (await api.adminSiteBanner()).data; imageData.value = result.imageData; link.value = result.link ?? ""; version.value = result.version; startsAt.value = displayDate(result.startsAt); endsAt.value = displayDate(result.endsAt); introduction.value = result.introduction ?? ""; introLink.value = result.introLink ?? ""; }
  catch (error) { message.value = errorInfo(error).message; }
}
function selectFile(event: Event) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 400 * 1024) { message.value = "请选择不超过 400 KiB 的 PNG 或 JPG 图片。"; return; }
  const reader = new FileReader();
  reader.onload = () => { imageData.value = typeof reader.result === "string" ? reader.result : null; message.value = "图片已选择，请保存后生效。"; };
  reader.onerror = () => { message.value = "读取图片失败，请重试。"; };
  reader.readAsDataURL(file);
}
async function save() {
  busy.value = true; message.value = "";
  try { const result = (await api.updateSiteBanner({ expectedVersion: version.value, imageData: imageData.value, link: link.value.trim() || null, startsAt: startsAt.value ? startsAt.value + ":00+08:00" : null, endsAt: endsAt.value ? endsAt.value + ":00+08:00" : null, introduction: introduction.value.trim() || null, introLink: introLink.value.trim() || null })).data; version.value = result.version; imageData.value = result.imageData; link.value = result.link ?? ""; message.value = "Banner 已保存。"; }
  catch (error) { message.value = errorInfo(error).message; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <section v-if="canManage" class="table-card spaced banner-settings">
    <h2>小程序首页 Banner</h2>
    <p>图片支持 PNG / JPG，最大 400 KiB。支持 HTTPS 链接或小程序产品、资料页面路径；微信打开外部链接需要配置业务域名。</p>
    <img v-if="imageData" :src="imageData" alt="当前 Banner 预览" class="banner-preview" />
    <p v-else>尚未配置 Banner，首页不会显示空白占位。</p>
    <label class="field">上传或替换图片<input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="selectFile" /></label>
    <label class="field">跳转链接（可选）<input v-model="link" maxlength="2048" placeholder="https://... 或 /pages/products/index" :disabled="busy" /></label>
    <div class="form-grid"><label class="field">Banner 开始时间（北京时间，可选）<input v-model="startsAt" type="datetime-local" :disabled="busy" /></label><label class="field">Banner 结束时间（北京时间，可选）<input v-model="endsAt" type="datetime-local" :disabled="busy" /></label></div>
    <p>不填有效期时持续展示；开始前和结束后自动隐藏图片。</p>
    <label class="field">首页介绍位文字（可选）<input v-model="introduction" maxlength="120" :disabled="busy" placeholder="例如：了解中技安全" /></label>
    <label class="field">首页介绍位链接（可选）<input v-model="introLink" maxlength="2048" :disabled="busy" placeholder="https://..." /></label>
    <div class="banner-actions"><button type="button" :disabled="busy || !imageData" @click="imageData = null">移除图片</button><button type="button" class="primary" :disabled="busy" @click="save">保存 Banner</button></div>
    <p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<style scoped>
.banner-settings{padding:20px}.banner-preview{display:block;width:min(100%,640px);max-height:220px;object-fit:contain;background:#f4f7fa;margin:12px 0}.banner-actions{display:flex;gap:10px;margin-top:12px}
</style>
