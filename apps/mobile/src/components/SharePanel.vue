<script setup lang="ts">
import { ref, nextTick, onBeforeUnmount } from "vue";
import { shareLink, shareQr } from "@zj/api-client";
import { api } from "../api";
const props = defineProps<{ productId: string; materialId?: string }>();
const open = ref(false), link = ref(""), qr = ref(""), message = ref(""), busy = ref(false);
let previousFocus: HTMLElement | null = null, previousOverflow = "";
function close() { open.value = false; document.body.style.overflow = previousOverflow; previousFocus?.focus({ preventScroll:true }); }
onBeforeUnmount(() => { if(open.value) document.body.style.overflow = previousOverflow; });
async function show() {
  previousFocus = document.activeElement as HTMLElement; previousOverflow = document.body.style.overflow; document.body.style.overflow = "hidden";
  open.value = true; busy.value = true; link.value = ""; qr.value = ""; message.value = "";
  await nextTick(); document.querySelector<HTMLButtonElement>(".share-close")?.focus();
  try {
    const settings = (await api.shareSettings()).data;
    if(props.materialId) await api.manifest(props.productId, props.materialId); else await api.publicProduct(props.productId);
    const target = shareLink(settings, props.productId, props.materialId);
    qr.value = await shareQr(target, settings.size); link.value = target;
  } catch(error) { message.value = error instanceof Error ? error.message : "分享暂不可用"; } finally { busy.value = false; }
}
async function copy() { try { await navigator.clipboard.writeText(link.value); message.value = "链接已复制"; } catch { message.value = "复制失败，请长按下方链接复制"; } }
</script>
<template><button role="button" tabindex="0" class="share-entry" @click="show" @keydown.enter.prevent="show" @keydown.space.prevent="show">分享{{ materialId ? '资料' : '产品' }}</button><view v-if="open" class="share-overlay" role="dialog" aria-modal="true" aria-label="分享二维码" @keydown.esc="close"><view class="share-panel"><text class="share-title">分享二维码</text><text v-if="busy" role="status">正在生成…</text><text v-if="message" role="status">{{ message }}</text><template v-if="qr"><image :src="qr" mode="aspectFit" alt="黑白网页分享二维码" /><input :value="link" readonly aria-label="分享链接" /><text>网页二维码；下架或撤回后停止访问。</text><button role="button" tabindex="0" @click="copy" @keydown.enter.prevent="copy" @keydown.space.prevent="copy">复制链接</button><a :href="qr" download="产品资料分享二维码.png">下载二维码</a></template><button role="button" tabindex="0" class="share-close" @click="close" @keydown.enter.prevent="close" @keydown.space.prevent="close">关闭</button></view></view></template>
<style scoped>.share-entry { margin:16px 0;min-height:44px;font-size:14px; }.share-overlay { position:fixed;inset:0;background:#0008;display:flex;align-items:center;justify-content:center;z-index:1000;padding:20px; }.share-panel { display:flex;flex-direction:column;gap:16px;background:white;border-radius:12px;padding:24px;max-width:400px;width:100%;max-height:90dvh;overflow:auto; }.share-panel image { width:240px;height:240px;max-width:100%;align-self:center; }.share-panel button { min-height:44px;width:100%;font-size:14px; }.share-title { font-size:20px;font-weight:600; }</style>
