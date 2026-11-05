<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api, errorInfo } from "../api";
const props = defineProps<{ canManage: boolean }>();
const settings = ref<Responses["ShareSettings"]>({ version:0, baseUrl:null, target:"h5", size:512 }), busy = ref(false), ready = ref(false), message = ref("");
async function load() { busy.value = true; try { settings.value = (await api.adminShareSettings()).data; ready.value = true; message.value = ""; } catch(error) { message.value = errorInfo(error).message; } finally { busy.value = false; } }
async function save() { busy.value = true; message.value = ""; try { const { version, ...value } = settings.value; settings.value = (await api.updateShareSettings({ ...value, baseUrl: value.baseUrl?.trim() || null, expectedVersion: version })).data; message.value = "分享设置已保存"; } catch(error) { message.value = errorInfo(error).message; } finally { busy.value = false; } }
onMounted(() => { if(props.canManage) void load(); });
</script>
<template><section v-if="canManage" class="table-card spaced share-settings"><h2>分享设置</h2><p>统一黑白二维码，不带 Logo。产品和资料页面可预览、复制链接、下载二维码。</p><fieldset :disabled="busy || !ready"><label class="field">分享目标<select v-model="settings.target"><option value="h5">H5 网页</option><option value="portal">销售 PC 网页（需登录）</option></select></label><label class="field">本项目线上站点根地址<input v-model="settings.baseUrl" type="url" placeholder="https://产品资料站点" maxlength="500" /></label><p class="helper">请选择已由部署管理员登记的 HTTPS 站点。留空时关闭分享。技术资料需使用销售 PC 目标。</p><label class="field">二维码尺寸<select v-model.number="settings.size"><option :value="256">256 × 256</option><option :value="512">512 × 512（推荐）</option><option :value="1024">1024 × 1024</option></select></label></fieldset><div class="share-settings-actions"><button class="primary" :disabled="busy || !ready" @click="save">{{ busy ? '保存中…' : '保存分享设置' }}</button><button v-if="!ready || message" :disabled="busy" @click="load">重新读取</button></div><p v-if="message" role="status">{{ message }}</p><p class="helper">这是网页二维码。权限由访问页面校验；产品下架或资料撤回后，旧二维码不再提供访问。</p></section></template>
<style scoped>.share-settings { padding:24px; }.share-settings .field { max-width:560px; }.share-settings-actions { display:flex;gap:12px;align-items:center;margin-top:16px; }</style>
