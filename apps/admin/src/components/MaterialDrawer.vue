<script setup lang="ts">
import { ref, computed } from "vue";
import type { Domain } from "@zj/contracts";
import Modal from "./Modal.vue";
import AssetViewer from "./AssetViewer.vue";
import { copy } from "../api";
import { uploadFile } from "../upload";
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
  version = ref(props.initial?.versionLabel ?? "v1"),
  applicable = ref(props.initial?.applicableVersion ?? ""),
  previewKind = ref<"pdf" | "images">(props.initial?.preview.kind ?? "pdf"),
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
  source = ref(props.initial?.sourceAssetId ?? null),
  busy = ref(false),
  message = ref(""),
  error = ref(""),
  showPreview = ref(false),
  confirmDiscard = ref(false);
let lastFiles: File[] = [];
let lastPurpose: "preview" | "source" = "preview";
const ids = computed(() =>
  previewKind.value === "pdf"
    ? pdf.value
      ? [pdf.value.assetId]
      : []
    : pages.value.map((p) => p.assetId),
);
async function upload(files: File[], purpose: "preview" | "source") {
  if (!files.length) return;
  lastFiles = files;
  lastPurpose = purpose;
  error.value = "";
  busy.value = true;
  try {
    if (
      purpose === "preview" &&
      previewKind.value === "images" &&
      pages.value.length + files.length > 200
    )
      throw new Error("单份资料最多 200 页");
    for (const f of files) {
      const result = await uploadFile(
        props.productId,
        f,
        purpose,
        (t) => (message.value = t),
      );
      if (purpose === "source") source.value = result.assetId;
      else if (previewKind.value === "pdf") {
        if (result.mimeType !== "application/pdf")
          throw new Error("请选择 PDF 预览件");
        pdf.value = { assetId: result.assetId, pageCount: result.pageCount! };
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
    }
    lastFiles = [];
  } catch (e) {
    error.value = e instanceof Error ? e.message : "上传失败";
  } finally {
    busy.value = false;
  }
}
function choose(e: Event, purpose: "preview" | "source") {
  const input = e.target as HTMLInputElement;
  void upload(Array.from(input.files ?? []), purpose);
  input.value = "";
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
  if (!name.value.trim() || !version.value.trim() || !ids.value.length) {
    error.value = "请填写资料名称、版本标签，并添加通过检查的预览件。";
    return;
  }
  const preview: Domain["PreviewRef"] =
    previewKind.value === "pdf"
      ? { kind: "pdf", ...pdf.value! }
      : { kind: "images", pages: copy(pages.value) };
  const value: Domain["MaterialRef"] = {
    materialId: props.initial?.materialId ?? crypto.randomUUID(),
    versionId: props.initial?.versionId ?? crypto.randomUUID(),
    name: name.value.trim(),
    kind: kind.value,
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
      m.versionLabel,
      m.applicableVersion ?? "",
      m.sourceAssetId ?? null,
      m.preview,
    ]);
  if (props.initial && normalized(value) !== normalized(props.initial)) {
    if (value.versionLabel === props.initial.versionLabel) {
      error.value = "资料发生变化，请填写新的版本标签；已使用标签不能复用。";
      return;
    }
    value.versionId = crypto.randomUUID();
  }
  if (props.initial && normalized(value) === normalized(props.initial)) {
    emit("save", copy(props.initial));
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
    <fieldset :disabled="busy">
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
          >版本标签<input v-model="version" maxlength="40" /></label
        ><label class="field"
          >适用型号／版本（可选）<input v-model="applicable" maxlength="100"
        /></label>
      </div>
      <label class="field"
        >预览类型<select v-model="previewKind">
          <option value="pdf">PDF</option>
          <option value="images">有序图片</option>
        </select></label
      ><label class="field"
        >{{
          previewKind === "pdf"
            ? "PDF 预览件（≤30 MiB）"
            : "图片预览件（每张≤8 MiB）"
        }}<input
          type="file"
          :accept="previewKind === 'pdf' ? '.pdf' : '.png,.jpg,.jpeg,.webp'"
          :multiple="previewKind === 'images'"
          @change="choose($event, 'preview')"
      /></label>
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
          /><button :disabled="i === 0" @click="move(i, -1)">前移</button
          ><button :disabled="i === pages.length - 1" @click="move(i, 1)">
            后移</button
          ><button @click="remove(i)">移除</button>
        </div>
      </div>
      <button v-if="ids.length" @click="showPreview = true">检查预览件</button
      ><label class="field"
        >后台源文件（可选，PPTX／DOCX ≤50 MiB）<input
          type="file"
          accept=".pptx,.docx"
          @change="choose($event, 'source')"
      /></label>
      <p v-if="source">
        已关联后台源件 <button @click="source = null">移除源件关联</button>
      </p>
    </fieldset>
    <p v-if="message" role="status" class="helper">{{ message }}</p>
    <p v-if="error" class="error-inline" role="alert">
      {{ error }}
      <button
        v-if="lastFiles.length && !busy"
        @click="upload(lastFiles, lastPurpose)"
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
