<script setup lang="ts">
import { ref } from "vue";
import { onLoad, onShow } from "@dcloudio/uni-app";
import type { Responses } from "@zj/contracts";
import { api } from "../../api";
import ProductVisual from "../../components/ProductVisual.vue";
import { safeSource, backToSource } from "../../navigation";
const product = ref<Responses["PublicProduct"]>(),
  error = ref(""),
  loading = ref(true);
let source = "/pages/products/index";
let id = "",
  sequence = 0;
const groups = [
  ["problemValues", "问题与价值"],
  ["features", "核心能力"],
  ["scenarios", "应用场景"],
] as const;
import { technicalLabels as labels } from "@zj/api-client";

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
  <view class="detail-page"
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
        ><text class="tagline">{{ product.tagline }}</text
        ><text class="paragraph">{{ product.summary }}</text
        ><text v-if="product.audiences" class="paragraph"
          >适用对象：{{ product.audiences }}</text
        ></view
      ><view class="section-nav" aria-label="产品详情分区"
        ><button
          v-if="product.problemValues.length"
          @click="jump('problemValues')"
        >
          价值</button
        ><button v-if="product.features.length" @click="jump('features')">
          能力</button
        ><button v-if="product.scenarios.length" @click="jump('scenarios')">
          场景</button
        ><button @click="jump('materials')">资料</button></view
      ><template v-for="[key, label] in groups" :key="key"
        ><view
          v-if="product[key].length"
          :id="'section-' + key"
          class="detail-section"
          ><text class="section-title">{{ label }}</text
          ><view
            v-for="item in product[key]"
            :key="item.id"
            class="feature-card"
            ><text class="feature-title">{{ item.title }}</text
            ><text class="paragraph">{{ item.text }}</text></view
          ></view
        ></template
      ><view v-if="product.media.length" class="media-list"
        ><text class="section-title">产品展示</text
        ><view v-for="m in product.media" :key="m.mediaId"
          ><ProductVisual :path="m.path" :alt="m.alt" large /><text>{{
            m.alt
          }}</text></view
        ></view
      ><view v-if="Object.keys(product.technical).length" class="detail-section"
        ><text class="section-title">技术与使用说明</text
        ><view class="feature-card"
          ><view
            v-for="(v, k) in product.technical"
            :key="k"
            class="technical-row"
            ><text class="feature-title">{{ labels[k] ?? k }}</text
            ><text class="paragraph">{{ v }}</text></view
          ></view
        ></view
      ><view v-if="product.boundaries" class="boundary"
        ><text class="feature-title">适用边界</text
        ><text class="paragraph">{{ product.boundaries }}</text></view
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
            {{ m.previewKind === "pdf" ? "PDF" : "图片" }} ·
            {{ m.pageCount }} 页 · {{ m.publishedAt.slice(0, 10) }}</text
          ><text class="preview-link">预览 →</text></button
        ><text v-if="!product.materials.length" class="paragraph"
          >暂无可预览资料</text
        ></view
      ></template
    ></view
  >
</template>
<style scoped>
.detail-page {
  padding: 12px 16px calc(32px + env(safe-area-inset-bottom));
}
.category-label {
  color: var(--zj-color-brand-hover);
  font-size: 14px;
}
.detail-title {
  display: block;
  font-size: 24px;
  line-height: 1.45;
  font-weight: 650;
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
  color: var(--zj-color-brand-hover);
  background: white;
  border: 1px solid var(--zj-color-border);
  border-radius: 6px;
}
.section-title {
  display: block;
  font-size: 20px;
  font-weight: 600;
  margin-bottom: 16px;
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
.boundary {
  background: #eaf3f4;
  padding: 16px;
  border-radius: 12px;
  margin-top: 28px;
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
  color: var(--zj-color-brand-hover);
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
