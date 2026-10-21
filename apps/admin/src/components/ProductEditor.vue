<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from "vue";
import type {
  AdminDraft,
  Category,
  Template,
  DraftContent,
  Domain,
} from "@zj/contracts";
import { api, copy, requestKey, errorInfo, stateName } from "../api";
import { uploadFile } from "../upload";
import Modal from "./Modal.vue";
import MaterialDrawer from "./MaterialDrawer.vue";
import DraftPreview from "./DraftPreview.vue";
const props = defineProps<{
  draft: AdminDraft;
  categories: Category[];
  templates: Template[];
}>();
const emit = defineEmits<{ back: []; changed: [] }>();
const current = ref(copy(props.draft)),
  content = ref(copy(props.draft.content)),
  saved = ref(JSON.stringify(props.draft.content)),
  busy = ref(false),
  error = ref(""),
  fields = ref<{ path: string; message: string }[]>([]),
  conflict = ref(false),
  notice = ref(""),
  preview = ref<AdminDraft | null>(null),
  materialIndex = ref<number | null>(null),
  materialOpen = ref(false),
  publishOpen = ref(false),
  publicConfirmed = ref(false),
  offlineOpen = ref(false),
  reason = ref("内容调整"),
  leaveOpen = ref(false),
  serverDraft = ref<AdminDraft | null>(null),
  compareOpen = ref(false);
let pendingLeave: (() => void) | null = null;
const publishKey = requestKey(),
  unpublishKey = requestKey(),
  dirty = computed(() => JSON.stringify(content.value) !== saved.value),
  template = computed(() =>
    props.templates.find(
      (t) =>
        t.id === content.value.templateId &&
        t.version === content.value.templateVersion,
    ),
  );
const compatible = computed(() =>
  props.categories.filter(
    (c) => c.enabled && c.allowedTemplateIds.includes(content.value.templateId),
  ),
);
const modules = [
  ["basic", "基本信息"],
  ["problems", "问题与价值"],
  ["features", "核心功能"],
  ["scenarios", "应用场景"],
  ["technical", "参数与边界"],
  ["media", "产品素材"],
  ["materials", "当前资料"],
];
const groups = [
  { key: "problemValues" as const, id: "problems", title: "问题与价值" },
  { key: "features" as const, id: "features", title: "核心功能" },
  { key: "scenarios" as const, id: "scenarios", title: "应用场景" },
];
const missing = computed(() => {
  const c = content.value as unknown as Record<string, unknown>;
  return [
    ...(template.value?.publishRequired ?? [])
      .filter((k) => {
        const v = c[k];
        return typeof v === "string"
          ? !v.trim()
          : Array.isArray(v)
            ? !v.length
            : v == null;
      })
      .map((k) => ({
        path: "/" + k,
        message:
          (
            {
              name: "产品名称",
              owner: "负责人",
              tagline: "一句话定位",
              summary: "简介",
              problemValues: "问题与价值",
              features: "核心功能",
              scenarios: "应用场景",
              boundaries: "能力边界",
              materials: "预览资料",
            } as Record<string, string>
          )[k] ?? k,
      })),
    ...(template.value?.fields ?? [])
      .filter(
        (f) => f.requiredOnPublish && !content.value.technical[f.key]?.trim(),
      )
      .map((f) => ({ path: "/technical/" + f.key, message: f.label })),
  ];
});
const fieldLabels: Record<string, string> = {
  name: "产品名称",
  owner: "负责人",
  tagline: "一句话定位",
  summary: "简介",
  audiences: "适用对象",
  problemValues: "问题与价值",
  features: "核心功能",
  scenarios: "应用场景",
  boundaries: "能力边界",
  materials: "预览资料",
  media: "产品素材",
  categoryId: "分类",
  templateId: "模板",
  aliases: "别名",
  technical: "技术参数",
};
function fieldLabel(path: string) {
  const [, key, sub] = path.split("/");
  return key === "technical"
    ? (template.value?.fields.find((f) => f.key === sub)?.label ?? "技术参数")
    : (fieldLabels[key] ?? "内容");
}
const changedFields = computed(() =>
  serverDraft.value
    ? Object.keys(content.value)
        .filter(
          (key) =>
            JSON.stringify(content.value[key as keyof typeof content.value]) !==
            JSON.stringify(
              serverDraft.value!.content[key as keyof typeof content.value],
            ),
        )
        .map((key) => fieldLabels[key] ?? key)
    : [],
);
function showError(e: unknown) {
  const info = errorInfo(e);
  error.value = info.message;
  fields.value = info.fields;
  conflict.value = info.conflict;
}
function clearError() {
  error.value = "";
  fields.value = [];
  conflict.value = false;
}
function locate(path: string) {
  publishOpen.value = false;
  const part = path.split("/")[1];
  const section =
    part === "technical" || part === "boundaries"
      ? "technical"
      : part === "problemValues"
        ? "problems"
        : ["features", "scenarios", "materials", "media"].includes(part)
          ? part
          : "basic";
  document
    .getElementById("edit-" + section)
    ?.scrollIntoView({ behavior: "smooth", block: "start" });
}
async function save() {
  if (busy.value) return false;
  if (!dirty.value) return true;
  busy.value = true;
  clearError();
  try {
    const d = (
      await api.save(current.value.productId, {
        expectedDraftVersion: current.value.draftVersion,
        content: copy(content.value),
      })
    ).data;
    current.value = d;
    content.value = copy(d.content);
    saved.value = JSON.stringify(d.content);
    notice.value =
      "草稿已保存 · " + new Date(d.updatedAt!).toLocaleTimeString();
    emit("changed");
    return true;
  } catch (e) {
    showError(e);
    return false;
  } finally {
    busy.value = false;
  }
}
async function openPreview() {
  if (!(await save())) return;
  busy.value = true;
  clearError();
  try {
    preview.value = (
      await api.preview(current.value.productId, current.value.draftVersion)
    ).data;
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function openPublish() {
  if (!(await save())) return;
  publicConfirmed.value = false;
  publishOpen.value = true;
}
async function publish() {
  if (busy.value || !publicConfirmed.value) return;
  busy.value = true;
  clearError();
  try {
    const body = {
      expectedDraftVersion: current.value.draftVersion,
      expectedPublicationVersion: current.value.publicationVersion,
      publicContentConfirmed: true as const,
    };
    const r = (
      await api.publish(current.value.productId, body, publishKey(body))
    ).data;
    current.value.publicationState = "PUBLISHED";
    current.value.publicationVersion = r.publicationVersion;
    current.value.releaseSequence = r.releaseSequence;
    current.value.lastPublishedDraftVersion = current.value.draftVersion;
    current.value.hasUnpublishedChanges = false;
    publishOpen.value = false;
    preview.value = null;
    notice.value =
      "发布成功 · 本地目录已生效（第 " + r.releaseSequence + " 次发布）";
    emit("changed");
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
async function unpublish() {
  if (busy.value) return;
  busy.value = true;
  clearError();
  try {
    const body = {
      expectedPublicationVersion: current.value.publicationVersion,
      reason: reason.value,
    };
    const r = (
      await api.unpublish(current.value.productId, body, unpublishKey(body))
    ).data;
    current.value.publicationState = r.publicationState;
    current.value.publicationVersion = r.publicationVersion;
    offlineOpen.value = false;
    notice.value = "已下架，本地公共目录停止新的访问；草稿仍保留。";
    emit("changed");
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
function requestLeave(fn: () => void) {
  if (busy.value) return;
  if (dirty.value) {
    pendingLeave = fn;
    leaveOpen.value = true;
  } else fn();
}
defineExpose({ requestLeave });
async function saveLeave() {
  if (await save()) {
    leaveOpen.value = false;
    pendingLeave?.();
  }
}
function beforeUnload(e: BeforeUnloadEvent) {
  if (dirty.value) {
    e.preventDefault();
    e.returnValue = "";
  }
}
onMounted(() => window.addEventListener("beforeunload", beforeUnload));
onBeforeUnmount(() => window.removeEventListener("beforeunload", beforeUnload));
async function compare() {
  try {
    serverDraft.value = (await api.draft(current.value.productId)).data;
    compareOpen.value = true;
  } catch (e) {
    showError(e);
  }
}
function useServer() {
  if (!serverDraft.value) return;
  current.value = serverDraft.value;
  content.value = copy(serverDraft.value.content);
  saved.value = JSON.stringify(content.value);
  compareOpen.value = false;
  clearError();
  notice.value = "已采用服务器草稿。";
}
function rebaseLocal() {
  if (!serverDraft.value) return;
  current.value = serverDraft.value;
  saved.value = JSON.stringify(serverDraft.value.content);
  compareOpen.value = false;
  clearError();
  notice.value = "已保留本地输入并更新基准，请再次核对后手动保存。";
}
function addItem(key: "problemValues" | "features" | "scenarios") {
  content.value[key].push({ id: crypto.randomUUID(), title: "", text: "" });
}
function editMaterial(index: number | null) {
  materialIndex.value = index;
  materialOpen.value = true;
}
function putMaterial(m: Domain["MaterialRef"]) {
  if (materialIndex.value === null) content.value.materials.push(m);
  else content.value.materials[materialIndex.value] = m;
  materialOpen.value = false;
  notice.value = "资料已加入本次编辑；请保存草稿。";
}
const mediaStatus = ref(""),
  mediaAlt = ref(""),
  mediaRole = ref<"cover" | "screenshot" | "diagram">("screenshot");
let mediaFile: File | null = null;
async function addMedia(file: File | null) {
  if (!file) return;
  mediaFile = file;
  if (!mediaAlt.value.trim()) {
    error.value = "请先填写素材替代文字";
    return;
  }
  busy.value = true;
  clearError();
  try {
    const a = await uploadFile(
      current.value.productId,
      file,
      "media",
      (t) => (mediaStatus.value = t),
    );
    if (mediaRole.value === "cover")
      content.value.media.forEach((m) => {
        if (m.role === "cover") m.role = "screenshot";
      });
    content.value.media.push({
      mediaId: crypto.randomUUID(),
      assetId: a.assetId,
      role: mediaRole.value,
      alt: mediaAlt.value,
    });
    mediaFile = null;
    mediaAlt.value = "";
    notice.value = "素材已加入本次编辑，尚未发布。";
  } catch (e) {
    showError(e);
  } finally {
    busy.value = false;
  }
}
function mediaSelected(e: Event) {
  const input = e.target as HTMLInputElement;
  void addMedia(input.files?.[0] ?? null);
  input.value = "";
}
</script>
<template>
  <DraftPreview
    v-if="preview"
    :draft="preview"
    :template="template"
    :publishing="busy"
    @back="preview = null"
    @publish="openPublish"
  /><template v-else
    ><div class="editor-top">
      <div>
        <button class="text-button" @click="requestLeave(() => emit('back'))">
          ← 返回产品管理
        </button>
        <h1>
          {{ content.name || "产品编辑" }}
          <span :class="['state-tag', current.publicationState]">{{
            stateName(current.publicationState)
          }}</span>
        </h1>
        <p>
          {{ current.productId }} · {{ template?.name }} v{{
            content.templateVersion
          }}
          · 草稿版本 {{ current.draftVersion
          }}<span
            v-if="
              current.hasUnpublishedChanges ||
              (current.lastPublishedDraftVersion !== null && dirty)
            "
            class="warning"
          >
            · 有未发布修改</span
          >
        </p>
      </div>
      <div class="editor-actions">
        <span :class="dirty ? 'warning' : 'muted'">{{
          dirty ? "有未保存修改" : "已保存"
        }}</span
        ><button :disabled="busy || !dirty" @click="save">保存草稿</button
        ><button :disabled="busy" @click="openPreview">预览</button
        ><button class="primary" :disabled="busy" @click="openPublish">
          {{ current.publicationState === "PUBLISHED" ? "发布更新" : "发布" }}
        </button>
      </div>
    </div>
    <div v-if="notice" class="success-banner" role="status">{{ notice }}</div>
    <div v-if="error" class="error-inline" role="alert">
      <strong>{{ error }}</strong>
      <ul v-if="fields.length">
        <li v-for="f in fields" :key="f.path">
          <button class="text-button" @click="locate(f.path)">
            {{ fieldLabel(f.path) }}：{{ f.message }}
          </button>
        </li>
      </ul>
      <button v-if="conflict" @click="compare">读取最新草稿并对比</button>
    </div>
    <div class="editor-layout">
      <nav class="module-nav" aria-label="内容模块">
        <a v-for="[id, label] in modules" :key="id" :href="'#edit-' + id">{{
          label
        }}</a>
        <div class="check-card">
          <strong>发布前待补充 {{ missing.length }} 项</strong
          ><button
            v-for="f in missing"
            :key="f.path"
            class="text-button"
            @click="locate(f.path)"
          >
            {{ f.message }}
          </button>
          <p v-if="!missing.length">字段已齐全，发布时仍将检查资料和版本。</p>
        </div>
      </nav>
      <fieldset :disabled="busy" class="editor-form">
        <section id="edit-basic" class="edit-section">
          <h2>基本信息</h2>
          <div class="form-grid">
            <label class="field"
              >产品名称<input v-model="content.name" maxlength="80" /></label
            ><label class="field"
              >负责人<input v-model="content.owner" maxlength="80" /></label
            ><label class="field"
              >所属分类<select v-model="content.categoryId">
                <option v-for="c in compatible" :key="c.id" :value="c.id">
                  {{ c.name }}
                </option>
              </select></label
            ><label class="field"
              >内容模板<input
                :value="template?.name + ' v' + content.templateVersion"
                readonly
            /></label>
          </div>
          <label class="field"
            >别名（逗号分隔，可选）<input
              :value="content.aliases?.join('，')"
              @change="
                content.aliases = ($event.target as HTMLInputElement).value
                  .split(/[，,]/)
                  .map((s) => s.trim())
                  .filter(Boolean)
              " /></label
          ><label class="field"
            >一句话定位<textarea
              v-model="content.tagline"
              maxlength="80"
              rows="2"
            /><small>{{ content.tagline.length }} / 80</small></label
          ><label class="field"
            >产品简介<textarea
              v-model="content.summary"
              maxlength="1500"
              rows="5"
            /><small>{{ content.summary.length }} / 1500</small></label
          ><label class="field"
            >适用对象（可选）<textarea
              v-model="content.audiences"
              maxlength="1000"
              rows="2"
            />
          </label>
        </section>
        <section
          v-for="group in groups"
          :id="'edit-' + group.id"
          :key="group.key"
          class="edit-section"
        >
          <div class="section-toolbar">
            <h2>{{ group.title }}</h2>
            <button @click="addItem(group.key)">
              添加{{ group.title }}条目
            </button>
          </div>
          <p v-if="!content[group.key].length" class="helper">
            发布至少需要一条；只填写可以准确说明的内容。
          </p>
          <div
            v-for="(item, i) in content[group.key]"
            :key="item.id"
            class="item-editor"
          >
            <label class="field"
              >{{ group.title }}标题 {{ i + 1
              }}<input v-model="item.title" maxlength="120" /></label
            ><label class="field"
              >{{ group.title }}说明 {{ i + 1
              }}<textarea
                v-model="item.text"
                maxlength="3000"
                rows="3"
              /></label
            ><button
              class="text-button"
              @click="content[group.key].splice(i, 1)"
            >
              移除此条目
            </button>
          </div>
        </section>
        <section id="edit-technical" class="edit-section">
          <h2>参数与边界</h2>
          <label v-for="f in template?.fields" :key="f.key" class="field"
            >{{ f.label
            }}<span class="field-requirement">{{
              f.requiredOnPublish ? "发布必填" : "可选"
            }}</span
            ><textarea
              v-model="content.technical[f.key]"
              :maxlength="f.maxLength"
              rows="3"
            />
            <details v-if="f.help">
              <summary>填写提示</summary>
              <small>{{ f.help }}</small>
            </details></label
          ><label class="field"
            >能力边界<textarea
              v-model="content.boundaries"
              maxlength="3000"
              rows="4"
            />
          </label>
        </section>
        <section id="edit-media" class="edit-section">
          <h2>产品素材（可选）</h2>
          <p class="helper">没有图片时使用简洁图形标识；不影响最低发布条件。</p>
          <div
            v-for="(m, i) in content.media"
            :key="m.mediaId"
            class="material-line"
          >
            <span>{{ m.role === "cover" ? "封面" : "素材" }} · {{ m.alt }}</span
            ><button @click="content.media.splice(i, 1)">从草稿移除素材</button>
          </div>
          <label class="field"
            >新素材替代文字<input v-model="mediaAlt" maxlength="300" /></label
          ><label class="field"
            >新素材用途<select v-model="mediaRole">
              <option value="screenshot">截图</option>
              <option value="cover">封面</option>
              <option value="diagram">示意图</option>
            </select></label
          ><label class="field"
            >素材图片（≤8 MiB）<input
              type="file"
              accept=".png,.jpg,.jpeg,.webp"
              @change="mediaSelected"
          /></label>
          <p class="helper" role="status">{{ mediaStatus }}</p>
          <button v-if="mediaFile && !busy" @click="addMedia(mediaFile)">
            重试素材上传
          </button>
        </section>
        <section id="edit-materials" class="edit-section">
          <div class="section-toolbar">
            <h2>当前资料</h2>
            <button
              :disabled="content.materials.length >= 20"
              @click="editMaterial(null)"
            >
              添加资料
            </button>
          </div>
          <p class="helper">
            至少一份可预览资料。替换或移除只影响草稿，发布更新后生效。
          </p>
          <p v-if="!content.materials.length">尚未添加资料。</p>
          <div
            v-for="(m, i) in content.materials"
            :key="m.materialId"
            class="material-line"
          >
            <div>
              <strong>{{ m.name }}</strong>
              <p>
                {{ m.versionLabel }} ·
                {{ m.preview.kind === "pdf" ? "PDF" : "图片" }} ·
                {{
                  m.preview.kind === "pdf"
                    ? m.preview.pageCount
                    : m.preview.pages.length
                }}
                页
              </p>
            </div>
            <div>
              <button @click="editMaterial(i)">编辑资料</button
              ><button @click="content.materials.splice(i, 1)">
                从草稿移除
              </button>
            </div>
          </div>
        </section>
      </fieldset>
    </div>
    <div v-if="current.publicationState !== 'DRAFT'" class="danger-zone">
      <div>
        <strong>下架产品</strong>
        <p>停止新的公开访问，保留草稿与历史；不要求先保存当前编辑。</p>
      </div>
      <button
        class="danger"
        :disabled="busy || current.publicationState === 'OFFLINE'"
        @click="offlineOpen = true"
      >
        {{ current.publicationState === "OFFLINE" ? "当前已下架" : "下架产品" }}
      </button>
    </div></template
  >
  <MaterialDrawer
    v-if="materialOpen"
    :product-id="current.productId"
    :initial="
      materialIndex === null ? undefined : content.materials[materialIndex]
    "
    @save="putMaterial"
    @cancel="materialOpen = false"
  />
  <Modal
    v-if="publishOpen"
    title="确认发布"
    :busy="busy"
    @close="publishOpen = false"
    ><p>
      <strong>{{ content.name }}</strong> ·
      {{ content.materials.length }} 份资料
    </p>
    <p>
      {{
        current.publicationState === "PUBLISHED"
          ? "本次将整体替换当前本地发布版本。"
          : "发布后将在本地公开目录中显示。"
      }}
    </p>
    <div v-if="missing.length" class="warning">
      <p>还差以下内容：</p>
      <button
        v-for="f in missing"
        :key="f.path"
        class="text-button"
        @click="locate(f.path)"
      >
        {{ f.message }}
      </button>
    </div>
    <label class="field check-line"
      ><input
        v-model="publicConfirmed"
        type="checkbox"
      />我已检查内容，可在本地模拟目录中展示。</label
    >
    <p v-if="error" class="error-inline" role="alert">
      未发布，当前线上内容保持不变。{{ error }}
    </p>
    <ul v-if="fields.length">
      <li v-for="f in fields" :key="f.path">
        <button class="text-button" @click="locate(f.path)">
          {{ f.message }}
        </button>
      </li>
    </ul>
    <template #footer
      ><button :disabled="busy" @click="publishOpen = false">取消</button
      ><button
        class="primary"
        :disabled="busy || !publicConfirmed"
        @click="publish"
      >
        {{ busy ? "正在发布…" : "确认发布" }}
      </button></template
    ></Modal
  >
  <Modal
    v-if="offlineOpen"
    title="确认下架"
    :busy="busy"
    @close="offlineOpen = false"
    ><p>
      新访问将不可用。草稿、历史及设备已经加载的内容不会被远程删除；本次未保存修改仍保留在编辑器中。
    </p>
    <label class="field"
      >下架原因（可选）<textarea v-model="reason" rows="2" maxlength="300" />
    </label>
    <p v-if="error" class="error-inline" role="alert">{{ error }}</p>
    <template #footer
      ><button :disabled="busy" @click="offlineOpen = false">取消</button
      ><button class="danger" :disabled="busy" @click="unpublish">
        确认下架
      </button></template
    ></Modal
  >
  <Modal
    v-if="leaveOpen"
    title="有未保存修改"
    :busy="busy"
    @close="leaveOpen = false"
    ><p>请决定如何处理本次输入。</p>
    <p v-if="error" class="error-inline" role="alert">{{ error }}</p>
    <template #footer
      ><button @click="leaveOpen = false">继续编辑</button
      ><button
        :disabled="busy"
        @click="
          leaveOpen = false;
          pendingLeave?.();
        "
      >
        放弃本次修改</button
      ><button class="primary" :disabled="busy" @click="saveLeave">
        保存并离开
      </button></template
    ></Modal
  >
  <Modal
    v-if="compareOpen && serverDraft"
    title="核对保存冲突"
    wide
    @close="compareOpen = false"
    ><p>
      服务器版本 {{ serverDraft.draftVersion }}；本地基于版本
      {{ current.draftVersion }}。保留本地输入后仍需手动保存，可能再次发生冲突。
    </p>
    <p>差异字段：{{ changedFields.join("、") || "无内容差异" }}</p>
    <details>
      <summary>查看详细内容</summary>
      <div class="compare-grid">
        <section>
          <h3>本地输入</h3>
          <pre>{{ JSON.stringify(content, null, 2) }}</pre>
        </section>
        <section>
          <h3>服务器最新草稿</h3>
          <pre>{{ JSON.stringify(serverDraft.content, null, 2) }}</pre>
        </section>
      </div>
    </details>
    <template #footer
      ><button @click="compareOpen = false">继续核对</button
      ><button @click="rebaseLocal">保留本地输入并采用新版本基准</button
      ><button class="danger" @click="useServer">
        放弃本地输入并加载服务器稿
      </button></template
    ></Modal
  >
</template>
