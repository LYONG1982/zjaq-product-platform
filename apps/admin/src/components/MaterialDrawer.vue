<script setup lang="ts">
import { ref, computed, onMounted } from "vue";
import type { Domain } from "@zj/contracts";
import Modal from "./Modal.vue";
import AssetViewer from "./AssetViewer.vue";
import { api, copy } from "../api";
import { uploadFile } from "../upload";
import { nextMaterialVersion, validMaterialVersion } from "../versions";
const props = defineProps<{
  productId: string;
  initial?: Domain["MaterialRef"];
}>();
const emit = defineEmits<{
  save: [material: Domain["MaterialRef"]];
  cancel: [];
}>();
const name = ref(props.initial?.name ?? ""),
  kind = ref<Domain["MaterialRef"]["kind"]>(props.initial?.kind ?? "brochure"),
  category = ref<Domain["MaterialRef"]["category"] | "">(
    props.initial?.category ?? "",
  ),
  subCategory = ref<Domain["MaterialRef"]["subCategory"] | "">(
    props.initial?.subCategory ?? "",
  ),
  version = ref(props.initial?.versionLabel ?? "V1.0"),
  applicable = ref(props.initial?.applicableVersion ?? ""),
  previewKind = ref<"pdf" | "images" | "video">(props.initial?.preview.kind ?? "pdf"),
  pdf = ref<{ assetId: string; pageCount: number } | null>(
    props.initial?.preview.kind === "pdf"
      ? {
          assetId: props.initial.preview.assetId,
          pageCount: props.initial.preview.pageCount,
        }
      : null,
  ),
  pages = ref<{ assetId: string; pageIndex: number; alt: string }[]>(
    props.initial?.preview.kind === "images"
      ? copy(props.initial.preview.pages)
      : [],
  ),
  video = ref<{ assetId: string; mimeType: "video/mp4" | "video/quicktime" | "video/webm" } | null>(props.initial?.preview.kind === "video" ? { assetId: props.initial.preview.assetId, mimeType: props.initial.preview.mimeType } : null),
  source = ref(props.initial?.sourceAssetId ?? null),
  busy = ref(false),
  message = ref(""),
  error = ref(""),
  showPreview = ref(false),
  confirmDiscard = ref(false);
const subCategoryOptions = computed(() =>
  category.value === "promotional"
    ? ([
        ["deck", "演示文稿"],
        ["onepager", "单页介绍"],
        ["video", "视频"],
      ] as const)
    : category.value === "technical"
      ? ([
          ["whitepaper", "白皮书"],
          ["spec", "技术规格"],
          ["manual", "使用手册"],
        ] as const)
      : [],
);
const classificationValid = computed(() =>
  subCategoryOptions.value.some(([value]) => value === subCategory.value),
);
type UploadTask = { files: File[]; purpose: "preview" | "source" };
let lastTasks: UploadTask[] = [];
const historicalVersions = ref<string[]>([]), historyLoading = ref(!!props.initial), historyError = ref("");
async function loadHistory() {
  if (!props.initial) return;
  historyLoading.value = true;
  historyError.value = "";
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
  } catch {
    historyError.value = "无法读取历史版本，请重试后再编辑。";
  } finally { historyLoading.value = false; }
}
onMounted(() => void loadHistory());
const ids = computed(() =>
  previewKind.value === "pdf"
    ? pdf.value
      ? [pdf.value.assetId]
      : []
    : previewKind.value === "video" ? (video.value ? [video.value.assetId] : []) : pages.value.map((p) => p.assetId),
);
async function uploadTasks(tasks: UploadTask[]) {
  if (!tasks.length) return;
  lastTasks = tasks;
  error.value = "";
  busy.value = true;
  try {
    for (const task of [...tasks]) {
      if (
        task.purpose === "preview" &&
        previewKind.value === "images" &&
        pages.value.length + task.files.length > 200
      )
        throw new Error("单份资料最多 200 页");
      while (task.files.length) {
        const f = task.files[0];
        const result = await uploadFile(
          props.productId,
          f,
          task.purpose,
          (t) => (message.value = t),
        );
        if (props.initial && version.value === props.initial.versionLabel) {
          const next = nextMaterialVersion(props.initial.versionLabel, historicalVersions.value);
          if (next) version.value = next;
        }
        if (task.purpose === "source") source.value = result.assetId;
        else if (previewKind.value === "pdf") {
          if (result.mimeType !== "application/pdf")
            throw new Error("请选择 PDF 预览件");
          pdf.value = { assetId: result.assetId, pageCount: result.pageCount! };
        } else if (previewKind.value === "video") {
          if (!["video/mp4", "video/quicktime", "video/webm"].includes(result.mimeType ?? "")) throw new Error("请选择受支持的视频");
          video.value = { assetId: result.assetId, mimeType: result.mimeType as "video/mp4" | "video/quicktime" | "video/webm" };
        } else {
          if (!result.mimeType?.startsWith("image/"))
            throw new Error("请选择图片");
          if (!pages.value.some((p) => p.assetId === result.assetId))
            pages.value.push({
              assetId: result.assetId,
              pageIndex: pages.value.length + 1,
              alt: "资料第 " + (pages.value.length + 1) + " 页",
            });
        }
        task.files.shift();
      }
      const completedTask = lastTasks.indexOf(task);
      if (completedTask !== -1) lastTasks.splice(completedTask, 1);
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "上传失败";
  } finally {
    busy.value = false;
  }
}
function categoryChanged() {
  subCategory.value = "";
  if (!props.initial)
    kind.value = category.value === "technical" ? "technical" : "brochure";
}
function filenameWithoutExtension(file: File) {
  const dot = file.name.lastIndexOf(".");
  return dot > 0 ? file.name.slice(0, dot) : file.name;
}
function choose(e: Event) {
  const input = e.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = "";
  if (!files.length) return;

  const pdfFiles: { file: File; index: number }[] = [];
  const imageFiles: { file: File; index: number }[] = [];
  const sourceFiles: File[] = [];
  const videoFiles: File[] = [];
  const unsupported: string[] = [];
  files.forEach((file, index) => {
    const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (extension === "pdf") pdfFiles.push({ file, index });
    else if (["png", "jpg", "jpeg", "webp"].includes(extension))
      imageFiles.push({ file, index });
    else if (["pptx", "docx"].includes(extension)) sourceFiles.push(file);
    else if (["mp4", "mov", "webm"].includes(extension)) videoFiles.push(file);
    else unsupported.push(file.name);
  });
  if (unsupported.length) {
    lastTasks = [];
    error.value =
      "不支持这些文件格式：" +
      unsupported.join("、") +
      "。支持 PDF、PNG/JPG/JPEG/WebP 图片、PPTX/DOCX 源文件及 MP4/MOV/WebM 视频。";
    return;
  }
  if ([pdfFiles.length > 0, imageFiles.length > 0, videoFiles.length > 0].filter(Boolean).length > 1) {
    lastTasks = [];
    error.value =
      "一次只能选择一种预览格式，不能混合 PDF、图片和视频。请分开上传；PPTX/DOCX 可与其中一种预览格式一起选择。";
    return;
  }
  if (videoFiles.length > 1) { lastTasks = []; error.value = "每份资料只能关联一个视频，请分开处理。"; return; }
  if (pdfFiles.length > 1 || sourceFiles.length > 1) {
    lastTasks = [];
    error.value = pdfFiles.length > 1
      ? "每份资料只能关联一个 PDF 预览件，请分开处理。"
      : "每份资料只能关联一个 PPTX/DOCX 后台源件，请一次选择一个。";
    return;
  }

  if (!name.value.trim()) {
    const suggested = filenameWithoutExtension(files[0]).trim();
    if (suggested) name.value = suggested.slice(0, 80);
  }
  const tasks: UploadTask[] = [];
  if (videoFiles.length) {
    previewKind.value = "video";
    tasks.push({ files: videoFiles, purpose: "preview" });
  } else if (pdfFiles.length) {
    previewKind.value = "pdf";
    if (pages.value.length)
      message.value = "已识别 PDF；保存后将以此 PDF 替换当前图片预览。";
    tasks.push({ files: [pdfFiles[0].file], purpose: "preview" });
  } else if (imageFiles.length) {
    previewKind.value = "images";
    if (pdf.value)
      message.value = "已识别图片；保存后将以图片序列替换当前 PDF 预览。";
    const sortedImages = imageFiles
      .sort(
        (a, b) =>
          a.file.name.localeCompare(b.file.name, "en-US", {
            numeric: true,
            sensitivity: "base",
          }) || a.index - b.index,
      )
      .map(({ file }) => file);
    tasks.push({ files: sortedImages, purpose: "preview" });
  }
  if (sourceFiles.length)
    tasks.push({ files: sourceFiles, purpose: "source" });
  void uploadTasks(tasks);
}
function move(i: number, delta: number) {
  const target = i + delta;
  if (target < 0 || target >= pages.value.length) return;
  [pages.value[i], pages.value[target]] = [pages.value[target], pages.value[i]];
  pages.value.forEach((p, n) => (p.pageIndex = n + 1));
}
function remove(i: number) {
  pages.value.splice(i, 1);
  pages.value.forEach((p, n) => (p.pageIndex = n + 1));
}
function save() {
  error.value = "";
  if (historyLoading.value || historyError.value) {
    error.value = "请先完成历史版本读取后再保存。";
    return;
  }
  if (!classificationValid.value) {
    error.value = "请选择有效的资料一级分类和二级分类。旧资料未分类时，请人工确认后补充。";
    return;
  }
  if (!name.value.trim() || !version.value.trim() || !ids.value.length) {
    error.value = "请填写资料名称、版本标签，并添加通过检查的预览件。";
    return;
  }
  const preview: Domain["PreviewRef"] =
    previewKind.value === "pdf"
      ? { kind: "pdf", ...pdf.value! }
      : previewKind.value === "video" ? { kind: "video", ...video.value! } : { kind: "images", pages: copy(pages.value) };
  const value: Domain["MaterialRef"] = {
    materialId: props.initial?.materialId ?? crypto.randomUUID(),
    versionId: props.initial?.versionId ?? crypto.randomUUID(),
    name: name.value.trim(),
    kind: kind.value,
    category: category.value as NonNullable<Domain["MaterialRef"]["category"]>,
    subCategory: subCategory.value as NonNullable<Domain["MaterialRef"]["subCategory"]>,
    versionLabel: version.value.trim(),
    applicableVersion: applicable.value,
    sourceAssetId: source.value,
    preview,
  };
  const normalized = (m: Domain["MaterialRef"]) =>
    JSON.stringify([
      m.materialId,
      m.versionId,
      m.name,
      m.kind,
      m.category ?? "",
      m.subCategory ?? "",
      m.versionLabel,
      m.applicableVersion ?? "",
      m.sourceAssetId ?? null,
      m.preview,
    ]);
  if (props.initial && normalized(value) !== normalized(props.initial)) {
    if (value.versionLabel === props.initial.versionLabel) {
      const next = nextMaterialVersion(props.initial.versionLabel, historicalVersions.value);
      if (!next) {
        error.value = "原版本标签无法自动顺延，请手动填写 V1.0 格式的新版本号。";
        return;
      }
      value.versionLabel = version.value = next;
    }
    value.versionId = crypto.randomUUID();
  }
  if (props.initial && normalized(value) === normalized(props.initial)) {
    emit("save", copy(props.initial));
    return;
  }
  if (!validMaterialVersion(value.versionLabel)) {
    error.value = "请使用 V1.0 格式填写版本号。";
    return;
  }
  emit("save", value);
}
</script>
<template>
  <Modal
    :title="initial ? '编辑资料' : '添加资料'"
    wide
    :busy="busy"
    @close="confirmDiscard = true"
    ><p class="helper">
      更改只加入当前编辑内容，保存并发布更新后才影响公共目录。源件仅后台保存，不会自动转换。
    </p>
    <p v-if="historyLoading">正在读取历史版本…</p>
    <p v-if="historyError" role="alert">{{ historyError }} <button type="button" @click="loadHistory">重试</button></p>
    <fieldset :disabled="busy || historyLoading || !!historyError">
      <div class="form-grid">
        <label class="field"
          >资料名称<input v-model="name" maxlength="80" /></label
        ><label class="field"
          >资料类型<select v-model="kind">
            <option value="brochure">产品介绍</option>
            <option value="presentation">宣讲资料</option>
            <option value="technical">技术资料</option>
            <option value="other">其他</option>
          </select></label
        ><label class="field"
          >资料一级分类<select
            v-model="category"
            @change="categoryChanged"
          >
            <option value="">请选择一级分类</option>
            <option value="promotional">宣传资料</option>
            <option value="technical">技术资料</option>
          </select></label
        ><label class="field"
          >资料二级分类<select v-model="subCategory" :disabled="!category">
            <option value="">请选择二级分类</option>
            <option
              v-for="[value, label] in subCategoryOptions"
              :key="value"
              :value="value"
            >
              {{ label }}
            </option>
          </select></label
        ><label class="field"
          >版本标签<input v-model="version" maxlength="40" /></label
        ><label class="field"
          >适用型号／版本（可选）<input v-model="applicable" maxlength="100"
        /></label>
      </div>
      <p v-if="!classificationValid" class="helper" role="status">
        {{
          initial && (!initial.category || !initial.subCategory)
            ? "这份旧资料尚未分类，请人工确认资料用途并选择一级、二级分类。"
            : "请选择与一级分类匹配的二级分类后再加入资料。"
        }}
      </p>
      <label class="field"
        >选择资料文件（PDF、图片、视频或源文件）<input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp,.pptx,.docx,.mp4,.mov,.webm"
          multiple
          @change="choose"
      /></label>
      <p class="helper">
        每个文件 ≤500 MiB。支持 PDF、图片、PPTX/DOCX 与 MP4/MOV/WebM；系统保留原件，不转码或自动转换。视频使用 H.264 + AAC（MP4/MOV）或 VP8/VP9 + Opus（WebM）；终端不兼容时会给出提示。一次可选一种预览格式，可同时附源文件。
      </p>
      <p v-if="ids.length" class="success">
        当前预览类型：{{ previewKind === "pdf" ? "PDF" : previewKind === "video" ? "视频" : "有序图片" }}
      </p>
      <p v-if="previewKind === 'pdf' && pdf" class="success">
        PDF 已就绪 · {{ pdf.pageCount }} 页
      </p>
      <div v-if="previewKind === 'images'" class="image-order">
        <div v-for="(p, i) in pages" :key="p.assetId">
          <span>第 {{ i + 1 }} 页</span
          ><input
            v-model="p.alt"
            :aria-label="'第 ' + (i + 1) + ' 页替代文字'"
            maxlength="300"
          /><button
            :disabled="i === 0"
            :aria-label="'将第 ' + (i + 1) + ' 页上移'"
            @click="move(i, -1)"
            >前移</button
          ><button
            :disabled="i === pages.length - 1"
            :aria-label="'将第 ' + (i + 1) + ' 页下移'"
            @click="move(i, 1)"
          >
            后移</button
          ><button :aria-label="'移除第 ' + (i + 1) + ' 页'" @click="remove(i)">
            移除</button
          >
        </div>
      </div>
      <button v-if="ids.length" @click="showPreview = true">检查预览件</button>
      <p v-if="source">
        已关联后台源件 <button @click="source = null">移除源件关联</button>
      </p>
    </fieldset>
    <p v-if="message" role="status" class="helper">{{ message }}</p>
    <p v-if="error" class="error-inline" role="alert">
      {{ error }}
      <button
        v-if="lastTasks.length && !busy"
        @click="uploadTasks(lastTasks)"
      >
        重试上传
      </button>
    </p>
    <template #footer
      ><button :disabled="busy" @click="confirmDiscard = true">取消</button
      ><button class="primary" :disabled="busy" @click="save">
        加入本次编辑
      </button></template
    ></Modal
  ><Modal
    v-if="showPreview"
    title="资料文件预览"
    wide
    @close="showPreview = false"
    ><AssetViewer
      :product-id="productId"
      :asset-ids="ids"
      :kind="previewKind"
      :alts="pages.map((p) => p.alt)" /></Modal
  ><Modal
    v-if="confirmDiscard"
    title="放弃资料编辑"
    @close="confirmDiscard = false"
    ><p>未加入产品草稿的本次资料输入将被放弃；已上传字节不会自动发布。</p>
    <template #footer
      ><button @click="confirmDiscard = false">继续编辑资料</button
      ><button class="danger" @click="emit('cancel')">
        放弃本次资料
      </button></template
    ></Modal
  >
</template>
