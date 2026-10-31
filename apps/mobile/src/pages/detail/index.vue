<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import type { Responses } from "@zj/contracts";
import { api } from "../../api";
// #ifdef H5
import SeriesHero from "../../components/SeriesHero.vue";
// #endif
import { seriesStyle } from "../../series-display";
import ProductVisual from "../../components/ProductVisual.vue";
import ContactBlock from "../../components/ContactBlock.vue";
import { safeSource, backToSource } from "../../navigation";
const product = ref<Responses["PublicProduct"]>(),
  error = ref(""),
  loading = ref(true);
const themeClass = computed(() => {
  switch (product.value?.category.id) {
    case "miding":
      return "theme-miding";
    case "miyi":
      return "theme-miyi";
    case "mishu":
      return "theme-mishu";
    case "ai":
      return "theme-ai";
    default:
      return "";
  }
});
let source = "/pages/products/index";
let id = "",
  sequence = 0;
const groups = [
  ["problemValues", "问题与价值"],
  ["scenarios", "应用场景"],
  ["features", "核心能力"],
] as const;
let isH5 = false;
// #ifdef H5
isH5 = true;
// #endif
const displayGroups = computed(() => isH5 ? [...visibleGroups.value].sort((a,b) => ['problemValues','features','scenarios'].indexOf(a.key) - ['problemValues','features','scenarios'].indexOf(b.key)) : visibleGroups.value);
function heading(key: string, fallback: string) {
  if (!isH5) return fallback;
  const keys = [summaryParagraphs.value.length || hasText(product.value?.audiences) ? 'intro' : '', ...displayGroups.value.map(g => g.key), 'materials', ...(technicalEntries.value.length ? ['technical'] : [])].filter(Boolean);
  const labels: Record<string,string> = { intro: '产品介绍', problemValues: '解决什么问题', features: '核心能力', scenarios: '适用场景', materials: '当前资料', technical: '技术与使用说明' };
  return String(keys.indexOf(key) + 1).padStart(2, '0') + '  ' + (labels[key] ?? fallback);
}
const summaryParagraphs = computed(() => (product.value?.summary ?? "").split(/\r\n|\r|\n/).filter(line => line.trim().length > 0));
import { technicalLabels as labels } from "@zj/api-client";
function hasText(value: string | null | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}
const visibleGroups = computed(() => {
  if (!product.value) return [];
  return groups
    .map(([key, label]) => ({
      key,
      label,
      items: product.value![key].filter(
        (item) => hasText(item.title) || hasText(item.text),
      ),
    }))
    .filter((group) => group.items.length > 0);
});
function hasGroup(key: (typeof groups)[number][0]): boolean {
  return visibleGroups.value.some((group) => group.key === key);
}
const technicalEntries = computed(() =>
  Object.entries(product.value?.technical ?? {}).filter(([, value]) =>
    hasText(value),
  ),
);

async function load() {
  if (!id) {
    error.value = "产品暂不可用";
    loading.value = false;
    return;
  }
  const seq = ++sequence;
  loading.value = true;
  error.value = "";
  try {
    const r = await api.publicProduct(id);
    if (seq === sequence) product.value = r.data;
  } catch (e) {
    if (seq === sequence) {
      product.value = undefined;
      error.value = e instanceof Error ? e.message : "加载失败";
    }
  } finally {
    if (seq === sequence) loading.value = false;
  }
}
onLoad((q) => {
  id = q?.id ?? "";
  source = safeSource(q?.from);
  void load();
});
onShow(() => {
  if (product.value) void load();
});
function back() {
  backToSource(source);
}
function jump(section: string) {
  uni.pageScrollTo({ selector: "#section-" + section, duration: 160 });
}
function showCapability(item: { title: string; text: string }) {
  uni.showModal({ title: item.title || "核心能力", content: item.text || item.title, showCancel: false });
}
function preview(materialId: string) {
  uni.navigateTo({
    url:
      "/pages/viewer/index?productId=" +
      encodeURIComponent(id) +
      "&materialId=" +
      encodeURIComponent(materialId) +
      "&from=" +
      encodeURIComponent("/pages/detail/index?id=" + id),
  });
}
</script>
<template>
<!-- #ifdef H5 -->
  <view class="h5-v2 v2-detail" :style="seriesStyle(product?.category.id ?? '')">
    <view class="v2-detail-header"><button role="button" tabindex="0" @click="back" aria-label="返回上一页">← 产品详情</button><text class="v2-demo">本地演示</text></view>
    <view v-if="error" class="v2-detail-empty" role="alert"><text>{{ error }}</text><button role="button" tabindex="0" @click="load">重新加载</button><button role="button" tabindex="0" @click="back">返回上一页</button></view>
    <view v-else-if="loading && !product" class="v2-detail-empty" role="status">正在读取…</view>
    <template v-else-if="product">
      <SeriesHero :category-id="product.category.id" :name="product.category.name" detail />
      <view class="v2-detail-intro">
        <text class="detail-title">{{ product.name }}</text><text v-if="hasText(product.tagline)" class="tagline">{{ product.tagline }}</text><text v-if="product.model" class="v2-model">产品型号：{{ product.model }}</text>
        <view class="section-nav" aria-label="产品详情分区"><button role="button" tabindex="0" v-if="hasGroup('problemValues')" @click="jump('problemValues')">价值</button><button role="button" tabindex="0" v-if="hasGroup('features')" @click="jump('features')">能力</button><button role="button" tabindex="0" v-if="hasGroup('scenarios')" @click="jump('scenarios')">场景</button><button role="button" tabindex="0" @click="jump('materials')">资料</button></view>
      </view>
      <view v-if="summaryParagraphs.length || hasText(product.audiences)" class="v2-detail-section product-introduction"><text class="section-title">{{ heading('intro', '产品介绍') }}</text><text v-for="(paragraph, index) in summaryParagraphs" :key="index" class="paragraph summary">{{ paragraph }}</text><text v-if="hasText(product.audiences)" class="paragraph v2-audiences">适用对象：{{ product.audiences }}</text></view>
      <view v-for="group in displayGroups" :key="group.key" :id="'section-' + group.key" class="v2-detail-section"><text class="section-title">{{ heading(group.key, group.label) }}</text>
        <template v-for="item in group.items" :key="item.id"><button role="button" tabindex="0" v-if="group.key === 'features'" class="v2-feature-card capability-card" :aria-label="item.title || item.text" @click="showCapability(item)"><text v-if="hasText(item.title)" class="feature-title">{{ item.title }}</text><text v-if="hasText(item.text)" class="paragraph">{{ item.text }}</text></button><view v-else class="v2-feature-card"><text v-if="hasText(item.title)" class="feature-title">{{ item.title }}</text><text v-if="hasText(item.text)" class="paragraph">{{ item.text }}</text></view></template>
      </view>
      <view v-if="product.media.length" class="v2-detail-section media-list"><text class="section-title">产品展示</text><view v-for="m in product.media" :key="m.mediaId"><ProductVisual :path="m.path" :alt="hasText(m.alt) ? m.alt : product.name" large /><text v-if="hasText(m.alt)" class="paragraph">{{ m.alt }}</text></view></view>
      <view id="section-materials" class="v2-detail-section"><text class="section-title">{{ heading('materials', '产品资料') }}</text>
        <button role="button" tabindex="0" v-for="m in product.materials" :key="m.materialId" class="material-card v2-detail-material" @click="preview(m.materialId)"><view class="v2-material-top"><text class="v2-format">{{ m.previewKind === 'pdf' ? 'PDF' : m.previewKind === 'video' ? '视频' : '图集' }}</text><text>{{ m.versionLabel }}{{ m.previewKind === 'video' ? '' : ' · ' + m.pageCount + ' 页' }}</text></view><text class="feature-title">{{ m.name }}</text><text class="v2-material-date">{{ m.publishedAt.slice(0, 10) }}</text><text class="preview-link">预览资料 ↗</text></button>
        <text v-if="!product.materials.length" class="paragraph">暂无可预览资料</text>
      </view>
      <view v-if="technicalEntries.length" class="v2-detail-section"><text class="section-title">{{ heading('technical', '技术与使用说明') }}</text><view v-for="[k,v] in technicalEntries" :key="k" class="v2-technical-row"><text class="paragraph">{{ labels[k] ?? k }}：{{ v }}</text></view></view>
      <ContactBlock />
    </template>
  </view>

<!-- #endif -->
<!-- #ifndef H5 -->

  <view :class="['detail-page', themeClass]"
    ><button role="button" tabindex="0" class="back-link" @click="back">← 返回上一页</button
    ><view v-if="error" class="empty" role="alert"
      ><text>{{ error }}</text
      ><button role="button" tabindex="0" @click="load">重新加载</button
      ><button role="button" tabindex="0" @click="back">返回上一页</button></view
    ><view v-else-if="loading && !product" class="empty">正在读取…</view
    ><template v-else-if="product"
      ><view class="detail-intro"
        ><text class="category-label">{{ product.category.name }}</text
        ><text class="detail-title">{{ product.name }}</text
        ><text v-if="product.model" class="paragraph">产品型号：{{ product.model }}</text
        ><text v-if="hasText(product.tagline)" class="tagline">{{
          product.tagline
        }}</text
        ><button role="button" tabindex="0" v-if="product.materials.length" class="view-materials" @click="jump('materials')">查看产品资料</button></view
      ><view v-if="summaryParagraphs.length || hasText(product.audiences)" class="detail-section product-introduction"><text class="section-title">产品介绍</text><text v-for="(paragraph, index) in summaryParagraphs" :key="index" class="paragraph summary">{{ paragraph }}</text><text v-if="hasText(product.audiences)" class="paragraph">适用对象：{{ product.audiences }}</text></view
      ><view class="section-nav" aria-label="产品详情分区"
        ><button role="button" tabindex="0"
          v-if="hasGroup('problemValues')"
          @click="jump('problemValues')"
        >
          价值</button
        ><button role="button" tabindex="0" v-if="hasGroup('features')" @click="jump('features')">
          能力</button
        ><button role="button" tabindex="0" v-if="hasGroup('scenarios')" @click="jump('scenarios')">
          场景</button
        ><button role="button" tabindex="0" @click="jump('materials')">资料</button></view
      ><template v-for="group in visibleGroups" :key="group.key"
        ><view
          :id="'section-' + group.key"
          class="detail-section"
          ><text class="section-title">{{ group.label }}</text
          ><view v-if="group.key === 'features'" class="feature-tags"><button role="button" tabindex="0" v-for="item in group.items" :key="item.id" class="capability-tag" :aria-label="item.title || item.text" @click="showCapability(item)">{{ item.title || item.text }}</button></view><template v-else><view
            v-for="item in group.items"
            :key="item.id"
            class="feature-card"
            ><text v-if="hasText(item.title)" class="feature-title">{{
              item.title
            }}</text
            ><text v-if="hasText(item.text)" class="paragraph">{{
              item.text
            }}</text></view
          ></template></view
        ></template
      ><view v-if="product.media.length" class="media-list"
        ><text class="section-title">产品展示</text
        ><view v-for="m in product.media" :key="m.mediaId"
          ><ProductVisual
            :path="m.path"
            :alt="hasText(m.alt) ? m.alt : product.name"
            large /><text v-if="hasText(m.alt)">{{
            m.alt
          }}</text></view
        ></view
      ><view v-if="technicalEntries.length" class="detail-section"
        ><text class="section-title">技术与使用说明</text
        ><view class="feature-card"
          ><view
            v-for="[k, v] in technicalEntries"
            :key="k"
            class="technical-row"
            ><text class="feature-title">{{ labels[k] ?? k }}</text
            ><text class="paragraph">{{ v }}</text></view
          ></view
        ></view
      ><view id="section-materials" class="detail-section"
        ><text class="section-title">产品资料</text
        ><button role="button" tabindex="0"
          v-for="m in product.materials"
          :key="m.materialId"
          class="material-card"
          @click="preview(m.materialId)"
        >
          <text class="feature-title">{{ m.name }}</text
          ><text class="material-meta"
            >{{ m.versionLabel }} ·
            {{ m.previewKind === "pdf" ? "PDF" : m.previewKind === "video" ? "视频" : "图片" }} ·
            {{ m.previewKind === 'video' ? '' : m.pageCount + ' 页 · ' }}{{ m.publishedAt.slice(0, 10) }}</text
          ><text class="preview-link">预览 →</text></button
        ><text v-if="!product.materials.length" class="paragraph"
          >暂无可预览资料</text
        ></view
      ><ContactBlock />
      </template
    ></view
  >

<!-- #endif -->
</template>
<style scoped>

.detail-page {
  --detail-accent: var(--zj-color-brand-hover);
  --detail-link: var(--zj-color-brand-hover);
  --pd-ink: #172b4d;
  --pd-body: #53657a;
  --pd-muted: #62738a;
  --pd-surface: #ffffff;
  --pd-border: #e1e7f0;
  --pd-shadow: 0 4px 18px rgba(25, 58, 110, 0.035);
  box-sizing: border-box;
  min-width: 0;
  padding: 8px 16px calc(32px + env(safe-area-inset-bottom));
  background: #f5f7fb;
  color: var(--pd-ink);
}
.theme-miding {
  --detail-accent: #165dff;
  --detail-link: #154bc7;
}
.theme-miyi {
  --detail-accent: #2b7f71;
  --detail-link: #205f55;
}
.theme-mishu {
  --detail-accent: #386aab;
  --detail-link: #285487;
}
.theme-ai {
  --detail-accent: #2b7dbe;
  --detail-link: #1c6298;
}
.back-link {
  min-height: 44px;
  margin: 0 0 12px;
  padding: 0;
  background: transparent;
  color: var(--pd-body);
  font-size: 14px;
  line-height: 44px;
  text-align: left;
}
.detail-intro {
  padding: 22px 20px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 16px;
  background-color: var(--detail-accent);
  background-image: linear-gradient(120deg, rgba(8, 27, 49, 0.04), rgba(8, 27, 49, 0.12));
  color: #ffffff;
  box-shadow: 0 8px 20px rgba(25, 58, 110, 0.08);
}
.category-label {
  display: inline-block;
  max-width: 100%;
  box-sizing: border-box;
  padding: 4px 10px;
  border: 1px solid rgba(255, 255, 255, 0.22);
  border-radius: 999px;
  background: rgba(8, 27, 49, 0.08);
  color: #ffffff;
  font-size: 13px;
  font-weight: 600;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.detail-title {
  display: block;
  margin: 16px 0 12px;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.4;
  overflow-wrap: anywhere;
}
.paragraph {
  display: block;
  margin-top: 10px;
  color: var(--pd-body);
  font-size: 16px;
  line-height: 1.7;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-intro .paragraph {
  margin-top: 8px;
  color: #ffffff;
  font-size: 14px;
  line-height: 1.65;
}
.tagline {
  display: block;
  margin-top: 10px;
  color: #ffffff;
  font-size: 16px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.view-materials {
  min-height: 48px;
  margin: 20px 0 0;
  padding: 0 16px;
  border-radius: 10px;
  background: var(--pd-surface);
  color: var(--detail-link);
  font-size: 16px;
  font-weight: 600;
  line-height: 48px;
}
.detail-section {
  margin-top: 28px;
  scroll-margin-top: 24px;
}
.section-title {
  display: block;
  margin-bottom: 14px;
  padding-left: 10px;
  border-left: 4px solid var(--detail-accent);
  color: var(--detail-accent);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}
.summary {
  margin: 14px 0;
  text-indent: 2em;
}
.section-nav {
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  margin: 22px 0 0;
}
.section-nav button {
  flex: 1 1 0;
  min-width: 0;
  min-height: 44px;
  margin: 0;
  padding: 0 4px;
  border: 1px solid var(--pd-border);
  border-radius: 10px;
  background: var(--pd-surface);
  color: var(--detail-link);
  font-size: 14px;
  font-weight: 600;
  line-height: 44px;
}
.feature-card,
.material-card {
  min-width: 0;
  margin-top: 12px;
  padding: 16px;
  border: 1px solid var(--pd-border);
  border-radius: 14px;
  background: var(--pd-surface);
  box-shadow: var(--pd-shadow);
}
.feature-title {
  display: block;
  color: var(--pd-ink);
  font-size: 16px;
  font-weight: 600;
  line-height: 1.55;
  overflow-wrap: anywhere;
}
.feature-card .paragraph {
  margin-top: 8px;
}
.feature-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.capability-tag {
  min-height: 44px;
  max-width: 100%;
  margin: 0;
  padding: 10px 14px;
  border: 1px solid var(--detail-accent);
  border-radius: 999px;
  background: var(--pd-surface);
  color: var(--detail-link);
  font-size: 15px;
  line-height: 1.5;
  white-space: normal;
  overflow-wrap: anywhere;
}
.technical-row + .technical-row {
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--pd-border);
}
.material-card {
  width: 100%;
  text-align: left;
  line-height: 1.6;
  white-space: normal;
}
.material-meta {
  display: block;
  margin-top: 8px;
  color: var(--pd-muted);
  font-size: 14px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.preview-link {
  display: block;
  margin-top: 16px;
  color: var(--detail-link);
  font-size: 14px;
  font-weight: 600;
  line-height: 1.6;
}
.media-list {
  margin-top: 28px;
}
.media-list > view {
  min-width: 0;
  margin-top: 16px;
}
.media-list :deep(.product-visual) {
  border-radius: 14px;
}
.media-list > view > text {
  color: var(--pd-body);
  font-size: 14px;
  overflow-wrap: anywhere;
}
.empty {
  padding: 56px 16px;
  border: 1px solid var(--pd-border);
  border-radius: 14px;
  background: var(--pd-surface);
  color: var(--pd-body);
  text-align: center;
}
.empty button {
  min-height: 44px;
  margin-top: 16px;
  border-radius: 10px;
  font-size: 14px;
}
.detail-page :deep(.contact-block) {
  margin-top: 28px;
  padding: 18px 16px;
  border: 1px solid var(--pd-border);
  border-radius: 14px;
  background: var(--pd-surface);
  box-shadow: var(--pd-shadow);
}
.detail-page :deep(.contact-title) {
  padding-left: 10px;
  border-left: 4px solid var(--detail-accent);
  color: var(--pd-ink);
  font-size: 20px;
  font-weight: 700;
  line-height: 1.4;
}
.detail-page :deep(.contact-qrs) {
  gap: 16px;
  margin: 20px 0;
}
.detail-page :deep(.contact-qr) {
  min-width: 0;
  gap: 10px;
  color: var(--pd-body);
  line-height: 1.6;
}
.detail-page :deep(.contact-qr image),
.detail-page :deep(.contact-qr .placeholder) {
  width: 112px;
  height: 112px;
  border: 1px solid var(--pd-border);
  border-radius: 12px;
  box-sizing: border-box;
}
.detail-page :deep(.contact-qr .placeholder) {
  background: #f4f7fb;
  color: var(--pd-body);
}
.detail-page :deep(.contact-phone) {
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--pd-border);
}
.detail-page :deep(.contact-phone view) {
  min-width: 0;
}
.detail-page :deep(.number) {
  color: var(--pd-ink);
  overflow-wrap: anywhere;
}
.detail-page :deep(.contact-phone button) {
  flex: none;
  min-width: 64px;
  min-height: 44px;
  padding: 0 14px;
  border: 1px solid var(--pd-border);
  border-radius: 10px;
  background: #f4f7fb;
  color: var(--detail-link);
  font-weight: 600;
  line-height: 44px;
}
/* #ifdef H5 */
.back-link,
.view-materials,
.section-nav button,
.capability-tag,
.material-card,
.detail-page :deep(.contact-phone button) {
  transition: background-color 120ms ease, border-color 120ms ease, box-shadow 120ms ease;
}
.back-link:focus-visible,
.view-materials:focus-visible,
.section-nav button:focus-visible,
.capability-tag:focus-visible,
.material-card:focus-visible,
.empty button:focus-visible,
.detail-page :deep(.contact-phone button:focus-visible) {
  outline: 2px solid var(--detail-link);
  outline-offset: 3px;
}
.back-link:active,
.section-nav button:active,
.capability-tag:active,
.material-card:active,
.detail-page :deep(.contact-phone button:active) {
  background-color: #edf2f8;
}
.view-materials:active {
  background-color: #edf2f8;
}
@media (prefers-reduced-motion: reduce) {
  .back-link,
  .view-materials,
  .section-nav button,
  .capability-tag,
  .material-card,
  .detail-page :deep(.contact-phone button) {
    transition: none;
  }
}
/* #endif */
</style>
