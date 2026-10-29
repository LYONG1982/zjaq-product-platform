<script setup lang="ts">
import { computed, ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import type { Responses } from "@zj/contracts";
import { api } from "../../api";
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
  <view :class="['detail-page', themeClass]"
    ><button class="back-link" @click="back">← 返回上一页</button
    ><view v-if="error" class="empty" role="alert"
      ><text>{{ error }}</text
      ><button @click="load">重新加载</button
      ><button @click="back">返回上一页</button></view
    ><view v-else-if="loading && !product" class="empty">正在读取…</view
    ><template v-else-if="product"
      ><view class="detail-intro"
        ><text class="category-label">{{ product.category.name }}</text
        ><text class="detail-title">{{ product.name }}</text
        ><text v-if="product.model" class="paragraph">产品型号：{{ product.model }}</text
        ><text v-if="hasText(product.tagline)" class="tagline">{{
          product.tagline
        }}</text
        ><button v-if="product.materials.length" class="view-materials" @click="jump('materials')">查看产品资料</button></view
      ><view v-if="summaryParagraphs.length || hasText(product.audiences)" class="detail-section product-introduction"><text class="section-title">产品介绍</text><text v-for="(paragraph, index) in summaryParagraphs" :key="index" class="paragraph summary">{{ paragraph }}</text><text v-if="hasText(product.audiences)" class="paragraph">适用对象：{{ product.audiences }}</text></view
      ><view class="section-nav" aria-label="产品详情分区"
        ><button
          v-if="hasGroup('problemValues')"
          @click="jump('problemValues')"
        >
          价值</button
        ><button v-if="hasGroup('features')" @click="jump('features')">
          能力</button
        ><button v-if="hasGroup('scenarios')" @click="jump('scenarios')">
          场景</button
        ><button @click="jump('materials')">资料</button></view
      ><template v-for="group in visibleGroups" :key="group.key"
        ><view
          :id="'section-' + group.key"
          class="detail-section"
          ><text class="section-title">{{ group.label }}</text
          ><view v-if="group.key === 'features'" class="feature-tags"><button v-for="item in group.items" :key="item.id" class="capability-tag" :aria-label="item.title || item.text" @click="showCapability(item)">{{ item.title || item.text }}</button></view><template v-else><view
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
        ><button
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
</template>
<style scoped>
.detail-page {
  padding: 12px 16px calc(32px + env(safe-area-inset-bottom));
  --detail-accent: var(--zj-color-brand-hover);
}
.theme-miding {
  --detail-accent: #165dff;
}
.theme-miyi {
  --detail-accent: #2b7f71;
}
.theme-mishu {
  --detail-accent: #386aab;
}
.theme-ai {
  --detail-accent: #2b7dbe;
}
.detail-intro { padding: 20px; border-radius: 14px; background: var(--detail-accent); color: white; }
.detail-intro .category-label, .detail-intro .paragraph { color: white; }
.view-materials { margin: 20px 0 0; font-size: 16px; background: white; color: var(--detail-accent); line-height: 44px; }
.feature-tags { display:flex; gap:10px; flex-wrap:wrap; }
.capability-tag { margin: 0; padding: 8px 14px; font-size: 15px; line-height: 1.5; color: var(--detail-accent); background: white; border: 1px solid var(--detail-accent); border-radius: 20px; max-width:100%; overflow-wrap:anywhere; }
.category-label {
  color: var(--detail-accent);
  font-size: 14px;
}
.detail-title {
  display: block;
  font-size: 24px;
  line-height: 1.45;
  font-weight: 650;
  margin: 14px 0;
}
.summary {
  text-indent: 2em;
  margin: 14px 0;
}
.tagline {
  display: block;
  font-size: 17px;
  line-height: 1.6;
  margin-bottom: 18px;
}
.paragraph {
  display: block;
  font-size: 16px;
  line-height: 1.7;
  color: var(--zj-color-text-secondary);
  margin-top: 10px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.detail-section {
  margin-top: 30px;
  scroll-margin-top: 24px;
}
.section-nav {
  display: flex;
  gap: 8px;
  margin: 22px 0;
}
.section-nav button {
  flex: 1;
  margin: 0;
  font-size: 14px;
  line-height: 44px;
  padding: 0;
  color: var(--detail-accent);
  background: white;
  border: 1px solid var(--zj-color-border);
  border-radius: 6px;
}
.section-title {
  display: block;
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
  color: var(--detail-accent);
  border-left: 4px solid var(--detail-accent);
  padding-left: 10px;
}
.feature-card {
  padding: 16px;
  background: white;
  border: 1px solid var(--zj-color-border);
  border-radius: 12px;
  margin-top: 12px;
}
.feature-title {
  display: block;
  font-size: 16px;
  font-weight: 600;
}
.technical-row + .technical-row {
  border-top: 1px solid var(--zj-color-border);
  padding-top: 16px;
  margin-top: 16px;
}
.material-card {
  text-align: left;
  line-height: 1.6;
  border: 1px solid var(--zj-color-border);
  background: white;
  border-radius: 12px;
  padding: 16px;
  margin-top: 12px;
}
.material-meta {
  font-size: 14px;
  color: var(--zj-color-text-secondary);
  display: block;
  margin-top: 8px;
}
.preview-link {
  font-size: 14px;
  color: var(--detail-accent);
  display: block;
  margin-top: 18px;
}
.media-list image {
  width: 100%;
  border-radius: 12px;
  margin-top: 24px;
}
.media-list text {
  font-size: 14px;
  color: var(--zj-color-text-secondary);
}
.empty {
  text-align: center;
  padding: 60px 10px;
}
.empty button {
  font-size: 14px;
  margin-top: 20px;
}
.back-link {
  text-align: left;
  margin: 0 0 12px;
  padding: 0;
  min-height: 44px;
  line-height: 44px;
  font-size: 14px;
  color: var(--zj-color-brand-hover);
  background: transparent;
}
.media-list {
  margin-top: 28px;
}
.media-list > view {
  margin-top: 16px;
}
.section-nav {
  gap: 8px;
  flex-wrap: wrap;
}
.section-nav button {
  min-width: 56px;
}
</style>
