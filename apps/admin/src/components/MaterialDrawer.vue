<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Domain } from "@zj/contracts";
import Modal from "./Modal.vue";
import AssetViewer from "./AssetViewer.vue";
import { api, copy } from "../api";
import { uploadFile } from "../upload";
import { nextMaterialVersion, validMaterialVersion } from "../versions";
const props = defineProps<{ productId: string; initial?: Domain["MaterialRef"] }>();
const emit = defineEmits<{ save: [material: Domain["MaterialRef"]]; cancel: [] }>();
const name = ref(props.initial?.name ?? ""),
  kind = ref<Domain["MaterialRef"]["kind"]>(props.initial?.kind ?? "brochure"),
  category = ref<Domain["MaterialRef"]["category"] | "">(props.initial?.category ?? ""),
  subCategory = ref<Domain["MaterialRef"]["subCategory"] | "">(props.initial?.subCategory ?? ""),
  version = ref(props.initial?.versionLabel ?? "V01.0"),
  applicable = ref(props.initial?.applicableVersion ?? ""),
  previewKind = ref<"pdf" | "images" | "video">(props.initial?.preview.kind ?? "pdf"),
  pdf = ref<{ assetId: string; pageCount: number } | null>(props.initial?.preview.kind === "pdf" ? { assetId: props.initial.preview.assetId, pageCount: props.initial.preview.pageCount } : null),
  pages = ref<{ assetId: string; pageIndex: number; alt: string }[]>(props.initial?.preview.kind === "images" ? copy(props.initial.preview.pages) : []),
  video = ref<{ assetId: string; mimeType: "video/mp4" | "video/quicktime" | "video/webm" } | null>(props.initial?.preview.kind === "video" ? { assetId: props.initial.preview.assetId, mimeType: props.initial.preview.mimeType } : null),
  source = ref(props.initial?.sourceAssetId ?? null),
  busy = ref(false), message = ref(""), error = ref(""),
  showPreview = ref(false), confirmDiscard = ref(false), nameEdited = ref(!!props.initial);
const materialId = props.initial?.materialId ?? crypto.randomUUID();
const versionId = props.initial?.versionId ?? crypto.randomUUID();
const subCategoryOptions = computed(() => category.value === "promotional"
  ? ([["deck", "演示文稿"], ["onepager", "单页介绍"], ["video", "视频"]] as const)
  : category.value === "technical"
    ? ([["whitepaper", "白皮书"], ["spec", "技术规格"], ["manual", "使用手册"]] as const) : []);
const classificationValid = computed(() => subCategoryOptions.value.some(([value]) => value === subCategory.value));
const historicalVersions = ref<string[]>([]), historyLoading = ref(!!props.initial), historyError = ref("");
async function loadHistory() {
  if (!props.initial) return;
  historyLoading.value = true; historyError.value = "";
  try {
    let cursor: string | undefined;
    const seen = new Set<string>(), labels: string[] = [];
    do {
      const result = await api.materialVersions(props.productId, { limit: 100, cursor });
      labels.push(...result.data.filter(item => item.materialId === props.initial!.materialId).map(item => item.versionLabel));
      cursor = result.page.nextCursor ?? undefined;
      if (cursor && seen.has(cursor)) throw new Error("版本记录分页异常");
      if (cursor) seen.add(cursor);
    } while (cursor);
    historicalVersions.value = labels;
  } catch { historyError.value = "无法读取历史版本，请重试后再编辑。"; }
  finally { historyLoading.value = false; }
}
onMounted(() => void loadHistory());
const ids = computed(() => previewKind.value === "pdf" ? (pdf.value ? [pdf.value.assetId] : [])
  : previewKind.value === "video" ? (video.value ? [video.value.assetId] : []) : pages.value.map(p => p.assetId));
type FileKind = "pdf" | "images" | "video" | "source";
type FileEntry = {
  id: string; file?: File; name: string; size: number | null; fileKind: FileKind;
  purpose: "preview" | "source"; state: "pending" | "uploading" | "checking" | "ready" | "failed";
  loaded: number; total: number | null; assetId?: string; error: string;
  adopted: boolean; result?: Awaited<ReturnType<typeof uploadFile>>;
};
const files = ref<FileEntry[]>([]), batchIds = ref<string[]>([]);
function existing(fileKind: FileKind, label: string, assetId: string) {
  files.value.push({ id: crypto.randomUUID(), name: label, size: null, fileKind,
    purpose: fileKind === "source" ? "source" : "preview", state: "ready", loaded: 0, total: null, assetId, error: "", adopted: true });
}
if (pdf.value) existing("pdf", "当前 PDF 预览件", pdf.value.assetId);
if (video.value) existing("video", "当前视频预览件", video.value.assetId);
pages.value.forEach(p => existing("images", "第 " + p.pageIndex + " 页图片", p.assetId));
if (source.value) existing("source", "已关联后台源件", source.value);
const pending = computed(() => files.value.filter(f => f.state === "pending" || f.state === "failed"));
const staged = computed(() => files.value.filter(f => f.state === "ready" && !f.adopted));
const hasSuccessfulFile = computed(() => !!(ids.value.length || source.value));
const batch = computed(() => files.value.filter(f => batchIds.value.includes(f.id)));
const determinate = computed(() => batch.value.length > 0 && batch.value.every(f => f.total !== null));
const percent = computed(() => {
  const total = batch.value.reduce((n, f) => n + (f.total ?? 0), 0);
  return total > 0 ? Math.min(100, Math.floor(batch.value.reduce((n, f) => n + Math.min(f.loaded, f.total ?? f.loaded), 0) / total * 100)) : 0;
});
const status = computed(() => busy.value
  ? (files.value.some(f => f.state === "checking") ? "正在检查文件…" : "正在上传文件…")
  : files.value.some(f => f.state === "failed") ? "上传未完成，请重试或删除失败文件。"
    : pending.value.length ? "文件已选择，点击“上传”开始。"
      : staged.value.length ? "文件已上传，请应用文件或删除本次选择。"
        : hasSuccessfulFile.value ? "上传成功，检查完成，可用于本次草稿" : "请先上传资料文件");
const sizeLabel = (size: number | null) => size === null ? "已关联文件" : size < 1024 * 1024
  ? (size / 1024).toFixed(1) + " KiB" : (size / 1024 / 1024).toFixed(1) + " MiB";
const fileState = (file: FileEntry) => ({ pending: "待上传", uploading: "上传中", checking: "正在检查", ready: "上传成功", failed: "上传失败" })[file.state];
function categoryChanged() {
  subCategory.value = "";
  if (!props.initial) kind.value = category.value === "technical" ? "technical" : "brochure";
}
function filenameWithoutExtension(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  return (dot > 0 ? fileName.slice(0, dot) : fileName).trim().slice(0, 80);
}
function choose(event: Event) {
  const input = event.target as HTMLInputElement, selected = Array.from(input.files ?? []);
  input.value = "";
  if (!selected.length || busy.value) return;
  error.value = "";
  if (staged.value.length) {
    error.value = "请先应用或删除已经上传的替换文件，再继续选择。";
    return;
  }
  const groups: Record<FileKind, File[]> = { pdf: [], images: [], video: [], source: [] };
  for (const file of selected) {
    if (file.size > 500 * 1024 * 1024) { error.value = "单个文件不能超过 500 MiB（524,288,000 字节）"; return; }
    if (!file.size) { error.value = "文件为空，请选择有内容的资料文件。"; return; }
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    const fileKind: FileKind | undefined = ext === "pdf" ? "pdf" : ["png", "jpg", "jpeg", "webp"].includes(ext) ? "images"
      : ["mp4", "mov", "webm"].includes(ext) ? "video" : ["pptx", "docx"].includes(ext) ? "source" : undefined;
    if (!fileKind) { error.value = "不支持这些文件格式：" + file.name + "。支持 PDF、PNG/JPG/JPEG/WebP 图片、PPTX/DOCX 源文件及 MP4/MOV/WebM 视频。"; return; }
    groups[fileKind].push(file);
  }
  if ([groups.pdf.length > 0, groups.images.length > 0, groups.video.length > 0].filter(Boolean).length > 1) {
    error.value = "一次只能选择一种预览格式，不能混合 PDF、图片和视频。PPTX/DOCX 可与其中一种预览格式一起选择。"; return;
  }
  if (groups.pdf.length > 1 || groups.video.length > 1 || groups.source.length > 1) {
    error.value = groups.pdf.length > 1 ? "每份资料只能关联一个 PDF 预览件，请分开处理。"
      : groups.video.length > 1 ? "每份资料只能关联一个视频，请分开处理。" : "每份资料只能关联一个 PPTX/DOCX 后台源件，请一次选择一个。"; return;
  }
  if ((groups.pdf.length || groups.images.length || groups.video.length) && pending.value.some(f => f.purpose === "preview")) {
    error.value = "请先上传或删除待处理的预览文件，再继续选择。"; return;
  }
  if (groups.source.length && pending.value.some(f => f.purpose === "source")) {
    error.value = "请先上传或删除待处理的后台源文件。"; return;
  }
  if (groups.images.length + (previewKind.value === "images" ? pages.value.length : 0) > 200) {
    error.value = "单份资料最多 200 页"; return;
  }
  groups.images.sort((a, b) => a.name.localeCompare(b.name, "en-US", { numeric: true, sensitivity: "base" }));
  for (const fileKind of ["pdf", "images", "video", "source"] as const) {
    for (const file of groups[fileKind]) {
      if (files.value.some(f => f.file && f.file.name === file.name && f.file.size === file.size && f.file.lastModified === file.lastModified)) continue;
      files.value.push({ id: crypto.randomUUID(), file, name: file.name, size: file.size, fileKind,
        purpose: fileKind === "source" ? "source" : "preview", state: "pending", loaded: 0, total: file.size, error: "", adopted: false });
    }
  }
  batchIds.value = [];
  message.value = "";
}
function adoptUpload(entry: FileEntry, result: Awaited<ReturnType<typeof uploadFile>>) {
  const hadPreview = ids.value.length > 0;
  if (entry.purpose === "source") {
    source.value = result.assetId;
    files.value = files.value.filter(f => f.id === entry.id || f.purpose !== "source" || !f.adopted);
  } else {
    if (entry.fileKind === "pdf" && result.mimeType !== "application/pdf") throw new Error("请选择 PDF 预览件");
    if (entry.fileKind === "images" && !result.mimeType?.startsWith("image/")) throw new Error("请选择图片");
    if (entry.fileKind === "video" && !["video/mp4", "video/quicktime", "video/webm"].includes(result.mimeType ?? "")) throw new Error("请选择受支持的视频");
    if (entry.fileKind !== "images" || previewKind.value !== "images") {
      files.value = files.value.filter(f => f.id === entry.id || f.purpose !== "preview" || !f.adopted);
      pdf.value = null; video.value = null; pages.value = [];
    }
    if (entry.fileKind === "pdf") { previewKind.value = "pdf"; pdf.value = { assetId: result.assetId, pageCount: result.pageCount! }; }
    else if (entry.fileKind === "video") { previewKind.value = "video"; video.value = { assetId: result.assetId, mimeType: result.mimeType as "video/mp4" | "video/quicktime" | "video/webm" }; }
    else {
      previewKind.value = "images";
      if (!pages.value.some(p => p.assetId === result.assetId)) pages.value.push({ assetId: result.assetId, pageIndex: pages.value.length + 1, alt: "资料第 " + (pages.value.length + 1) + " 页" });
    }
  }
  entry.assetId = result.assetId;
  entry.adopted = true;
  if (!props.initial && !nameEdited.value && (!name.value.trim() || (entry.purpose === "preview" && (!hadPreview || entry.fileKind !== "images")))) {
    name.value = filenameWithoutExtension(entry.name);
  }
  if (props.initial && version.value === props.initial.versionLabel) {
    const next = nextMaterialVersion(props.initial.versionLabel, historicalVersions.value);
    if (next) version.value = next;
  }
}
function applyStaged() {
  if (pending.value.length) return;
  for (const entry of [...staged.value]) adoptUpload(entry, entry.result!);
}
async function uploadSelected() {
  if (busy.value || !pending.value.length) return;
  const selected = [...pending.value];
  batchIds.value = selected.map(f => f.id); error.value = ""; busy.value = true;
  try {
    for (const entry of selected) {
      entry.state = "uploading"; entry.error = "";
      try {
        const result = await uploadFile(props.productId, entry.file!, entry.purpose, text => { message.value = text; }, progress => {
          entry.state = progress.stage === "checking" ? "checking" : "uploading";
          entry.loaded = progress.loaded; entry.total = progress.total;
        });
        if (entry.fileKind === "pdf" && result.mimeType !== "application/pdf") throw new Error("请选择 PDF 预览件");
        if (entry.fileKind === "images" && !result.mimeType?.startsWith("image/")) throw new Error("请选择图片");
        if (entry.fileKind === "video" && !["video/mp4", "video/quicktime", "video/webm"].includes(result.mimeType ?? "")) throw new Error("请选择受支持的视频");
        entry.result = result; entry.assetId = result.assetId;
        entry.state = "ready"; entry.loaded = entry.size ?? 0;
      } catch (caught) {
        entry.state = "failed"; entry.error = caught instanceof Error ? caught.message : "上传失败";
        error.value = entry.name + "：" + entry.error;
        break;
      }
    }
    if (!pending.value.length) applyStaged();
  } finally { busy.value = false; }
}
function deleteFile(entry: FileEntry) {
  if (busy.value) return;
  if (entry.assetId) {
    if (pdf.value?.assetId === entry.assetId) pdf.value = null;
    if (video.value?.assetId === entry.assetId) video.value = null;
    if (source.value === entry.assetId) source.value = null;
    pages.value = pages.value.filter(p => p.assetId !== entry.assetId);
    pages.value.forEach((p, i) => { p.pageIndex = i + 1; });
  }
  files.value = files.value.filter(f => f.id !== entry.id);
  batchIds.value = batchIds.value.filter(id => id !== entry.id);
  error.value = ""; message.value = "";
}
function move(index: number, delta: number) {
  const target = index + delta;
  if (target < 0 || target >= pages.value.length) return;
  [pages.value[index], pages.value[target]] = [pages.value[target], pages.value[index]];
  pages.value.forEach((p, i) => { p.pageIndex = i + 1; });
}
function removePage(index: number) {
  const entry = files.value.find(f => f.assetId === pages.value[index]?.assetId);
  if (entry) deleteFile(entry);
}
function material(): Domain["MaterialRef"] | null {
  if (!ids.value.length) return null;
  const preview: Domain["PreviewRef"] = previewKind.value === "pdf" ? { kind: "pdf", ...pdf.value! }
    : previewKind.value === "video" ? { kind: "video", ...video.value! } : { kind: "images", pages: copy(pages.value) };
  return { materialId, versionId, name: name.value.trim(), kind: kind.value,
    category: category.value as NonNullable<Domain["MaterialRef"]["category"]>,
    subCategory: subCategory.value as NonNullable<Domain["MaterialRef"]["subCategory"]>,
    versionLabel: version.value.trim(), applicableVersion: applicable.value, sourceAssetId: source.value, preview };
}
const normalized = (m: Domain["MaterialRef"]) => JSON.stringify([m.materialId, m.versionId, m.name, m.kind,
  m.category ?? "", m.subCategory ?? "", m.versionLabel, m.applicableVersion ?? "", m.sourceAssetId ?? null, m.preview]);
const changed = computed(() => !props.initial || !material() || normalized(material()!) !== normalized(props.initial));
const effectiveVersion = computed(() => props.initial && changed.value && version.value.trim() === props.initial.versionLabel
  ? nextMaterialVersion(props.initial.versionLabel, historicalVersions.value) : version.value.trim());
const completionHint = computed(() => {
  if (busy.value) return "请等待文件上传和检查完成。";
  if (pending.value.length) return "请上传或删除列表中尚未完成的文件。";
  if (staged.value.length) return "请先应用已上传文件，或删除本次替换文件。";
  if (!ids.value.length) return source.value ? "源文件仅供后台保存，请继续上传 PDF、图片或视频预览件。" : "请先选择并上传通过检查的预览文件。";
  if (historyLoading.value) return "正在读取历史版本…";
  if (historyError.value) return "请先重试读取历史版本。";
  if (!name.value.trim()) return "请填写资料名称。";
  if (!effectiveVersion.value || (changed.value && !validMaterialVersion(effectiveVersion.value))) return "请使用 V01.0 或 V1.0 格式填写有效的版本标签。";
  if (changed.value && effectiveVersion.value !== props.initial?.versionLabel && historicalVersions.value.some(label => label.trim().toUpperCase() === effectiveVersion.value!.toUpperCase())) return "该版本标签已在历史记录中使用，请填写新版本。";
  if (!classificationValid.value) return "请选择资料一级分类和对应的二级分类。";
  return "";
});
const canComplete = computed(() => !completionHint.value);
function save() {
  error.value = "";
  if (!canComplete.value) { error.value = completionHint.value; return; }
  const value = material()!;
  if (props.initial && !changed.value) { emit("save", copy(props.initial)); return; }
  value.versionLabel = version.value = effectiveVersion.value!;
  if (props.initial) value.versionId = crypto.randomUUID();
  emit("save", value);
}
</script>
<template>
  <Modal :title="initial ? '编辑资料' : '上传资料'" wide scroll-body :busy="busy" @close="confirmDiscard = true">
    <div class="material-upload">
      <p class="journey-note">完成后加入本次编辑，保存草稿并发布更新后生效。</p>
      <section class="upload-section" aria-label="上传文件">
        <div class="upload-heading"><h3><span>1</span>上传文件</h3><small>每个文件 ≤500 MiB</small></div>
        <div class="file-picker">
          <div><strong>{{ files.length ? '继续选择资料文件' : '请先上传资料文件' }}</strong><p>支持 PDF、图片、视频；Office 文件可作为后台源件。</p></div>
          <label :class="['choose-file', { disabled: busy }]"><span>{{ files.length ? '继续选择文件' : '选择文件' }}</span><input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.pptx,.docx,.mp4,.mov,.webm" aria-label="选择资料文件（PDF、图片、视频或源文件）" multiple :disabled="busy || historyLoading || !!historyError" @change="choose" /></label>
        </div>
        <ul v-if="files.length" class="upload-files" aria-label="资料文件列表">
          <li v-for="file in files" :key="file.id" :data-state="file.state">
            <div class="file-description"><strong>{{ file.name }}</strong><small>{{ file.purpose === 'source' ? '后台源件' : '预览件' }} · {{ sizeLabel(file.size) }}</small><span v-if="file.error" class="file-error">{{ file.error }}</span></div>
            <span :class="['file-state', { success: file.state === 'ready' }]">{{ fileState(file) }}</span>
            <button type="button" class="delete-file" :aria-label="'删除' + file.name" :disabled="busy" @click="deleteFile(file)">删除</button>
          </li>
        </ul>
        <div v-if="batch.length" class="upload-progress" role="progressbar" aria-label="文件上传进度" :aria-valuemin="0" :aria-valuemax="100" :aria-valuenow="determinate ? percent : undefined" :aria-valuetext="status"><span :class="{ indeterminate: !determinate }" :style="{ width: determinate ? percent + '%' : '32%' }" /></div>
        <div class="upload-actions"><p class="upload-status" role="status">{{ status }}<span v-if="busy && determinate && !files.some(f => f.state === 'checking')"> {{ percent }}%</span></p><button v-if="pending.length && !busy" type="button" class="primary" @click="uploadSelected">{{ files.some(f => f.state === 'failed') ? '重试上传' : '上传' }}</button><button v-else-if="staged.length && !busy" type="button" class="primary" @click="applyStaged">应用已上传文件</button></div>
        <p v-if="ids.length" class="ready-description">当前预览类型：{{ previewKind === 'pdf' ? 'PDF' : previewKind === 'video' ? '视频' : '有序图片' }}<template v-if="previewKind === 'pdf' && pdf"> · PDF 已就绪 · {{ pdf.pageCount }} 页</template><button type="button" :disabled="busy" @click="showPreview = true">检查预览件</button></p>
        <p v-if="source && !ids.length" class="source-notice">源文件已上传。请再上传 PDF、图片或视频预览件，才能完成资料。</p>
        <p v-if="files.length" class="remove-note">删除只移除本次选择或关联，不影响已发布资料与历史文件。</p>
        <details class="format-help"><summary>支持格式与预览说明</summary><p>PDF、PNG/JPG/JPEG/WebP 图片、MP4/MOV/WebM 视频可预览；PPTX/DOCX 仅后台保存，不自动转换，需另配预览件。一次可选一种预览格式，可同时附一份源文件。图片最多 200 页。视频使用 H.264 + AAC（MP4/MOV）或 VP8/VP9 + Opus（WebM）；终端不兼容时会给出提示。</p></details>
        <div v-if="previewKind === 'images' && pages.length" class="image-order"><div v-for="(page, i) in pages" :key="page.assetId"><span>第 {{ i + 1 }} 页</span><input v-model="page.alt" :aria-label="'第 ' + (i + 1) + ' 页替代文字'" maxlength="300" :disabled="busy" /><button type="button" :disabled="busy || i === 0" :aria-label="'将第 ' + (i + 1) + ' 页上移'" @click="move(i, -1)">前移</button><button type="button" :disabled="busy || i === pages.length - 1" :aria-label="'将第 ' + (i + 1) + ' 页下移'" @click="move(i, 1)">后移</button><button type="button" :disabled="busy" :aria-label="'移除第 ' + (i + 1) + ' 页'" @click="removePage(i)">移除</button></div></div>
      </section>
      <section class="material-information" aria-label="资料信息"><div class="upload-heading"><h3><span>2</span>资料信息</h3><small v-if="!hasSuccessfulFile">文件上传成功后填写</small></div>
        <p v-if="historyLoading" role="status">正在读取历史版本…</p>
        <p v-if="historyError" class="error-inline" role="alert">{{ historyError }} <button type="button" @click="loadHistory">重试</button></p>
        <fieldset class="material-form" :disabled="!hasSuccessfulFile || busy || historyLoading || !!historyError"><div class="form-grid">
          <label class="field">资料名称<input v-model="name" maxlength="80" @input="nameEdited = true" /></label>
          <label class="field">版本标签<input v-model="version" aria-label="版本标签" maxlength="40" /><small>默认 V01.0，可编辑</small></label>
          <label class="field">资料类型<select v-model="kind"><option value="brochure">产品介绍</option><option value="presentation">宣讲资料</option><option value="technical">技术资料</option><option value="other">其他</option></select></label>
          <label class="field">资料一级分类<select v-model="category" @change="categoryChanged"><option value="">请选择一级分类</option><option value="promotional">宣传资料</option><option value="technical">技术资料</option></select></label>
          <label class="field">资料二级分类<select v-model="subCategory" :disabled="!category"><option value="">请选择二级分类</option><option v-for="[value, label] in subCategoryOptions" :key="value" :value="value">{{ label }}</option></select></label>
          <label class="field">适用型号／版本（可选）<input v-model="applicable" maxlength="100" /></label>
        </div></fieldset>
        <p v-if="initial && (!initial.category || !initial.subCategory)" class="helper">这份旧资料尚未分类，请人工确认资料用途并选择一级、二级分类。</p>
      </section>
      <p v-if="error" class="error-inline" role="alert">{{ error }}</p>
    </div>
    <template #footer><p v-if="completionHint" class="completion-hint">{{ completionHint }}</p><button type="button" :disabled="busy" @click="confirmDiscard = true">取消</button><button type="button" class="primary" :disabled="!canComplete" @click="save">完成</button></template>
  </Modal>
  <Modal v-if="showPreview" title="资料文件预览" wide @close="showPreview = false"><AssetViewer :product-id="productId" :asset-ids="ids" :kind="previewKind" :alts="pages.map(p => p.alt)" /></Modal>
  <Modal v-if="confirmDiscard" title="放弃资料编辑" @close="confirmDiscard = false"><p>未加入产品草稿的本次资料输入将被放弃；已上传字节不会自动发布。</p><template #footer><button type="button" @click="confirmDiscard = false">继续编辑资料</button><button type="button" class="danger" @click="emit('cancel')">放弃本次资料</button></template></Modal>
</template>
<style scoped>
.material-upload { font-size: 14px; }
.journey-note { color: var(--zj-color-text-secondary); font-size: 13px; margin: 0 0 20px; line-height: 1.6; }
.upload-heading { display: flex; justify-content: space-between; align-items: center; gap: 12px; margin-bottom: 12px; }
.upload-heading h3 { display: flex; align-items: center; gap: 8px; margin: 0; font-size: 15px; }
.upload-heading h3 > span { display: grid; place-items: center; width: 22px; height: 22px; border-radius: 50%; background: #eaf5f5; color: var(--zj-color-brand); font-size: 12px; }
.upload-heading small, .file-picker p, .file-description small { color: var(--zj-color-text-secondary); font-size: 12px; }
.file-picker { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px; border: 1px dashed var(--zj-color-control-border); border-radius: 8px; background: #f8fafb; }
.file-picker strong { font-size: 14px; }.file-picker p { margin: 6px 0 0; line-height: 1.5; }
.choose-file { position: relative; flex: none; border: 1px solid var(--zj-color-control-border); border-radius: 8px; background: white; padding: 10px 14px; line-height: 20px; overflow: hidden; cursor: pointer; }
.choose-file input { position: absolute; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }.choose-file:focus-within { outline: 2px solid var(--zj-color-brand); outline-offset: 2px; }.choose-file.disabled { opacity: .55; }
.upload-files { padding: 0; margin: 12px 0 0; list-style: none; }.upload-files li { display: flex; align-items: center; gap: 12px; padding: 12px 0; border-bottom: 1px solid var(--zj-color-border); }
.file-description { display: flex; flex-direction: column; gap: 4px; min-width: 0; flex: 1; }.file-description strong { font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }.file-error { font-size: 12px; color: #a72428; overflow-wrap: anywhere; }
.file-state { flex: none; color: var(--zj-color-text-secondary); font-size: 12px; }.file-state.success { color: #19765a; }.delete-file { border: 0; background: transparent; color: var(--zj-color-text-secondary); padding: 8px; flex: none; }
.upload-progress { height: 3px; border-radius: 2px; background: #e5ecef; margin-top: 16px; overflow: hidden; }.upload-progress > span { display: block; height: 100%; background: var(--zj-color-brand); }.upload-progress > span.indeterminate { animation: upload-wait 1.2s ease-in-out infinite alternate; }
@keyframes upload-wait { to { transform: translateX(200%); } }
.upload-actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; min-height: 40px; margin-top: 8px; }.upload-status { margin: 0; color: var(--zj-color-text-secondary); font-size: 12px; line-height: 1.6; }
.ready-description { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; color: #19765a; margin: 8px 0; font-size: 12px; }.ready-description button { padding: 6px 10px; font-size: 12px; }
.remove-note { color: var(--zj-color-text-secondary); font-size: 12px; margin: 8px 0; line-height: 1.6; }.source-notice { font-size: 12px; color: #765510; background: #fff9eb; padding: 10px 12px; border-radius: 6px; line-height: 1.6; }
.format-help { font-size: 12px; color: var(--zj-color-text-secondary); margin-top: 8px; line-height: 1.7; }.format-help summary { cursor: pointer; }.format-help p { margin: 8px 0 0; }
.material-information { margin-top: 24px; padding-top: 20px; border-top: 1px solid var(--zj-color-border); }.material-form .form-grid { gap: 16px 20px; }.material-form .field { margin: 0; font-size: 13px; }.material-form .field input, .material-form .field select { min-height: 40px; font-size: 14px; border-radius: 8px; }.material-form:disabled { opacity: .65; }.material-form .field small { font-size: 12px; }
.completion-hint { margin: 0 auto 0 0; flex: 1; min-width: 160px; color: var(--zj-color-text-secondary); font-size: 12px; line-height: 1.6; align-self: center; }
.image-order { margin-top: 16px; }.image-order > div { flex-wrap: wrap; }.image-order input { flex: 1; min-width: 120px; }
@media (max-width: 600px) { .file-picker { align-items: flex-start; flex-direction: column; }.material-form .form-grid { grid-template-columns: 1fr; gap: 14px; }.upload-heading { flex-wrap: wrap; }.file-state { max-width: 64px; }.completion-hint { flex-basis: 100%; } }
@media (prefers-reduced-motion: reduce) { .upload-progress > span.indeterminate { animation: none; } }
</style>
