<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api, errorInfo } from "../api";
const props = defineProps<{ canManage: boolean }>();
const officialQr = ref<string | null>(null), serviceQr = ref<string | null>(null), phone = ref(""), version = ref(0), busy = ref(false), message = ref("");
async function load() {
  if (!props.canManage) return;
  try { const data = (await api.adminSiteContact()).data; officialQr.value = data.officialQr; serviceQr.value = data.serviceQr; phone.value = data.phone ?? ""; version.value = data.version; }
  catch (error) { message.value = errorInfo(error).message; }
}
function selectQr(event: Event, target: "official" | "service") {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file) return;
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size > 240 * 1024) { message.value = "请选择不超过 240 KiB 的 PNG 或 JPG 图片。"; return; }
  const reader = new FileReader();
  reader.onload = () => { if (target === "official") officialQr.value = typeof reader.result === "string" ? reader.result : null; else serviceQr.value = typeof reader.result === "string" ? reader.result : null; message.value = "图片已选择，请保存后生效。"; };
  reader.onerror = () => { message.value = "读取图片失败，请重试。"; };
  reader.readAsDataURL(file);
}
async function save() {
  busy.value = true; message.value = "";
  try { const data = (await api.updateSiteContact({ expectedVersion: version.value, officialQr: officialQr.value, serviceQr: serviceQr.value, phone: phone.value.trim() || null })).data; version.value = data.version; officialQr.value = data.officialQr; serviceQr.value = data.serviceQr; phone.value = data.phone ?? ""; message.value = "联系方式已保存。"; }
  catch (error) { message.value = errorInfo(error).message; }
  finally { busy.value = false; }
}
onMounted(load);
</script>
<template>
  <section v-if="canManage" class="table-card spaced contact-settings">
    <h2>联系方式配置</h2><p>二维码支持 PNG / JPG，每张不超过 240 KiB；未配置时前台显示占位。</p>
    <div class="contact-settings-grid">
      <div><h3>官方公众号</h3><img v-if="officialQr" :src="officialQr" alt="公众号二维码预览" /><p v-else>未上传</p><label>上传或替换公众号二维码<input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="selectQr($event, 'official')" /></label><button type="button" :disabled="busy || !officialQr" @click="officialQr = null">删除公众号二维码</button></div>
      <div><h3>客服微信</h3><img v-if="serviceQr" :src="serviceQr" alt="客服二维码预览" /><p v-else>未上传</p><label>上传或替换客服二维码<input type="file" accept="image/png,image/jpeg" :disabled="busy" @change="selectQr($event, 'service')" /></label><button type="button" :disabled="busy || !serviceQr" @click="serviceQr = null">删除客服二维码</button></div>
    </div>
    <label class="field">官方电话<input v-model="phone" type="tel" maxlength="32" :disabled="busy" placeholder="请输入官方电话" /></label>
    <button type="button" class="primary" :disabled="busy" @click="save">保存联系方式</button><p v-if="message" role="status">{{ message }}</p>
  </section>
</template>
<style scoped>
.contact-settings{padding:20px}.contact-settings-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:18px}.contact-settings-grid div{display:grid;gap:8px}.contact-settings-grid img{width:120px;height:120px;object-fit:contain}.contact-settings-grid label{display:grid;gap:6px}
</style>
