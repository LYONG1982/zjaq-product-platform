<script setup lang="ts">
import { onMounted, ref } from "vue";
import { shareLink, shareQr } from "@zj/api-client";
import { api } from "../api";
import Modal from "./Modal.vue";
const props = defineProps<{ productId: string; materialId?: string; technical?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const link = ref(""), qr = ref(""), error = ref(""), busy = ref(false), message = ref("");
async function generate() {
  busy.value = true; error.value = ""; link.value = ""; qr.value = "";
  try {
    const [current, settings] = await Promise.all([api.shareTarget(props.productId, props.materialId), api.shareSettings()]);
    const target = shareLink(settings.data, current.data.publicId, current.data.materialId ?? undefined, current.data.requiresSales);
    qr.value = await shareQr(target, settings.data.size); link.value = target;
  } catch(caught) { error.value = caught instanceof Error ? caught.message : "分享暂不可用"; } finally { busy.value = false; }
}
async function copy() { try { await navigator.clipboard.writeText(link.value); message.value = "链接已复制"; } catch { message.value = "复制失败，请选中下方链接手动复制"; } }
onMounted(generate);
</script>
<template><Modal title="分享二维码" @close="emit('close')"><p v-if="busy" role="status">正在生成…</p><p v-if="error" class="error-inline" role="alert">{{ error }}</p><template v-if="link"><img :src="qr" alt="当前产品或资料的黑白分享二维码" class="share-qr" /><label class="field">分享链接<input :value="link" readonly /></label><p>访问权限由页面校验；下架后停止访问。此码为网页二维码。</p><p v-if="message" role="status">{{ message }}</p></template><template #footer><button @click="emit('close')">关闭</button><button :disabled="busy" @click="generate">重新生成</button><button :disabled="!link" @click="copy">复制链接</button><a v-if="qr" :href="qr" download="产品资料分享二维码.png" class="primary-button">下载二维码</a></template></Modal></template>
<style scoped>.share-qr { display:block;width:256px;max-width:100%;height:auto;margin:0 auto 20px; }</style>
