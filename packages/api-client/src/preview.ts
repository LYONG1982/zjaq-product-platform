import { ApiError, createClient } from "./index";
import type { Responses } from "@zj/contracts";
import type {
  PDFDocumentProxy,
  PDFDocumentLoadingTask,
  RenderTask,
} from "pdfjs-dist";
export type Manifest = Responses["PreviewManifest"];
/** One document and one rendered page. Never caches page bitmaps or mixes releases. */
export class PreviewSession {
  private loadingTask?: PDFDocumentLoadingTask;
  private pdf?: PDFDocumentProxy;
  private task?: RenderTask;
  private sequence = 0;
  private stopped = false;
  private imageUrl?: string;
  private client;
  constructor(
    readonly base: string,
    readonly manifest: Manifest,
    readonly assetsBase = "/pdf/",
  ) {
    this.client = createClient(base);
  }
  async check() {
    const latest = (
      await this.client.manifest(
        this.manifest.productId,
        this.manifest.materialId,
      )
    ).data;
    if (
      latest.releaseId !== this.manifest.releaseId ||
      latest.versionId !== this.manifest.versionId
    )
      throw new ApiError(409, "VERSION_CHANGED", "资料已更新，请打开当前版本");
    if (this.stopped) throw new Error("预览已关闭");
  }
  async render(
    canvas: HTMLCanvasElement,
    image: HTMLImageElement,
    page: number,
    zoom: number,
    width: number,
  ) {
    const seq = ++this.sequence;
    const previous = this.task;
    previous?.cancel();
    if (previous) await previous.promise.catch(() => {});
    canvas.style.visibility = "hidden";
    image.style.visibility = "hidden";
    await this.check();
    if (seq !== this.sequence || this.stopped) return;
    const url = (path: string) =>
      this.base.replace(/\/$/, "") + path.replace(/^\/api\/v1/, "");
    if (this.manifest.previewKind === "pdf") {
      if (!this.pdf) {
        const lib = await import("pdfjs-dist");
        lib.GlobalWorkerOptions.workerSrc =
          this.assetsBase + "pdf.worker.min.mjs";
        if (seq !== this.sequence || this.stopped) return;
        const loadingTask = lib.getDocument({
          url: url(this.manifest.parts[0].path), rangeChunkSize: 65536, disableAutoFetch: true, disableStream: true,
          cMapUrl: this.assetsBase + "cmaps/",
          cMapPacked: true,
          standardFontDataUrl: this.assetsBase + "standard_fonts/",
          wasmUrl: this.assetsBase + "wasm/",
        });
        this.loadingTask = loadingTask;
        const pdf = await loadingTask.promise;
        if (seq !== this.sequence || this.stopped) {
          await loadingTask.destroy();
          return;
        }
        this.pdf = pdf;
      }
      const p = await this.pdf.getPage(page);
      if (seq !== this.sequence || this.stopped) return;
      const viewport = p.getViewport({
        scale: Math.min(width / p.getViewport({ scale: 1 }).width, 1.4) * zoom,
      });
      const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.ceil(viewport.width * pixelRatio);
      canvas.height = Math.ceil(viewport.height * pixelRatio);
      canvas.style.width = viewport.width + "px";
      canvas.style.height = viewport.height + "px";
      this.task = p.render({
        canvas,
        viewport,
        transform: [pixelRatio, 0, 0, pixelRatio, 0, 0],
      });
      try {
        await this.task.promise;
      } catch (e) {
        if ((e as Error).name === "RenderingCancelledException") return;
        throw e;
      }
      if (seq !== this.sequence || this.stopped) return;
      await this.check();
      canvas.style.visibility = "visible";
      canvas.hidden = false;
      image.hidden = true;
      p.cleanup();
    } else {
      const part = this.manifest.parts.find((p) => p.pageIndex === page);
      if (!part) throw new Error("预览页不存在");
      const response = await fetch(url(part.path), {
        cache: "no-store",
        signal: AbortSignal.timeout(20000),
      });
      if (!response.ok)
        throw new ApiError(
          response.status,
          "RESOURCE_UNAVAILABLE",
          "资料不可用，请重新打开",
        );
      const blob = await response.blob();
      if (seq !== this.sequence || this.stopped) return;
      if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
      this.imageUrl = URL.createObjectURL(blob);
      image.src = this.imageUrl;
      await image.decode();
      await this.check();
      if (seq !== this.sequence || this.stopped) return;
      image.style.width = Math.min(width, image.naturalWidth) * zoom + "px";
      image.style.visibility = "visible";
      image.hidden = false;
      canvas.hidden = true;
    }
  }
  close() {
    this.stopped = true;
    this.sequence++;
    this.task?.cancel();
    void this.loadingTask?.destroy();
    if (this.imageUrl) URL.revokeObjectURL(this.imageUrl);
  }
}
