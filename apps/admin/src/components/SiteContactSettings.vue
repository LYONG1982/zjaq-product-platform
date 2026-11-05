<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api, errorInfo } from "../api";
import Modal from "./Modal.vue";

const props = defineProps<{ canManage: boolean }>();
type QrKey = "officialQr" | "serviceQr";
type ContactForm = { officialQr: string | null; serviceQr: string | null; phone: string };
const slots: { key: QrKey; title: string; uploadLabel: string }[] = [
  { key: "officialQr", title: "官方公众号", uploadLabel: "上传或替换公众号二维码" },
  { key: "serviceQr", title: "客服微信", uploadLabel: "上传或替换客服二维码" },
];
const form = reactive<ContactForm>({ officialQr: null, serviceQr: null, phone: "" });
const saved = ref<ContactForm | null>(null), version = ref(0), ready = ref(false);
const loading = ref(false), saving = ref(false), message = ref(""), error = ref(""), conflict = ref(false), readFailed = ref(false);
const reading = reactive<Record<QrKey, boolean>>({ officialQr: false, serviceQr: false });
const imageErrors = reactive<Record<QrKey, string>>({ officialQr: "", serviceQr: "" });
const readSequence: Record<QrKey, number> = { officialQr: 0, serviceQr: 0 };
const readingAny = computed(() => reading.officialQr || reading.serviceQr);
const dirty = computed(() => readingAny.value || !!saved.value && JSON.stringify(form) !== JSON.stringify(saved.value));
const blocked = computed(() => !ready.value || loading.value || saving.value);
const previewSlots = computed(() => slots.filter(slot => form[slot.key]));
const hasPreview = computed(() => previewSlots.value.length > 0 || !!form.phone.trim());
const preview = ref<{ src: string; title: string } | null>(null), leaveOpen = ref(false);
let pendingLeave: (() => void) | undefined, disposed = false;

function accept(data: Responses["SiteContact"]) {
  for (const { key } of slots) { readSequence[key]++; reading[key] = false; imageErrors[key] = ""; }
  Object.assign(form, { officialQr: data.officialQr, serviceQr: data.serviceQr, phone: data.phone ?? "" });
  saved.value = { ...form }; version.value = data.version; ready.value = true; conflict.value = false;
}
async function load() {
  if (!props.canManage || loading.value || saving.value) return;
  loading.value = true; message.value = ""; error.value = ""; readFailed.value = false;
  try { const data = (await api.adminSiteContact()).data; if (!disposed) accept(data); }
  catch (cause) { if (!disposed) { readFailed.value = true; error.value = errorInfo(cause).message; } }
  finally { if (!disposed) loading.value = false; }
}
function readImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("读取图片失败，请重新选择。"));
    reader.onload = () => {
      if (typeof reader.result !== "string") { reject(new Error("读取图片失败，请重新选择。")); return; }
      const src = reader.result, image = new Image();
      image.onload = () => image.naturalWidth && image.naturalHeight
        ? resolve(src) : reject(new Error("图片无法读取，请选择完整的 PNG 或 JPG 图片。"));
      image.onerror = () => reject(new Error("图片无法读取，请选择完整的 PNG 或 JPG 图片。"));
      image.src = src;
    };
    reader.readAsDataURL(file);
  });
}
async function selectQr(event: Event, key: QrKey) {
  const input = event.target as HTMLInputElement, file = input.files?.[0]; input.value = "";
  if (!file || blocked.value) return;
  const current = ++readSequence[key]; reading[key] = false; imageErrors[key] = ""; message.value = "";
  if (!["image/png", "image/jpeg"].includes(file.type) || file.size === 0 || file.size > 240 * 1024) {
    imageErrors[key] = "请选择不超过 240 KiB 的 PNG 或 JPG 图片。"; return;
  }
  reading[key] = true;
  try {
    const src = await readImage(file);
    if (!disposed && current === readSequence[key]) form[key] = src;
  } catch (cause) {
    if (!disposed && current === readSequence[key]) imageErrors[key] = errorInfo(cause).message;
  } finally { if (!disposed && current === readSequence[key]) reading[key] = false; }
}
function removeQr(key: QrKey) {
  readSequence[key]++; reading[key] = false; form[key] = null; imageErrors[key] = ""; message.value = "";
}
function reset() {
  if (!saved.value || saving.value || loading.value) return;
  accept({ ...saved.value, phone: saved.value.phone || null, version: version.value });
  message.value = "已撤销本次修改。"; error.value = "";
}
function qrStatus(key: QrKey) {
  if (reading[key]) return "正在读取图片…";
  if (!form[key]) return saved.value?.[key] ? "待移除，保存后生效" : "未上传，前台隐藏此项";
  return form[key] === saved.value?.[key] ? "已保存" : "已选择，尚未保存";
}
async function save(): Promise<boolean> {
  if (blocked.value || readingAny.value || !dirty.value) return false;
  saving.value = true; message.value = ""; error.value = ""; conflict.value = false;
  try {
    const data = (await api.updateSiteContact({ expectedVersion: version.value, ...form, phone: form.phone.trim() || null })).data;
    if (disposed) return false;
    accept(data); message.value = "已保存，H5 新打开或刷新页面后显示最新内容。"; return true;
  } catch (cause) {
    if (!disposed) {
      const info = errorInfo(cause); conflict.value = info.conflict;
      error.value = info.conflict ? "联系方式已被其他管理员修改。本次内容仍保留，请重新读取最新配置后再编辑。" : info.message;
    }
    return false;
  } finally { if (!disposed) saving.value = false; }
}
function requestLeave(action: () => void) {
  if (saving.value || loading.value) { message.value = "正在处理联系方式，请稍候再操作。"; return; }
  if (!dirty.value) { action(); return; }
  preview.value = null; pendingLeave = action; leaveOpen.value = true;
}
function cancelLeave() { leaveOpen.value = false; pendingLeave = undefined; }
function discardLeave() {
  const action = pendingLeave; reset(); cancelLeave(); action?.();
}
async function saveLeave() {
  const action = pendingLeave;
  if (await save()) { cancelLeave(); action?.(); }
}
function beforeUnload(event: BeforeUnloadEvent) {
  if (dirty.value) { event.preventDefault(); event.returnValue = ""; }
}
onMounted(() => { void load(); window.addEventListener("beforeunload", beforeUnload); });
onBeforeUnmount(() => {
  disposed = true; readSequence.officialQr++; readSequence.serviceQr++;
  window.removeEventListener("beforeunload", beforeUnload);
});
defineExpose({ requestLeave });
</script>

<template>
  <section v-if="canManage" id="h5-footer-contact" class="table-card spaced contact-settings" aria-labelledby="contact-settings-title">
    <div class="contact-heading"><div><h2 id="contact-settings-title">H5 底部联系方式</h2><p>上传公众号与客服微信的二维码图片，保存后统一展示在 H5 首页和产品详情底部。</p></div><span class="contact-scope">首页 · 产品详情</span></div>
    <p v-if="loading" role="status">正在读取联系方式…</p>
    <div v-if="error" class="contact-error" role="alert"><p>{{ error }}</p><button v-if="!ready || conflict || readFailed" type="button" :disabled="loading || saving" @click="requestLeave(load)">{{ conflict ? '重新读取最新配置' : '重新加载' }}</button></div>
    <div class="contact-layout">
      <div class="contact-edit">
        <div class="contact-settings-grid">
          <div v-for="slot in slots" :key="slot.key" class="contact-upload-card" :data-qr="slot.key">
            <h3>{{ slot.title }}</h3>
            <div class="contact-thumbnail"><img v-if="form[slot.key]" :src="form[slot.key]!" :alt="slot.title + '二维码预览'" /><span v-else>未上传</span></div>
            <p class="contact-upload-state" :class="{ pending: ready && (reading[slot.key] || form[slot.key] !== saved?.[slot.key]) }">{{ qrStatus(slot.key) }}</p>
            <label class="contact-file-button" :class="{ disabled: blocked }">{{ slot.uploadLabel }}<input type="file" accept="image/png,image/jpeg" :disabled="blocked" @change="selectQr($event, slot.key)" /></label>
            <div class="contact-image-actions"><button type="button" :disabled="!form[slot.key] || blocked" @click="preview = { src: form[slot.key]!, title: slot.title + '二维码' }">查看大图</button><button type="button" :disabled="(!form[slot.key] && !reading[slot.key]) || blocked" @click="removeQr(slot.key)">移除</button></div>
            <p v-if="imageErrors[slot.key]" class="contact-image-error" role="alert">{{ imageErrors[slot.key] }}</p>
          </div>
        </div>
        <p class="helper">PNG / JPG，每张 ≤240 KiB。请保留完整二维码及四周留白，上传清晰原图。</p>
        <label class="field">官方电话<input v-model="form.phone" type="tel" maxlength="32" :disabled="blocked" placeholder="请输入官方电话" /></label>
      </div>
      <aside class="contact-preview" aria-label="H5 展示预览">
        <div class="contact-preview-heading"><h3>H5 展示预览</h3><span>预览，保存后生效</span></div>
        <div v-if="hasPreview" class="contact-phone-preview">
          <h4>与我们联系</h4>
          <template v-if="form.phone.trim()"><p class="preview-number">{{ form.phone.trim() }}</p><span class="preview-call">拨打电话 ↗</span></template>
          <div v-if="previewSlots.length" class="preview-qrs" :class="{ single: previewSlots.length === 1 }">
            <div v-for="slot in previewSlots" :key="slot.key" class="preview-qr"><img :src="form[slot.key]!" :alt="slot.title + '展示效果'" /><strong>{{ slot.title }}</strong><span>点击查看大图</span></div>
          </div>
        </div>
        <p v-else class="contact-preview-empty">尚未配置联系方式，前台将隐藏整个联系区域。</p>
        <p class="helper">仅上传一张时居中显示；未上传的二维码不会显示占位。</p>
      </aside>
    </div>
    <div class="contact-save-area"><p :class="dirty ? 'pending' : 'helper'">{{ dirty ? '有未保存修改' : ready ? '当前配置已保存' : '读取成功后可编辑' }}</p><p class="helper">保存后，前台将不再显示已移除的二维码。</p><div class="contact-save-actions"><button type="button" class="primary" :disabled="blocked || readingAny || !dirty" @click="save">{{ saving ? '保存中…' : '保存并生效' }}</button><button type="button" :disabled="blocked || !dirty" @click="reset">撤销本次修改</button></div><p v-if="message" role="status">{{ message }}</p></div>
  </section>
  <Modal v-if="preview" :title="preview.title" @close="preview = null"><img class="contact-full-image" :src="preview.src" :alt="preview.title" /><p class="helper">请核对二维码完整、清晰，四周留白未被裁切。</p></Modal>
  <Modal v-if="leaveOpen" title="有未保存的联系方式" :busy="saving" @close="cancelLeave"><p>当前选图或电话修改尚未保存，离开后会丢失。</p><p v-if="error" class="contact-image-error" role="alert">{{ error }}</p><template #footer><button :disabled="saving" @click="cancelLeave">继续编辑</button><button :disabled="saving" @click="discardLeave">放弃修改并继续</button><button class="primary" :disabled="saving || readingAny" @click="saveLeave">保存并继续</button></template></Modal>
</template>

<style scoped>
.contact-settings{padding:24px;scroll-margin-top:24px}.contact-heading{display:flex;gap:16px;justify-content:space-between;align-items:flex-start}.contact-heading h2{margin:0 0 8px}.contact-heading p{margin:0;color:#52657b;line-height:1.7}.contact-scope{flex-shrink:0;background:#edf4ff;color:#245aa7;border-radius:16px;padding:6px 12px;font-size:12px}.contact-layout{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(280px,1fr);gap:24px;margin-top:24px}.contact-edit{min-width:0}.contact-settings-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px}.contact-upload-card{border:1px solid #dbe4ef;border-radius:16px;padding:16px;min-width:0}.contact-upload-card h3{margin:0 0 12px;font-size:15px}.contact-thumbnail{height:144px;display:flex;align-items:center;justify-content:center;background:#f5f7fb;border:1px dashed #c9d5e5;border-radius:12px}.contact-thumbnail img{max-width:128px;max-height:128px;object-fit:contain;background:white}.contact-thumbnail span{color:#64748b;font-size:13px}.contact-upload-state{min-height:22px;font-size:12px;color:#52657b}.pending{color:#8b5400}.contact-file-button{position:relative;display:flex;align-items:center;justify-content:center;min-height:40px;box-sizing:border-box;padding:8px;border:1px solid #b7cbe6;border-radius:8px;color:#1953a0;font-size:13px;text-align:center;cursor:pointer}.contact-file-button:focus-within{outline:2px solid #2563eb;outline-offset:3px}.contact-file-button input{position:absolute;inset:0;opacity:0;width:100%;height:100%;cursor:pointer}.contact-file-button.disabled{opacity:.5;cursor:not-allowed}.contact-image-actions{display:flex;gap:8px;margin-top:8px}.contact-image-actions button{flex:1;min-width:0;font-size:12px;padding:8px}.contact-image-error,.contact-error{color:#b42318;font-size:13px;line-height:1.6}.contact-error{margin-top:16px;padding:12px;background:#fff3f2;border-radius:10px}.contact-error p{margin:0 0 8px}.contact-preview{padding:18px;background:#f1f5fa;border-radius:18px;align-self:start;min-width:0}.contact-preview-heading{display:flex;flex-wrap:wrap;gap:6px 12px;align-items:center;justify-content:space-between;margin-bottom:16px}.contact-preview-heading h3{font-size:14px;margin:0}.contact-preview-heading span{font-size:12px;color:#52657b}.contact-phone-preview{max-width:390px;margin:auto;padding:20px;background:white;border-radius:20px;box-shadow:0 4px 16px #13376008}.contact-phone-preview h4{font-size:18px;margin:0 0 8px}.preview-number{font-size:23px;font-weight:700;overflow-wrap:anywhere;margin:0}.preview-call{display:block;font-size:12px;color:#1953a0;margin-top:6px}.preview-qrs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:16px}.preview-qrs.single{grid-template-columns:minmax(0,160px);justify-content:center}.preview-qr{display:flex;align-items:center;flex-direction:column;gap:8px;padding:12px 8px;background:#f6f8fb;border-radius:12px;min-width:0}.preview-qr img{width:100%;max-width:128px;aspect-ratio:1;object-fit:contain;background:white}.preview-qr strong{font-size:14px;font-weight:500}.preview-qr span{font-size:12px;color:#64748b}.contact-preview-empty{padding:32px 12px;text-align:center;color:#52657b;line-height:1.7}.contact-save-area{margin-top:24px;padding-top:16px;border-top:1px solid #e2e8f0}.contact-save-area p{margin:8px 0}.contact-save-actions{display:flex;flex-wrap:wrap;gap:10px;margin-top:14px}.contact-full-image{display:block;width:100%;max-width:480px;max-height:65vh;object-fit:contain;margin:0 auto}.helper{line-height:1.6}
@media(max-width:1200px){.contact-layout{grid-template-columns:1fr}.contact-preview{width:100%;max-width:430px;box-sizing:border-box;justify-self:center}.contact-scope{display:none}}
@media(max-width:600px){.contact-settings{padding:16px}.contact-settings-grid{grid-template-columns:1fr}}
</style>
