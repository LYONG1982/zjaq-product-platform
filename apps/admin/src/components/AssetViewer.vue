<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from "vue";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
import worker from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { api } from "../api";

const props = defineProps<{
  productId: string;
  assetIds: string[];
  kind: "pdf" | "images" | "video";
  alts?: string[];
}>();
const canvas = ref<HTMLCanvasElement>(),
  videoSrc = ref(""),
  src = ref(""),
  error = ref(""),
  loading = ref(true),
  page = ref(1),
  total = ref(props.assetIds.length),
  scale = ref(1);
let pdf: PDFDocumentProxy | undefined,
  task: RenderTask | undefined,
  seq = 0,
  loadingTask: PDFDocumentLoadingTask | undefined;
let mediaRenewal: ReturnType<typeof setInterval> | undefined;
async function draw() {
  const n = ++seq;
  error.value = "";
  loading.value = true;
  task?.cancel();
  try {
    if (props.kind === "pdf") {
      if (!pdf) {
        const { getDocument, GlobalWorkerOptions } = await import("pdfjs-dist");
        GlobalWorkerOptions.workerSrc = worker;
        const request = api.assetRequest(props.productId, props.assetIds[0]);
        if (n !== seq) return;
        loadingTask = getDocument({
          url: request.url, httpHeaders: request.headers, rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true,
          enableXfa: false,
          useWasm: false,
          useSystemFonts: true,
          stopAtErrors: true,
          maxImageSize: 20000000,
        });
        pdf = await loadingTask.promise;
        total.value = pdf.numPages;
      }
      const p = await pdf.getPage(page.value);
      if (n !== seq) return;
      await nextTick();
      const c = canvas.value;
      if (!c) return;
      const v = p.getViewport({ scale: scale.value });
      c.width = v.width;
      c.height = v.height;
      task = p.render({ canvas: c, viewport: v });
      await task.promise;
    } else if (props.kind === "video") {
      videoSrc.value = await api.mediaAssetUrl(props.productId, props.assetIds[0]);
      if (!mediaRenewal) mediaRenewal = setInterval(() => {
        void api.mediaAssetUrl(props.productId, props.assetIds[0]).catch(() => { videoSrc.value = ""; error.value = "媒体会话已失效，请重新登录后重试"; });
      }, 4 * 60 * 1000);
    } else {
      const blob = await api.asset(
        props.productId,
        props.assetIds[page.value - 1],
      );
      if (n !== seq) return;
      URL.revokeObjectURL(src.value);
      src.value = URL.createObjectURL(blob);
    }
  } catch (e) {
    if (
      n === seq &&
      !(e instanceof Error && e.name === "RenderingCancelledException")
    )
      error.value = e instanceof Error ? e.message : "预览失败";
  } finally {
    if (n === seq) loading.value = false;
  }
}
onMounted(draw);
watch([page, scale], draw);
onBeforeUnmount(() => {
  if (mediaRenewal) clearInterval(mediaRenewal);
  videoSrc.value = "";
  seq++;
  task?.cancel();
  void loadingTask?.destroy();
  URL.revokeObjectURL(src.value);
});
</script>
<template>
  <div class="asset-viewer">
    <div v-if="kind !== 'video'" class="viewer-toolbar">
      <button :disabled="page <= 1 || loading" @click="page--">上一页</button
      ><span>第 {{ page }} / {{ total }} 页</span
      ><button :disabled="page >= total || loading" @click="page++">
        下一页</button
      ><template v-if="kind === 'pdf'"
        ><button
          :disabled="scale <= 0.5 || loading"
          aria-label="缩小预览"
          @click="scale -= 0.25"
        >
          −</button
        ><button
          :disabled="scale >= 2 || loading"
          aria-label="放大预览"
          @click="scale += 0.25"
        >
          ＋
        </button></template
      >
    </div>
    <p v-if="loading" role="status">正在加载预览…</p>
    <div v-if="error" class="error-inline" role="alert">
      {{ error }} <button @click="draw">重试预览</button>
    </div>
    <div class="viewer-page">
      <canvas
        v-if="kind === 'pdf'"
        ref="canvas"
        aria-label="PDF 预览页面"
      /><video v-else-if="kind === 'video' && videoSrc" :src="videoSrc" controls playsinline preload="metadata" style="width:100%;max-height:65vh" @error="error = '此浏览器无法播放此视频，或媒体会话已过期；请重试预览，必要时改用兼容的 MP4。'" /><img
        v-else-if="src"
        :src="src"
        :alt="alts?.[page - 1] || '资料第 ' + page + ' 页'"
      />
    </div>
  </div>
</template>
