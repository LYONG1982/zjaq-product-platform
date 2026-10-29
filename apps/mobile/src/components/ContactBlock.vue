<script setup lang="ts">
import { onMounted, ref } from "vue";
import { api } from "../api";
import type { Responses } from "@zj/contracts";
import { siteImagePath } from "../site-images";
const contact = ref<Responses["SiteContact"] | null>(null), failedOfficial = ref(false), failedService = ref(false);
const officialPath = ref<string | null>(null), servicePath = ref<string | null>(null);
let sequence = 0;
async function reload() {
  const current = ++sequence;
  try { const value = (await api.publicSiteContact()).data; if (current !== sequence) return; const images = await Promise.all([siteImagePath(value.officialQr, "official-qr", value.version), siteImagePath(value.serviceQr, "service-qr", value.version)]); if (current !== sequence) return; contact.value = value; [officialPath.value, servicePath.value] = images; failedOfficial.value = false; failedService.value = false; }
  catch { if (current === sequence) { contact.value = null; officialPath.value = servicePath.value = null; } }
}
function call() {
  if (!contact.value?.phone) return;
  uni.makePhoneCall({ phoneNumber: contact.value.phone.replace(/[ ()-]/g, "") });
}
function onCallKey(event: KeyboardEvent) {
  // #ifdef H5
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); call(); }
  // #endif
}
onMounted(reload);
defineExpose({ reload });
</script>
<template>
  <view v-if="contact" class="contact-block">
    <text class="contact-title">联系方式</text>
    <view class="contact-qrs">
      <view class="contact-qr"><image v-if="officialPath && !failedOfficial" :src="officialPath" mode="aspectFit" alt="官方公众号二维码" @error="failedOfficial = true" /><view v-else class="placeholder">暂未配置</view><text>官方公众号</text></view>
      <view class="contact-qr"><image v-if="servicePath && !failedService" :src="servicePath" mode="aspectFit" alt="客服微信二维码" @error="failedService = true" /><view v-else class="placeholder">暂未配置</view><text>客服微信</text></view>
    </view>
    <view class="contact-phone"><view><text>官方电话</text><text class="number">{{ contact.phone || '暂未配置' }}</text></view><button role="button" :tabindex="contact.phone ? 0 : -1" :disabled="!contact.phone" @click="call" @keydown="onCallKey">拨打</button></view>
  </view>
</template>
<style scoped>
.contact-block{margin-top:24px;background:#fff;border-radius:12px;padding:16px}.contact-title{display:block;border-left:4px solid var(--detail-accent,var(--zj-color-brand-hover));padding-left:10px;font-size:18px;font-weight:650}.contact-qrs{display:flex;gap:14px;margin:16px 0}.contact-qr{flex:1;display:flex;flex-direction:column;align-items:center;gap:8px;font-size:14px}.contact-qr image,.placeholder{width:110px;height:110px}.placeholder{display:flex;align-items:center;justify-content:center;background:#f3f6f9;color:#596b7d}.contact-phone{display:flex;align-items:center;justify-content:space-between;border-top:1px solid #e7edf3;padding-top:12px}.contact-phone view{display:flex;flex-direction:column;gap:5px}.number{font-weight:600}.contact-phone button{margin:0;padding:0 15px;font-size:14px;color:var(--zj-color-brand-hover);line-height:38px}
</style>
