<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref, nextTick } from "vue";
import { api } from "../api";
import type { Responses } from "@zj/contracts";
import { siteImagePath } from "../site-images";

type QrKey = "officialQr" | "serviceQr";
const slots: { key: QrKey; title: string }[] = [
  { key: "officialQr", title: "官方公众号" }, { key: "serviceQr", title: "客服微信" },
];
const contact = ref<Responses["SiteContact"] | null>(null);
const paths = reactive<Record<QrKey, string | null>>({ officialQr: null, serviceQr: null });
const failed = reactive<Record<QrKey, boolean>>({ officialQr: false, serviceQr: false });
const loading = ref(false), loadError = ref(false), imageRevision = ref(0);
const configuredSlots = computed(() => slots.filter(slot => !!contact.value?.[slot.key]));
const hasContent = computed(() => !!contact.value?.phone || configuredSlots.value.length > 0);
let sequence = 0;
async function reload() {
  const current = ++sequence; loading.value = true;
  try {
    const value = (await api.publicSiteContact()).data;
    if (current !== sequence) return;
    const images = await Promise.all([siteImagePath(value.officialQr, "official-qr", value.version), siteImagePath(value.serviceQr, "service-qr", value.version)]);
    if (current !== sequence) return;
    contact.value = value; [paths.officialQr, paths.serviceQr] = images;
    for (const { key } of slots) failed[key] = !!value[key] && !paths[key];
    imageRevision.value++; loadError.value = false;
    // #ifdef H5
    if (preview.value && !images.includes(preview.value.src)) closeImage();
    // #endif
  } catch { if (current === sequence) loadError.value = true; }
  finally { if (current === sequence) loading.value = false; }
}
function call() {
  if (contact.value?.phone) uni.makePhoneCall({ phoneNumber: contact.value.phone.replace(/[ ()-]/g, "") });
}
function onCallKey(event: KeyboardEvent) {
  // #ifdef H5
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); call(); }
  // #endif
}

// #ifdef H5
const preview = ref<{ src: string; title: string } | null>(null), imageDialog = ref<HTMLDialogElement | null>(null);
let restoreView: { x: number; y: number; overflow: string; focus: HTMLElement | null } | null = null;
async function showImage(key: QrKey, title: string) {
  const src = paths[key]; if (!src || failed[key] || preview.value) return;
  restoreView = { x: window.scrollX, y: window.scrollY, overflow: document.body.style.overflow, focus: document.activeElement as HTMLElement | null };
  preview.value = { src, title }; await nextTick();
  if (!preview.value || !imageDialog.value) return;
  document.body.style.overflow = "hidden";
  imageDialog.value.showModal();
  if (restoreView) window.scrollTo(restoreView.x, restoreView.y);
}
function closeImage() {
  imageDialog.value?.close(); preview.value = null;
  if (restoreView) {
    document.body.style.overflow = restoreView.overflow;
    window.scrollTo(restoreView.x, restoreView.y);
    restoreView.focus?.focus({ preventScroll: true }); restoreView = null;
  }
}
function onActionKey(event: KeyboardEvent, action: () => void) {
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); action(); }
}
function closeOnBackdrop(event: MouseEvent) { if (event.target === event.currentTarget) closeImage(); }
// #endif
onMounted(reload);
onBeforeUnmount(() => {
  sequence++;
  // #ifdef H5
  closeImage();
  // #endif
});
defineExpose({ reload });
</script>

<template>
  <!-- #ifdef H5 -->
  <view v-if="hasContent || loadError" class="contact-block h5-contact">
    <text class="contact-title">与我们联系</text>
    <view v-if="loadError" class="contact-load-error" role="status"><text>{{ contact ? '联系方式刷新失败，当前显示上次读取的内容。' : '联系方式暂时无法加载' }}</text><button role="button" :tabindex="loading ? -1 : 0" :disabled="loading" @click="reload" @keydown="onActionKey($event, () => { if (!loading) reload(); })">{{ loading ? '正在重试…' : '重新加载联系方式' }}</button></view>
    <view v-if="configuredSlots.length" class="contact-qrs" :class="{ single: configuredSlots.length === 1 }">
      <view v-for="slot in configuredSlots" :key="slot.key" class="contact-qr">
        <button v-if="paths[slot.key] && !failed[slot.key]" class="qr-open" role="button" tabindex="0" :aria-label="'查看' + slot.title + '二维码大图'" @click="showImage(slot.key, slot.title)" @keydown="onActionKey($event, () => showImage(slot.key, slot.title))"><img :key="imageRevision + slot.key" :src="paths[slot.key]!" :alt="slot.title + '二维码'" @error="failed[slot.key] = true" /></button>
        <button v-else class="qr-retry" role="button" :tabindex="loading ? -1 : 0" :disabled="loading" @click="reload" @keydown="onActionKey($event, () => { if (!loading) reload(); })">{{ loading ? '正在重试…' : '二维码加载失败，点击重试' }}</button>
        <text class="qr-label">{{ slot.title }}</text><text v-if="!failed[slot.key]" class="qr-hint">点击查看大图</text>
      </view>
    </view>
    <view v-if="contact?.phone" class="contact-phone"><view><text>官方电话</text><text class="number">{{ contact.phone }}</text></view><button role="button" tabindex="0" @click="call" @keydown="onCallKey">拨打电话 ↗</button></view>
  </view>
  <Teleport to="body">
    <dialog v-if="preview" ref="imageDialog" class="contact-image-dialog" :aria-label="preview.title + '二维码大图'" @cancel.prevent="closeImage" @click="closeOnBackdrop">
      <div class="contact-image-sheet"><div class="contact-image-heading"><strong>{{ preview.title }}</strong><button type="button" role="button" tabindex="0" autofocus aria-label="关闭二维码大图" @click="closeImage" @keydown="onActionKey($event, closeImage)">关闭</button></div><img :src="preview.src" :alt="preview.title + '二维码大图'" /><p>可使用微信支持的图片识别操作。</p></div>
    </dialog>
  </Teleport>
  <!-- #endif -->
  <!-- #ifndef H5 -->
  <view v-if="contact" class="contact-block">
    <text class="contact-title">联系方式</text>
    <view class="contact-qrs">
      <view v-for="slot in slots" :key="slot.key" class="contact-qr"><image v-if="paths[slot.key] && !failed[slot.key]" :src="paths[slot.key]!" mode="aspectFit" :alt="slot.title + '二维码'" @error="failed[slot.key] = true" /><view v-else class="placeholder">暂未配置</view><text>{{ slot.title }}</text></view>
    </view>
    <view class="contact-phone"><view><text>官方电话</text><text class="number">{{ contact.phone || '暂未配置' }}</text></view><button role="button" :tabindex="contact.phone ? 0 : -1" :disabled="!contact.phone" @click="call" @keydown="onCallKey">拨打</button></view>
  </view>
  <!-- #endif -->
</template>

<style scoped>
.contact-block{margin-top:24px;background:#fff;border-radius:12px;padding:16px}.contact-title{display:block;border-left:4px solid var(--detail-accent,var(--zj-color-brand-hover));padding-left:10px;font-size:18px;font-weight:650}.contact-qrs{display:flex;gap:14px;margin:16px 0}.contact-qr{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px}.contact-qr image,.placeholder{width:110px;height:110px}.placeholder{display:flex;align-items:center;justify-content:center;background:#f3f6f9;color:#596b7d}.contact-phone{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e7edf3;padding-top:12px}.contact-phone view{display:flex;flex-direction:column;gap:5px}.number{font-weight:600}.contact-phone button{margin:0;padding:0 15px;font-size:14px;color:var(--zj-color-brand-hover);line-height:38px}
/* #ifdef H5 */
.h5-contact .contact-qrs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.h5-contact .contact-qrs.single{grid-template-columns:minmax(0,176px);justify-content:center}.h5-contact .contact-qr{min-width:0;align-items:center;padding:12px 8px;border-radius:12px;background:#f6f8fb}.h5-contact .qr-open{display:block;width:100%;max-width:128px;aspect-ratio:1;margin:0;padding:0;border:0;border-radius:0;line-height:1;background:white}.h5-contact .qr-open::after,.h5-contact .qr-retry::after{border:0}.qr-open img{display:block;width:100%;height:100%;object-fit:contain}.h5-contact .qr-label{font-size:14px;text-align:center;color:#334155}.h5-contact .qr-hint{font-size:12px;color:#64748b;text-align:center}.h5-contact .qr-retry{width:100%;max-width:128px;min-height:110px;padding:8px;line-height:1.6;font-size:12px;background:#fff;color:#1953a0}.h5-contact .number{overflow-wrap:anywhere}.contact-load-error{order:3;margin-top:12px;padding:12px;background:#f5f7fb;border-radius:10px;font-size:12px;color:#52657b}.contact-load-error button{margin:8px 0 0;padding:0 10px;min-height:44px;font-size:13px;color:#1953a0}.contact-image-dialog{box-sizing:border-box;margin:auto;width:calc(100% - 32px);max-width:560px;max-height:calc(100dvh - 32px);padding:0;border:0;border-radius:16px;background:white;color:#1e293b}.contact-image-dialog::backdrop{background:rgba(10,20,40,.72)}.contact-image-sheet{padding:16px}.contact-image-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:16px}.contact-image-heading button{margin:0;padding:0 14px;flex-shrink:0;min-width:64px;min-height:44px;border:1px solid #cfdaeb;border-radius:8px;background:#f5f8fc;color:#1953a0;font-size:14px}.contact-image-sheet>img{display:block;width:100%;max-height:65dvh;object-fit:contain;background:#fff}.contact-image-sheet p{font-size:12px;line-height:1.6;text-align:center;color:#64748b;margin:16px 0 0}
/* #endif */
</style>
