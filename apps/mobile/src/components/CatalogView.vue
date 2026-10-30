<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, nextTick } from "vue";
import { api } from "../api";
import { catalogState, openCatalog, type CatalogKind } from "../navigation";
import ProductVisual from "./ProductVisual.vue";
import ContactBlock from "./ContactBlock.vue";
import FeedbackForm from "./FeedbackForm.vue";
import type { Responses } from "@zj/contracts";
import { siteImagePath } from "../site-images";
const props = defineProps<{ kind: CatalogKind }>();
type Row = Responses["PublicProductSummary"] | Responses["CatalogMaterialRow"];
const state = catalogState[props.kind];
const q = ref(state.q),
  category = ref(state.category),
  loading = ref(true),
  error = ref("");
const rows = ref<Row[]>([]),
  next = ref<string | null>(null),
  categories = ref<Responses["PublicCategory"][]>([]);
const banner = ref<Responses["SiteBanner"] | null>(null);
const bannerPath = ref<string | null>(null);
const contactBlock = ref<InstanceType<typeof ContactBlock> | null>(null);
let bannerSequence = 0, bannerActive = true;
let bannerTimer: ReturnType<typeof setTimeout> | undefined;
function clearBannerTimer() { if (bannerTimer) clearTimeout(bannerTimer); bannerTimer = undefined; }
function pauseBanner() { bannerActive = false; bannerSequence++; clearBannerTimer(); }
function scheduleBanner(seconds: number) {
  clearBannerTimer();
  if (props.kind !== "home" || !mounted || !bannerActive) return;
  const delay = Number.isInteger(seconds) ? Math.max(1, Math.min(30, seconds)) : 30;
  bannerTimer = setTimeout(() => { bannerTimer = undefined; void reloadBanner(); }, delay * 1000);
}
async function reloadBanner() {
  if (props.kind !== "home" || !bannerActive) return;
  clearBannerTimer(); const current = ++bannerSequence; let refresh = 30;
  try {
    const result = await api.publicSiteBanner(); if (current !== bannerSequence || !bannerActive) return;
    refresh = result.data.refreshAfterSeconds ?? 30;
    const path = await siteImagePath(result.data.imageData, "banner", result.data.version);
    if (current === bannerSequence && bannerActive) { banner.value = result.data; bannerPath.value = path; }
  } catch { if (current === bannerSequence) { banner.value = null; bannerPath.value = null; } }
  finally { if (current === bannerSequence && bannerActive) scheduleBanner(refresh); }
}
const homeSeriesIds = new Set(["miding", "miyi", "mishu", "ai"]);
const homeSeries = computed(() =>
  categories.value.filter((category) => homeSeriesIds.has(category.id)),
);
let sequence = 0,
  lastQuery = "",
  mounted = false,
  acceptScroll = false;
function rememberScroll(value: number) {
  if (acceptScroll) state.scroll = value;
}
function storeQuery() {
  state.q = q.value;
  state.category = category.value;
}
async function reload(append = false, restore = false) {
  if (restore) {
    q.value = state.q;
    category.value = state.category;
  }
  const query = {
    q: q.value.trim() || undefined,
    categoryId: category.value || undefined,
  };
  const key = JSON.stringify(query);
  if (key !== lastQuery) append = false;
  const seq = ++sequence,
    previousCount = Math.max(state.count, rows.value.length),
    scroll = restore ? state.scroll : 0;
  if (!append) acceptScroll = false;
  loading.value = true;
  error.value = "";
  storeQuery();
  if (!append && !restore) {
    rows.value = [];
    next.value = null;
    state.count = 0;
    state.scroll = 0;
  }
  const fetchRows = (cursor?: string) =>
    props.kind === "materials"
      ? api.materials({ ...query, cursor })
      : api.publicProducts(
          props.kind === "home" ? { limit: 100, cursor } : { ...query, cursor },
        );
  try {
    const [c, result] = await Promise.all([
      api.publicCategories(),
      fetchRows(append ? (next.value ?? undefined) : undefined),
    ]);
    const seen = new Set<string>();
    while (
      result.page.nextCursor &&
      (props.kind === "home" ||
        (restore && !append && result.data.length < previousCount))
    ) {
      if (seq !== sequence) return;
      const cursor = result.page.nextCursor;
      if (seen.has(cursor)) throw new Error("列表暂时无法继续读取，请重试");
      seen.add(cursor);
      const extra = await fetchRows(cursor);
      (result.data as Row[]).push(...extra.data);
      result.page = extra.page;
    }
    if (seq !== sequence) return;
    categories.value = [...c.data].sort((a, b) => a.sortOrder - b.sortOrder);
    const items =
      props.kind === "home"
        ? (result.data as Responses["PublicProductSummary"][])
            .filter((p) => p.pilotOrder != null)
            .sort((a, b) => a.pilotOrder! - b.pilotOrder!)
            .slice(0, 6)
        : result.data;
    rows.value = append ? [...rows.value, ...items] : items;
    next.value = props.kind === "home" ? null : result.page.nextCursor;
    state.count = rows.value.length;
    lastQuery = key;
    // Restore only after the loading row has left the document flow.
    loading.value = false;
    if (!append) {
      await nextTick();
      await new Promise<void>((resolve) =>
        uni.pageScrollTo({
          scrollTop: scroll,
          duration: 0,
          complete: () => {
            acceptScroll = true;
            resolve();
          },
        }),
      );
    }
  } catch (e) {
    if (seq === sequence)
      error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    if (seq === sequence) loading.value = false;
  }
}
function displayName(name: string) {
  const chars = Array.from(name);
  return chars.length > 15 ? chars.slice(0, 15).join("") + "…" : name;
}
function search() {
  if (props.kind === "home") openCatalog(q.value.trim());
  else void reload();
}
function choose(id: string) {
  if (props.kind === "home") openCatalog(q.value.trim(), id);
  else {
    category.value = id;
    void reload();
  }
}
function openSiteLink(link?: string | null) {
  if (!link) return;
  if (link.startsWith("/pages/")) { uni.switchTab({ url: link }); return; }
  // #ifdef H5
  window.open(link, "_blank", "noopener,noreferrer");
  // #endif
  // #ifdef MP-WEIXIN
  uni.navigateTo({ url: "/pages/banner-web/index?url=" + encodeURIComponent(link) });
  // #endif
}
function openBanner() { openSiteLink(banner.value?.link); }
function onKeyboard(event: KeyboardEvent, action: () => void) {
  // #ifdef H5
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    action();
  }
  // #endif
}
function clear() {
  q.value = "";
  category.value = "";
  void reload();
}
function pauseScroll() {
  acceptScroll = false;
}
function leavePage() {
  // #ifdef H5
  state.scroll = window.scrollY;
  // #endif
  pauseScroll();
}
function openProduct(id: string) {
  leavePage();
  uni.navigateTo({
    url:
      "/pages/detail/index?id=" +
      encodeURIComponent(id) +
      "&from=" +
      encodeURIComponent("/pages/" + props.kind + "/index"),
  });
}
function preview(item: Responses["CatalogMaterialRow"]) {
  leavePage();
  uni.navigateTo({
    url:
      "/pages/viewer/index?productId=" +
      encodeURIComponent(item.productId) +
      "&materialId=" +
      encodeURIComponent(item.material.materialId) +
      "&from=" +
      encodeURIComponent("/pages/materials/index"),
  });
}
onMounted(() => {
  mounted = true;
  void reload(false, true);
  void reloadBanner();
});
onUnmounted(() => { mounted = false; sequence++; pauseBanner(); });
defineExpose({
  reload: () => {
    if (mounted) { bannerActive = true; void reload(false, true); void reloadBanner(); void contactBlock.value?.reload(); }
  },
  rememberScroll,
  pauseScroll,
  pauseBanner,
});
</script>
<template>
  <view class="mobile-body">
    <view class="brand-row">
      <!-- #ifndef H5 -->
      <view class="brand-badge">中技</view>
      <text class="brand-title">中技安全产品平台</text>
      <!-- #endif -->
      <text class="demo-badge">本地演示</text>
    </view>
    <view :class="['mobile-hero', { home: kind === 'home' }]">
      <text v-if="kind === 'home'" class="title">{{
        kind === "home"
          ? "中技于密，安全于行"
          : kind === "products"
            ? "产品中心"
            : "资料中心"
      }}</text>
      <text v-if="kind === 'home'" class="intro"
        >产品介绍、应用场景与当前资料</text
      >
      <view v-if="kind === 'home' && banner && bannerPath" class="home-banner" :role="banner.link ? 'button' : 'img'" :tabindex="banner.link ? 0 : -1" @click="openBanner" @keydown="onKeyboard($event, openBanner)" :aria-label="banner.link ? '打开首页 Banner 链接' : '首页 Banner'">
        <image :src="bannerPath" mode="aspectFill" alt="首页 Banner" @error="bannerPath = null" />
      </view>
      <view class="search"
        ><input
          v-model="q"
          :maxlength="100"
          confirm-type="search"
          :placeholder="
            kind === 'materials' ? '搜索资料或产品名称' : '搜索产品名称'
          "
          :aria-label="kind === 'materials' ? '搜索资料' : '搜索产品'"
          @confirm="search"
        /><button
          v-if="q"
          class="clear-query"
          aria-label="清空搜索"
          @click="
            q = '';
            search();
          "
        >
          ×</button
        ><button @click="search">搜索</button></view
      >
    </view>
    <view v-if="kind !== 'home'" class="category-wrap"
      ><scroll-view class="category-scroll" :scroll-x="true"
        ><view class="category-row"
          ><button
            role="button" tabindex="0" @keydown="onKeyboard($event, () => choose(''))"
            :class="{ selected: !category }"
            @click="choose('')"
          >
            全部</button
          ><button
            v-for="c in categories"
            :key="c.id"
            role="button" tabindex="0" @keydown="onKeyboard($event, () => choose(c.id))"
            :class="{ selected: category === c.id }"
            @click="choose(c.id)"
          >
            {{ c.name }}
          </button></view
        ></scroll-view
      ><text class="scroll-hint" aria-hidden="true">›</text></view
    >
    <view v-if="kind === 'home'" class="series-section">
      <view class="series-heading">产品系列</view>
      <view class="series-grid">
        <button
          v-for="c in homeSeries"
          :key="c.id"
          class="series-card"
          role="button" tabindex="0" @keydown="onKeyboard($event, () => choose(c.id))"
          :aria-label="`${c.name}，${c.productCount} 款产品，查看系列`"
          @click="choose(c.id)"
        >
          <view class="series-title-row">
            <image
              :src="'/static/series/' + c.id + '.png'"
              mode="aspectFit"
              class="series-entry-icon"
              aria-hidden="true"
            />
            <text class="series-name">{{ c.name }}</text>
          </view>
          <view class="series-meta">
            <text class="series-count">{{ c.productCount }} 款产品</text>
            <text class="series-action">查看系列 →</text>
          </view>
        </button>
      </view>
    </view>
    <view v-if="kind === 'home'" class="section-head"
      ><text>首批产品</text
      ><button @click="openCatalog()">浏览全部 →</button></view
    >
    <view v-if="error" class="empty" role="alert"
      ><text class="empty-title">暂时无法连接</text><text>{{ error }}</text
      ><button @click="reload()">重新加载</button></view
    >
    <view v-else-if="loading && !rows.length" class="empty" role="status"
      >正在读取…</view
    >
    <template v-else>
      <text v-if="loading" class="loading" role="status">正在读取…</text>
      <view v-if="!rows.length" class="empty"
        ><text class="empty-title">{{
          kind === "home"
            ? "产品资料正在整理"
            : q || category
              ? "没有找到相关内容"
              : "暂无发布内容"
        }}</text
        ><button v-if="kind === 'home'" @click="openCatalog()">浏览产品</button
        ><button v-else-if="q || category" @click="clear">
          清除筛选
        </button></view
      >
      <view v-else class="published-list" :aria-busy="loading">
        <template
          v-for="item in rows"
          :key="
            'name' in item
              ? item.productId
              : item.productId + item.material.materialId
          "
        >
          <button
            v-if="'name' in item"
            class="product-card"
            :aria-label="item.name"
            @click="openProduct(item.productId)"
          >
            <view class="card-top"
              ><ProductVisual :path="item.coverPath" :alt="item.name" :category-id="item.categoryId" /><view
                class="product-copy"
                ><text class="published-title">{{
                  displayName(item.name)
                }}</text
                ><text class="category-label">{{
                  item.categoryName
                }}</text></view
              ></view
            ><text class="published-description">{{
              item.tagline || "产品介绍待完善"
            }}</text
            ><view class="card-foot"
              ><text>了解产品</text></view
            >
          </button>
          <view v-else class="material-card"
            ><text class="category-label"
              >{{ item.material.previewKind === "pdf" ? "PDF" : item.material.previewKind === "video" ? "视频" : "图集" }} ·
              {{ item.material.previewKind === "video" ? "" : item.material.pageCount + " 页" }}</text
            ><text class="published-title">{{ item.material.name }}</text
            ><button class="product-link" @click="openProduct(item.productId)">
              所属产品：{{ item.productName }} →</button
            ><view class="material-foot"
              ><text
                >{{ item.material.versionLabel }} ·
                {{ item.material.publishedAt.slice(0, 10) }}</text
              ><button class="preview-button" @click="preview(item)">
                预览 →
              </button></view
            ></view
          >
        </template>
        <button
          v-if="next"
          :disabled="loading"
          class="load-more"
          @click="reload(true)"
        >
          {{ loading ? "正在读取…" : "加载更多" }}
        </button>
      </view>
    </template>
    <view v-if="kind === 'home' && banner?.introduction" class="home-introduction" :role="banner.introLink ? 'link' : undefined" :tabindex="banner.introLink ? 0 : -1" @click="openSiteLink(banner?.introLink)" @keydown="onKeyboard($event, () => openSiteLink(banner?.introLink))"><text>{{ banner.introduction }}</text><text v-if="banner.introLink" aria-hidden="true"> ↗</text></view>
    <ContactBlock v-if="kind === 'home'" ref="contactBlock" />
    <FeedbackForm v-if="kind === 'home'" />
  </view>
</template>
<style scoped>
.home-banner { width: 100%; height: 112px; overflow: hidden; border-radius: 10px; margin: 12px 0; }
.home-banner image { width: 100%; height: 100%; }
.home-introduction { padding: 18px; margin: 18px 0; border-radius: 12px; background: #eef5ff; color: #13569e; line-height: 1.6; overflow-wrap: anywhere; }
.mobile-body {
  padding: 16px 16px calc(24px + env(safe-area-inset-bottom));
}
.brand-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.brand-badge {
  background: var(--zj-color-navy);
  color: white;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  text-align: center;
  line-height: 32px;
  font-size: 14px;
  flex: none;
}
.brand-title {
  font-size: 16px;
  font-weight: 650;
}
.demo-badge {
  margin-left: auto;
  color: var(--zj-color-brand-hover);
  font-size: 14px;
}
/* #ifdef H5 */
.brand-row {
  flex-wrap: nowrap;
  justify-content: flex-end;
}
.brand-row .demo-badge {
  flex: none;
  white-space: nowrap;
}
/* #endif */
.mobile-hero {
  padding: 20px 0 16px;
}
.mobile-hero.home {
  padding: 12px 0 10px;
}
.title {
  display: block;
  font-size: 24px;
  line-height: 1.45;
  font-weight: 650;
}
.intro {
  display: block;
  font-size: 14px;
  color: var(--zj-color-text-secondary);
  margin-top: 8px;
}
.search {
  display: flex;
  gap: 4px;
  align-items: center;
  margin-top: 16px;
  padding: 4px;
  border: 1px solid var(--zj-color-control-border);
  border-radius: 10px;
  background: white;
}
.mobile-hero.home .search {
  margin-top: 10px;
}
.search input {
  min-width: 0;
  flex: 1;
  height: 44px;
  font-size: 14px;
  padding-left: 8px;
}
.search button {
  margin: 0;
  padding: 0 12px;
  line-height: 44px;
  min-width: 44px;
  font-size: 14px;
  background: var(--zj-color-brand);
  color: white;
  border-radius: 6px;
}
.search .clear-query {
  padding: 0;
  background: white;
  color: var(--zj-color-text);
  font-size: 22px;
}
.category-wrap {
  position: relative;
  margin: 0 -16px 16px;
  padding: 0 0 0 16px;
}
.series-section {
  margin: 0 0 16px;
}
.series-heading {
  margin-bottom: 8px;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 600;
}
.series-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}
.series-card {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  width: calc(50% - 5px);
  min-height: 112px;
  margin: 0;
  padding: 12px 10px;
  box-sizing: border-box;
  border: 1px solid var(--zj-color-border);
  border-radius: 12px;
  background: white;
  text-align: left;
  line-height: 1.5;
}
.series-title-row {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-width: 0;
}
.series-entry-icon {
  width: 48px;
  height: 48px;
  flex: none;
  box-sizing: border-box;
  padding: 2px;
  border-radius: 12px;
  background: linear-gradient(145deg, #f5faff, #eaf2ff);
}
.series-name {
  min-width: 0;
  font-size: 14px;
  font-weight: 650;
  color: var(--zj-color-text);
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.series-count {
  min-width: 0;
  font-size: 12px;
  line-height: 1.35;
  color: var(--zj-color-text-secondary);
  overflow-wrap: anywhere;
}
.series-meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  width: 100%;
  margin-top: 10px;
}
.series-action {
  flex: none;
  font-size: 12px;
  color: var(--zj-color-brand-hover);
}
.series-card:focus-visible,
.category-row button:focus-visible {
  outline: 2px solid var(--zj-color-brand-hover);
  outline-offset: 2px;
}
.category-scroll {
  width: 100%;
  white-space: nowrap;
}
.category-row {
  display: inline-flex;
  gap: 8px;
  padding-right: 32px;
}
.category-row button {
  flex: none;
  margin: 0;
  border: 1px solid var(--zj-color-border);
  background: white;
  border-radius: 8px;
  padding: 0 12px;
  line-height: 44px;
  font-size: 14px;
  white-space: nowrap;
}
.category-row .selected {
  border-color: var(--zj-color-brand);
  background: var(--zj-color-brand-soft);
  color: var(--zj-color-brand-hover);
}
.scroll-hint {
  position: absolute;
  right: 0;
  top: 0;
  width: 24px;
  line-height: 46px;
  text-align: center;
  background: linear-gradient(90deg, #f5f7f900, var(--zj-color-canvas) 40%);
  pointer-events: none;
  color: var(--zj-color-text-secondary);
}
.section-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
  font-size: 18px;
  font-weight: 600;
}
.section-head button {
  margin: 0;
  background: transparent;
  padding: 0 4px;
  font-size: 14px;
  line-height: 44px;
  color: var(--zj-color-brand-hover);
}
.published-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.product-card,
.material-card {
  margin: 0;
  padding: 16px;
  background: white;
  border: 1px solid var(--zj-color-border);
  border-radius: 12px;
  text-align: left;
  line-height: 1.6;
  box-sizing: border-box;
}
.card-top {
  display: flex;
  gap: 12px;
  align-items: flex-start;
}
.product-copy {
  min-width: 0;
  flex: 1;
}
.published-title {
  display: block;
  font-size: var(--zj-font-size-card-title, 18px);
  font-weight: 650;
  line-height: 1.5;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}
.category-label {
  display: block;
  font-size: 14px;
  color: var(--zj-color-brand-hover);
  margin-top: 6px;
  overflow-wrap: anywhere;
}
.published-description {
  display: block;
  font-size: 16px;
  color: var(--zj-color-text-secondary);
  margin-top: 12px;
  overflow-wrap: anywhere;
}
.card-foot {
  display: flex;
  justify-content: flex-end;
  font-size: 14px;
  color: var(--zj-color-brand-hover);
  margin-top: 12px;
  min-height: 28px;
  align-items: center;
}
.empty {
  text-align: center;
  padding: 24px 16px;
  background: white;
  border: 1px solid var(--zj-color-border);
  border-radius: 12px;
  color: var(--zj-color-text-secondary);
  font-size: 14px;
}
.empty-title {
  display: block;
  font-size: 18px;
  font-weight: 600;
  color: var(--zj-color-text);
}
.empty button,
.load-more {
  font-size: 14px;
  margin: 16px 0 0;
  line-height: 44px;
  background: white;
  border: 1px solid var(--zj-color-control-border);
  border-radius: 8px;
}
.loading {
  display: block;
  font-size: 14px;
  padding-bottom: 8px;
}
.product-link {
  font-size: 14px;
  line-height: 1.6;
  min-height: 44px;
  padding: 8px 0;
  margin: 8px 0;
  background: transparent;
  color: var(--zj-color-brand-hover);
  text-align: left;
  overflow-wrap: anywhere;
}
.material-card > .published-title {
  margin-top: 8px;
}
.material-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
  font-size: 14px;
  color: var(--zj-color-text-secondary);
}
.preview-button {
  margin: 0 0 0 auto;
  line-height: 44px;
  padding: 0 16px;
  font-size: 14px;
  background: var(--zj-color-brand-soft);
  color: var(--zj-color-brand-hover);
  border-radius: 8px;
}
</style>
