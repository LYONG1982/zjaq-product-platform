<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { Responses } from "@zj/contracts";
import { api } from "../api";
const props = defineProps<{ mode: "dashboard" | "settings" | "records" }>();
const settings = ref<Responses["AnalyticsSettings"]>(), summary = ref<Responses["AnalyticsSummary"]>(), rows = ref<Responses["AnalyticsEvent"][]>([]), loading = ref(false), saving = ref(false), error = ref(""), message = ref(""), next = ref<string | null>(null), q = ref(""), kind = ref(""), client = ref(""), from = ref(""), to = ref("");
let sequence = 0;
const date = (value: string) => new Date(value).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
const clientName = (value: string) => ({ SALES_PC: "销售 PC", WECHAT: "小程序", H5: "H5" })[value] ?? value;
async function load(append = false) {
  const current = ++sequence; loading.value = true; error.value = "";
  try {
    if (props.mode === "settings") settings.value = (await api.analyticsSettings()).data;
    else if (props.mode === "dashboard") {
      const notice = await api.analyticsSettings();
      if (current !== sequence) return; settings.value = notice.data;
      if (notice.data.dashboardEnabled) { const data = await api.analyticsSummary(); if (current === sequence) summary.value = data.data; }
      else summary.value = undefined;
    } else {
      const result = await api.analyticsEvents({ q: q.value.trim() || undefined, kind: kind.value || undefined, client: client.value || undefined, from: from.value || undefined, to: to.value || undefined, cursor: append ? next.value ?? undefined : undefined });
      if (current !== sequence) return; rows.value = append ? [...rows.value, ...result.data] : result.data; next.value = result.page.nextCursor;
    }
  } catch (e) { if (current === sequence) error.value = e instanceof Error ? e.message : "统计数据读取失败"; }
  finally { if (current === sequence) loading.value = false; }
}
async function save() {
  if (!settings.value) return; saving.value = true; error.value = ""; message.value = "";
  try { settings.value = (await api.updateAnalyticsSettings({ expectedVersion: settings.value.version, downloadEnabled: settings.value.downloadEnabled, viewEnabled: settings.value.viewEnabled, dashboardEnabled: settings.value.dashboardEnabled })).data; message.value = "统计设置已保存，新的采集立即遵循开关。"; }
  catch (e) { error.value = e instanceof Error ? e.message : "保存失败"; }
  finally { saving.value = false; }
}
function reset() { q.value = ""; kind.value = ""; client.value = ""; from.value = ""; to.value = ""; void load(); }
onMounted(() => load());
</script>
<template>
  <section class="table-card spaced analytics-panel" :class="{ 'audit-analytics-panel': mode === 'records' }">
    <div class="table-heading"><strong>{{ mode === 'settings' ? '统计设置' : mode === 'dashboard' ? '最近 90 天资料数据' : '浏览与下载记录' }}</strong><button :disabled="loading || saving" @click="load()">{{ loading ? '正在读取…' : '刷新' }}</button></div>
    <div v-if="error" class="error-panel" role="alert"><p>{{ error }}</p><button :disabled="loading || saving" @click="load()">重新读取</button></div>
    <p v-if="message" class="analytics-notice" role="status">{{ message }}</p>
    <template v-if="mode === 'settings' && settings"><form class="analytics-settings" @submit.prevent="save"><label><input v-model="settings.dashboardEnabled" type="checkbox" :disabled="saving" /> 展示数据看板</label><label><input v-model="settings.downloadEnabled" type="checkbox" :disabled="saving" /> 采集销售端完整下载量</label><label><input v-model="settings.viewEnabled" type="checkbox" :disabled="saving" /> 采集小程序和 H5 资料浏览量</label><p>{{ settings.notice }}</p><p>默认关闭。关闭后停止新采集，已有记录按 90 天保留规则清理。下载以完整成功响应计数，分段请求、预览和中断不重复计入下载。</p><button class="primary" type="submit" :disabled="saving || loading">{{ saving ? '保存中…' : '保存统计设置' }}</button></form></template>
    <p v-if="mode === 'dashboard' && settings && !settings.dashboardEnabled" class="table-empty">数据看板已关闭，请在系统设置的“统计设置”中启用“展示数据看板”。采集开关与看板展示独立管理。</p>
    <template v-if="mode === 'dashboard' && summary"><p class="analytics-notice">销售下载：{{ settings?.downloadEnabled ? '采集中' : '已关闭' }} · 小程序 / H5 浏览：{{ settings?.viewEnabled ? '采集中' : '已关闭' }}</p><div class="analytics-counts"><div><span>销售端完整下载</span><strong>{{ summary.downloads }}</strong></div><div><span>小程序 / H5 资料浏览</span><strong>{{ summary.views }}</strong></div></div><p class="analytics-notice">浏览在资料成功打开后记一次；同一次打开的翻页和重复提交不重复计数。端类型由客户端声明，匿名浏览不推断个人身份。</p><div class="table-scroll"><table><thead><tr><th>产品</th><th>资料</th><th>完整下载</th><th>资料浏览</th></tr></thead><tbody><tr v-for="row in summary.materials" :key="row.productId + row.materialId"><td>{{ row.productName }}</td><td>{{ row.materialName }}</td><td>{{ row.downloads }}</td><td>{{ row.views }}</td></tr></tbody></table></div><p v-if="!summary.materials.length" class="table-empty">最近 90 天暂无统计记录。可在系统设置中启用采集。</p></template>
    <template v-if="mode === 'records'"><form class="toolbar" @submit.prevent="load()"><input v-model="q" aria-label="统计资料或产品搜索" placeholder="资料或产品名称" maxlength="100" /><select v-model="kind" aria-label="统计事件类型"><option value="">全部事件</option><option value="VIEW">资料浏览</option><option value="DOWNLOAD">完整下载</option></select><select v-model="client" aria-label="统计使用端"><option value="">全部使用端</option><option value="WECHAT">小程序</option><option value="H5">H5</option><option value="SALES_PC">销售 PC</option></select><label>开始日期<input v-model="from" type="date" /></label><label>结束日期<input v-model="to" type="date" /></label><button type="submit" :disabled="loading">查询</button><button type="button" :disabled="loading" @click="reset">重置</button></form><p class="analytics-notice">只显示最近 90 天；时间为北京时间。来源 IP 是服务端观测到的首个不可信代理地址，未配置可信代理时可能为网关 IP。分享人仅展示服务端可核实的关联，本轮没有此关联时显示“未记录”。</p><div class="table-scroll"><table><thead><tr><th>时间</th><th>产品 / 资料</th><th>版本</th><th>事件</th><th>使用端</th><th>来源 IP</th><th>下载人</th><th>分享人</th></tr></thead><tbody><tr v-for="row in rows" :key="row.eventId"><td>{{ date(row.occurredAt) }}</td><td>{{ row.productName }}<br />{{ row.materialName }}</td><td>{{ row.versionLabel }}</td><td>{{ row.kind === 'VIEW' ? '资料浏览' : '完整下载' }}</td><td>{{ clientName(row.client) }}</td><td>{{ row.sourceIp }}</td><td>{{ row.actorName || '未记录' }}</td><td>{{ row.sharer || '未记录' }}</td></tr></tbody></table></div><p v-if="!loading && !rows.length" class="table-empty">没有符合条件的浏览或下载记录</p><div class="table-footer"><span>{{ loading ? '正在读取…' : `已加载 ${rows.length} 条` }}</span><button v-if="next" :disabled="loading" @click="load(true)">加载更多记录</button></div></template>
  </section>
</template>
<style scoped>.analytics-settings{padding:24px;max-width:800px}.analytics-settings>label{display:block;margin:12px 0}.analytics-settings input[type=checkbox]{width:18px;height:18px;vertical-align:middle}.analytics-settings p,.analytics-notice{color:#526777;line-height:1.7}.analytics-notice{margin:16px 24px}.analytics-counts{display:flex;gap:24px;padding:8px 24px 20px;flex-wrap:wrap}.analytics-counts>div{background:#eef5fa;flex:1;min-width:200px;border-radius:8px;padding:20px}.analytics-counts strong{display:block;font-size:32px;margin-top:10px}.analytics-panel .toolbar{flex-wrap:wrap}</style>
