<script setup lang="ts">
import { nextTick, ref } from "vue";
import { api } from "../api";
const expanded = ref(false), content = ref(""), contact = ref(""), busy = ref(false), message = ref("");
async function toggle() {
  expanded.value = !expanded.value;
  if (!expanded.value) return;
  await nextTick();
  // 展开后把表单滚到可视区，避免提交按钮被底部 tabBar 或屏幕边缘挡住。
  uni.pageScrollTo({ selector: ".feedback-form", offsetTop: -80, duration: 200 });
}
async function submit() {
  if (busy.value) return;
  if (!content.value.trim()) { message.value = "请填写建议内容。"; return; }
  busy.value = true; message.value = "";
  try { await api.submitFeedback({ content: content.value.trim(), contact: contact.value.trim() }); content.value = ""; contact.value = ""; message.value = "感谢反馈，我们已收到。"; }
  catch (error) { message.value = error instanceof Error ? error.message : "提交失败，请稍后重试。"; }
  finally { busy.value = false; }
}
function key(event: KeyboardEvent) {
  // #ifdef H5
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); expanded.value = !expanded.value; }
  // #endif
}
function submitKey(event: KeyboardEvent) {
  // #ifdef H5
  if (event.key === "Enter" || event.key === " ") { event.preventDefault(); void submit(); }
  // #endif
}
</script>
<template>
  <view class="feedback-block"><button role="button" tabindex="0" class="feedback-toggle" aria-label="建议反馈" @click="toggle" @keydown="key">建议反馈</button>
    <view v-if="expanded" class="feedback-form"><text>欢迎告诉我们你的使用建议。</text><textarea v-model="content" :maxlength="1000" placeholder="请填写建议内容" aria-label="建议内容" /><input v-model="contact" :maxlength="100" placeholder="联系方式（选填）" aria-label="联系方式（选填）" /><button role="button" tabindex="0" :disabled="busy" @click="submit" @keydown="submitKey">{{ busy ? '提交中…' : '提交反馈' }}</button><text v-if="message" role="status">{{ message }}</text></view>
  </view>
</template>
<style scoped>
.feedback-block{margin-top:20px;background:#fff;border-radius:12px;padding:16px}.feedback-toggle{margin:0;width:100%;text-align:left;font-size:16px;font-weight:600;color:var(--zj-color-brand-hover);background:transparent}.feedback-form{display:flex;flex-direction:column;gap:12px;margin-top:12px;scroll-margin-top:80px}.feedback-form textarea,.feedback-form input{width:100%;box-sizing:border-box;border:1px solid #b4c4d3;border-radius:6px;padding:10px;font-size:15px}.feedback-form textarea{height:110px}.feedback-form input{height:44px}.feedback-form button{margin:0;background:var(--zj-color-brand-hover);color:#fff;font-size:15px;min-height:44px;padding:0 16px;border-radius:8px;display:flex;align-items:center;justify-content:center}
</style>
