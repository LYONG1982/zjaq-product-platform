<script setup lang="ts">
import { ref, nextTick } from "vue";
import { onLoad, onShow, onUnload } from "@dcloudio/uni-app";
import type { Responses } from "@zj/contracts";
import AnalyticsNotice from "../../components/AnalyticsNotice.vue";
import { ApiError } from "@zj/api-client";
import { api, resourceUrl, apiBase } from "../../api";
import { safeSource, backToSource } from "../../navigation";
// #ifdef H5
import { PreviewSession } from "@zj/api-client/preview";
let session: PreviewSession | undefined,
  canvas: HTMLCanvasElement | undefined,
  image: HTMLImageElement | undefined;
// #endif
const manifest = ref<Responses["PreviewManifest"]>(),
  page = ref(1),
  zoom = ref(1),
  error = ref(""),
  loading = ref(true),
  imagePath = ref(""),
  native = ref(false),
  videoPath = ref("");
const analyticsNotice = ref<InstanceType<typeof AnalyticsNotice> | null>(null);
const source = ref("/pages/materials/index");
let productId = "",
  materialId = "",
  tempPath = "",
  disposed = false,
  sequence = 0;
const fail = (e: unknown) => {
  videoPaused();
  videoPath.value = "";
  error.value = e instanceof Error ? e.message : "预览失败，请重试";
  imagePath.value = "";
  loading.value = false;
};
function openProduct() {
  uni.navigateTo({
    url: "/pages/detail/index?id=" + encodeURIComponent(productId),
  });
}
async function check() {
  const latest = (await api.manifest(productId, materialId)).data;
  if (
    manifest.value &&
    (latest.releaseId !== manifest.value.releaseId ||
      latest.versionId !== manifest.value.versionId)
  )
    throw new ApiError(409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
  return latest;
}
async function open() {
  const seq = ++sequence;
  error.value = "";
  loading.value = true;
  try {
    const m = (await api.manifest(productId, materialId)).data;
    if (disposed || seq !== sequence) return;
    manifest.value = m;
    page.value = 1;
    videoPath.value = m.previewKind === "video" ? resourceUrl(m.parts[0].path) : "";
    if (m.previewKind === "video") { loading.value = false; return; }
    // #ifdef H5
    session?.close();
    session = new PreviewSession(apiBase, m, import.meta.env.BASE_URL + "pdf/");
    await nextTick();
    const root = document.getElementById("preview-surface");
    if (!root) throw new Error("预览区域暂未准备好");
    root.replaceChildren();
    canvas = document.createElement("canvas");
    image = document.createElement("img");
    image.alt = m.name;
    root.append(canvas, image);
    canvas.hidden = true;
    image.hidden = true;
    // #endif
    await render();
  } catch (e) {
    if (seq === sequence) fail(e);
  }
}
async function render() {
  if (!manifest.value) return;
  loading.value = true;
  error.value = "";
  try {
    await check();
    if (disposed) return;
    if (manifest.value.previewKind === "video") { loading.value = false; return; }
    // #ifdef H5
    if (session && canvas && image)
      await session.render(
        canvas,
        image,
        page.value,
        zoom.value,
        Math.max(240, window.innerWidth - 32),
      );
    void analyticsNotice.value?.record(manifest.value);
    // #endif
    // #ifdef MP-WEIXIN
    native.value = true;
    if (manifest.value.previewKind === "images") {
      const part = manifest.value.parts.find((p) => p.pageIndex === page.value);
      if (!part) throw new Error("预览页不存在");
      imagePath.value = resourceUrl(part.path);
    }
    // #endif
    loading.value = false;
  } catch (e) {
    fail(e);
  }
}
let videoCheck: ReturnType<typeof setInterval> | undefined;
async function videoStarted() {
  try { await check(); if (manifest.value) void analyticsNotice.value?.record(manifest.value); }
  catch (e) { fail(e); return; }
  if (!videoCheck) videoCheck = setInterval(() => { void check().catch(fail); }, 15000);
}
function videoPaused() { if (videoCheck) clearInterval(videoCheck); videoCheck = undefined; }
function pageInput(event: unknown) {
  const detail = (event as { detail?: unknown }).detail;
  if (detail && typeof detail === 'object' && 'value' in detail) void turn(Number(detail.value));
}
async function turn(n: number) {
  if (!Number.isFinite(n) || !Number.isInteger(n) || loading.value) return;
  page.value = Math.max(1, Math.min(manifest.value?.pageCount ?? 1, n));
  await render();
}
function clearTemp() {
  // #ifdef MP-WEIXIN
  if (tempPath) {
    uni.getFileSystemManager().unlink({ filePath: tempPath, fail: () => {} });
    tempPath = "";
  }
  // #endif
}
async function nativePdf() {
  if (!manifest.value) return;
  loading.value = true;
  error.value = "";
  try {
    await check();
    clearTemp();
    const path = await new Promise<string>((resolve, reject) =>
      uni.downloadFile({
        url: resourceUrl(manifest.value!.parts[0].path),
        timeout: 30000,
        success: (r) =>
          r.statusCode === 200
            ? resolve(r.tempFilePath)
            : reject(new Error("资料暂不可用")),
        fail: () => reject(new Error("资料下载失败，请检查网络后重试")),
      }),
    );
    tempPath = path;
    await check();
    if (disposed) {
      clearTemp();
      return;
    }
    await new Promise<void>((resolve, reject) =>
      uni.openDocument({
        filePath: path,
        fileType: "pdf",
        showMenu: false,
        success: () => resolve(),
        fail: () => reject(new Error("无法打开 PDF，请稍后重试")),
      }),
    );
    loading.value = false;
    void analyticsNotice.value?.record(manifest.value);
  } catch (e) {
    clearTemp();
    fail(e);
  }
}
onLoad((q) => {
  productId = q?.productId ?? "";
  materialId = q?.materialId ?? "";
  source.value = safeSource(q?.from, "/pages/materials/index");
  void open();
});
onShow(() => {
  if (manifest.value)
    void check().catch((e) => {
      clearTemp();
      fail(e);
    });
});
onUnload(() => {
  videoPaused();
  disposed = true;
  sequence++;
  clearTemp();
  // #ifdef H5
  session?.close();
  // #endif
});
</script>
<template>
<!-- #ifdef H5 -->
  <view class="h5-v2 v2-viewer">
    <view class="v2-viewer-header"><button role="button" tabindex="0" @click="backToSource(source)" aria-label="返回上一页">← 资料预览</button><text class="v2-demo">本地演示</text></view>
    <view class="v2-viewer-title"><text>{{ manifest?.name ?? '资料预览' }}</text><text class="version">{{ manifest ? (manifest.previewKind === 'pdf' ? 'PDF' : manifest.previewKind === 'video' ? '视频' : '图集') + ' / ' + manifest.versionLabel + (manifest.previewKind === 'video' ? '' : ' / 共 ' + manifest.pageCount + ' 页') : '' }}</text></view>
    <view v-if="error" class="v2-viewer-error" role="alert"><text>{{ error }}</text><button role="button" tabindex="0" @click="open">重新打开</button></view>
    <view v-show="!error">
      <video v-if="manifest?.previewKind === 'video' && videoPath" :src="videoPath" controls :autoplay="false" :show-center-play-btn="true" class="material-video" @play="videoStarted" @pause="videoPaused" @ended="videoPaused" @error="fail(new Error('此终端无法播放该视频或资料已更新；请重试，或联系管理员提供兼容的 MP4。'))" />
      <text v-if="loading" class="v2-viewer-loading" role="status">正在读取…</text>
      <view id="preview-surface" class="surface" v-show="manifest?.previewKind !== 'video'" />
      <view v-if="manifest?.previewKind !== 'video'" class="v2-view-controls"><button role="button" tabindex="0" :disabled="loading || page <= 1" @click="turn(page - 1)">上一页</button><view class="v2-page-input"><input type="number" :value="String(page)" aria-label="页码" :disabled="loading" @confirm="pageInput" @blur="pageInput" /><text>/ {{ manifest?.pageCount ?? '—' }}</text></view><button role="button" tabindex="0" class="v2-next-page" :disabled="loading || page >= (manifest?.pageCount ?? 1)" @click="turn(page + 1)">下一页</button></view>
      <view v-if="manifest?.previewKind !== 'video'" class="v2-zoom-controls"><button role="button" tabindex="0" :disabled="loading || zoom <= 0.5" @click="zoom = Math.max(0.5, zoom - 0.25); render()">− 缩小</button><text>{{ Math.round(zoom * 100) }}%</text><button role="button" tabindex="0" :disabled="loading || zoom >= 2.5" @click="zoom = Math.min(2.5, zoom + 0.25); render()">放大 +</button></view>
      <text v-if="manifest && !loading" class="v2-current-version">正在查看当前发布版本</text>
      <button role="button" tabindex="0" class="v2-owner-product" @click="openProduct">查看所属产品 ↗</button>
      <AnalyticsNotice ref="analyticsNotice" />
    </view>
  </view>

<!-- #endif -->
<!-- #ifndef H5 -->

  <view class="viewer"
    ><view class="viewer-navigation"
      ><button role="button" tabindex="0" @click="backToSource(source)">← 返回上一页</button
      ><button role="button" tabindex="0" v-if="!source.startsWith('/pages/detail/')" @click="openProduct">
        查看所属产品
      </button></view
    ><view class="viewer-title"
      ><text>{{ manifest?.name ?? "资料预览" }}</text
      ><text class="version">{{ manifest?.versionLabel }}</text></view
    ><AnalyticsNotice ref="analyticsNotice" /><view v-if="error" class="error" role="alert"
      ><text>{{ error }}</text
      ><button role="button" tabindex="0" @click="open">重新打开</button></view
    ><view v-show="!error"
      ><view
        v-if="manifest?.previewKind !== 'video' && (!native || manifest?.previewKind === 'images')"
        class="controls"
        ><button role="button" tabindex="0" :disabled="loading || page <= 1" @click="turn(page - 1)">
          上一页</button
        ><input
          type="number"
          :value="String(page)"
          aria-label="页码"
          :disabled="loading"
          @confirm="turn(Number($event.detail.value))"
        /><text>/ {{ manifest?.pageCount ?? "—" }}</text
        ><button role="button" tabindex="0"
          :disabled="loading || page >= (manifest?.pageCount ?? 1)"
          @click="turn(page + 1)"
        >
          下一页
        </button></view
      ><view v-if="!native && manifest?.previewKind !== 'video'" class="controls"
        ><button role="button" tabindex="0"
          :disabled="loading || zoom <= 0.5"
          @click="
            zoom = Math.max(0.5, zoom - 0.25);
            render();
          "
        >
          缩小</button
        ><text>{{ Math.round(zoom * 100) }}%</text
        ><button role="button" tabindex="0"
          :disabled="loading || zoom >= 2.5"
          @click="
            zoom = Math.min(2.5, zoom + 0.25);
            render();
          "
        >
          放大
        </button></view
      ><video v-if="manifest?.previewKind === 'video' && videoPath" :src="videoPath" controls :autoplay="false" :show-center-play-btn="true" class="material-video" @play="videoStarted" @pause="videoPaused" @ended="videoPaused" @error="fail(new Error('此终端无法播放该视频或资料已更新；请重试，或联系管理员提供兼容的 MP4。'))" /><text v-if="manifest?.previewKind === 'video'" class="video-help">视频不转码。MOV/WebM 的支持取决于当前微信或浏览器，建议使用 MP4。</text><text v-if="loading" class="loading" role="status">正在读取…</text
      ><!-- #ifdef H5 --><view
        id="preview-surface"
        class="surface"
      /><!-- #endif --><!-- #ifdef MP-WEIXIN --><image
        v-if="imagePath"
        class="image-page"
        :src="imagePath"
        mode="widthFix"
        @load="analyticsNotice?.record(manifest)"
        @error="fail(new Error('图片载入失败，请重试'))"
      /><view v-if="manifest?.previewKind === 'pdf'" class="native-pdf"
        ><text>使用微信预览 PDF</text
        ><button role="button" tabindex="0" :disabled="loading" @click="nativePdf">打开资料</button></view
      ><!-- #endif --></view
    ></view
  >

<!-- #endif -->
</template>
<style scoped>
.viewer {
  min-height: 100vh;
  background: #17242f;
  color: #edf4f8;
  padding: 20px 12px;
  box-sizing: border-box;
}
.viewer-title {
  font-size: 18px;
  font-weight: 600;
  line-height: 1.5;
}
.version {
  display: block;
  font-size: 14px;
  color: #b9cbd7;
  margin-top: 6px;
}
.controls {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin: 20px 0;
  font-size: 14px;
  flex-wrap: wrap;
}
.controls input {
  width: 42px;
  background: white;
  color: #173046;
  border-radius: 4px;
  text-align: center;
  height: 34px;
}
.viewer button {
  background: #2b4353;
  border: 1px solid #6e889a;
  color: white;
  font-size: 14px;
  line-height: 36px;
  padding: 0 12px;
  margin: 0;
  border-radius: 5px;
}
.viewer button[disabled] {
  opacity: 0.5;
}
.surface {
  overflow: auto;
  text-align: center;
  min-height: 60vh;
} /* #ifdef H5 */
.surface :deep(canvas),
.surface :deep(img) {
  margin: auto;
}
/* #endif */
.loading {
  display: block;
  text-align: center;
  font-size: 14px;
  color: #c5d6e1;
  padding: 20px;
}
.error,
.native-pdf {
  padding: 60px 16px;
  text-align: center;
}
.error button,
.native-pdf button {
  margin-top: 24px;
}
.material-video { width: 100%; height: 56vw; margin-top: 20px; }
.video-help { display: block; padding: 12px 0; font-size: 13px; color: #b9cbd7; }
.image-page {
  width: 100%;
}
.viewer-navigation {
  display: flex;
  justify-content: space-between;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}
.viewer-navigation button {
  color: #edf4f8;
  background: transparent;
  margin: 0;
  padding: 0 6px;
  min-height: 44px;
  font-size: 14px;
  line-height: 44px;
}
.controls button {
  min-height: 44px;
  min-width: 44px;
}
.controls input {
  min-height: 44px;
}
.viewer {
  padding-bottom: calc(24px + env(safe-area-inset-bottom));
}
</style>
