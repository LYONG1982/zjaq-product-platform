<script setup lang="ts">
import { normalizeProductName, productNameError, productNameUnits } from "@zj/contracts";
import { computed, ref } from "vue";
import type { AdminDraft, Category, Template, Domain } from "@zj/contracts";
import { api, requestKey, errorInfo } from "../api";
import Modal from "./Modal.vue";
const props = defineProps<{ categories: Category[]; templates: Template[] }>();
const emit = defineEmits<{ created: [draft: AdminDraft]; cancel: [] }>();
const step = ref(1),
  categoryId = ref(props.categories.find((c) => c.enabled)?.id ?? ""),
  templateId = ref(""),
  name = ref(""),
  owner = ref(""),
  model = ref(""),
  productType = ref<Domain["CreateProduct"]["productType"] | "">(""),
  ownership = ref<Domain["CreateProduct"]["ownership"] | "">(""),
  sequence = ref(""),
  aliases = ref(""),
  busy = ref(false),
  error = ref(""),
  duplicate = ref(false),
  allowDuplicate = ref(false),
  confirmCancel = ref(false),
  confirmCreate = ref(false);
const key = requestKey();
const category = computed(() =>
  props.categories.find((c) => c.id === categoryId.value),
);
const choices = computed(() =>
  props.templates.filter(
    (t) =>
      t.enabledForCreate && category.value?.allowedTemplateIds.includes(t.id),
  ),
);
const chosen = computed(
  () =>
    choices.value.find((t) => t.id === templateId.value) ??
    choices.value.find((t) => t.id === category.value?.defaultTemplateId) ??
    choices.value[0],
);
const hint = ref("");
const seriesCodes: Record<string, string> = { miding: "D", miyi: "Y", mishu: "S", ai: "A" };
const typeCodes: Record<string, string> = { SOFTWARE: "S", HARDWARE: "H" };
const ownershipCodes: Record<string, string> = { SELF_DEVELOPED: "A", PARTNER: "B" };
const codePreview = computed(() => {
  const series = seriesCodes[categoryId.value];
  const type = productType.value ? typeCodes[productType.value] : undefined;
  const from = ownership.value ? ownershipCodes[ownership.value] : undefined;
  const tail = sequence.value.trim();
  return series && type && from && /^\d{1,3}$/.test(tail)
    ? `ZJ-${series}-${type}-${from}-${tail.padStart(3, "0")}`
    : "";
});
function changeCategory() {
  if (!choices.value.some((t) => t.id === templateId.value)) {
    templateId.value = category.value?.defaultTemplateId ?? "";
    hint.value = "已切换为该分类的默认模板。";
  }
}
changeCategory();
function close() {
  if (name.value || owner.value || model.value || productType.value || ownership.value || aliases.value || sequence.value) confirmCancel.value = true;
  else emit("cancel");
}
async function prepare() {
  if (busy.value) return;
  error.value = "";
  if (!name.value.trim() || !owner.value.trim() || !model.value.trim() || !productType.value || !ownership.value || !chosen.value) {
    error.value = "请填写产品名称、产品资料负责人、型号，并选择产品类型和属性。";
    return;
  }
  if (!seriesCodes[categoryId.value]) {
    error.value = "该分类不在编号体系内，请选择密鼎、密翼、密塾或 AI+ 系列。";
    return;
  }
  const tail = sequence.value.trim();
  if (!/^\d{1,3}$/.test(tail) || Number(tail) < 1 || Number(tail) > 999) {
    error.value = "请填写 1 至 999 的编号流水。";
    return;
  }
  name.value = normalizeProductName(name.value);
  if (productNameError(name.value)) { error.value = productNameError(name.value); return; }
  busy.value = true;
  try {
    const check = await api.products({ q: name.value.trim(), limit: 100 });
    duplicate.value = check.data.some(
      (p) => p.name.trim() === name.value.trim(),
    );
    if (duplicate.value && !allowDuplicate.value) return;
    confirmCreate.value = true;
  } catch (e) {
    error.value = errorInfo(e).message;
  } finally {
    busy.value = false;
  }
}
async function create() {
  if (busy.value || !chosen.value || !productType.value || !ownership.value) return;
  error.value = "";
  busy.value = true;
  try {
    const body: Domain["CreateProduct"] = {
      name: name.value.trim(),
      owner: owner.value.trim(),
      model: model.value.trim(),
      productType: productType.value,
      ownership: ownership.value,
      categoryId: categoryId.value,
      templateId: chosen.value.id as Domain["CreateProduct"]["templateId"],
      templateVersion: chosen.value.version,
      sequence: Number(sequence.value.trim()),
      aliases: aliases.value
        .split(/[，,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    emit("created", (await api.create(body, key(body))).data);
  } catch (e) {
    confirmCreate.value = false;
    error.value = errorInfo(e).message;
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <Modal title="新增产品" wide :busy="busy" @close="close"
    ><p class="step-line">
      第 {{ step }} 步 / 2 · {{ step === 1 ? "分类与模板" : "基础信息" }}
    </p>
    <fieldset :disabled="busy">
      <template v-if="step === 1"
        ><label class="field"
          >产品分类<select v-model="categoryId" @change="changeCategory">
            <option
              v-for="c in categories.filter((c) => c.enabled)"
              :key="c.id"
              :value="c.id"
            >
              {{ c.name }}
            </option>
          </select></label
        >
        <p class="helper">{{ hint }}</p>
        <div v-if="['miding', 'miyi', 'mishu', 'ai'].includes(categoryId)" class="series-selection-icon"><img :src="'/series/' + categoryId + '.png'" alt="" aria-hidden="true" /><span>已自动匹配{{ category?.shortName }}系列图标</span></div>
        <div class="wizard-templates">
          <button
            v-for="t in choices"
            :key="t.id + '-' + t.version"
            type="button"
            :class="['template-card', { selected: chosen?.id === t.id }]"
            @click="templateId = t.id"
          >
            <strong>{{ t.name }}</strong
            ><span v-if="t.id === category?.defaultTemplateId" class="small-tag"
              >默认推荐</span
            >
            <p>{{ t.description }}</p>
            <small>{{
              t.fields
                .map((f) => f.label)
                .slice(0, 3)
                .join(" · ")
            }}</small>
          </button>
        </div></template
      ><template v-else
        ><p class="helper">
          {{ category?.name }} · {{ chosen?.name }} v{{ chosen?.version }} ·
          编号按《产品双码互通体系方案》对照表填写
        </p>
        <label class="field"
          >正式名称<input aria-label="正式名称"
            v-model="name" @input="allowDuplicate = false; !($event as InputEvent).isComposing && (name = normalizeProductName(($event.target as HTMLInputElement).value))" @compositionend="name = normalizeProductName(($event.target as HTMLInputElement).value)"
            maxlength="80"
            autocomplete="off" /><small>{{ productNameUnits(normalizeProductName(name).trim()) }} / 15 个全角显示单位；中文计 1，英文、数字及英文括号计 0.5。</small></label
        ><label class="field"
          >产品资料负责人<input
            v-model="owner"
            maxlength="80"
            autocomplete="off" /></label
        ><label class="field"
          >产品型号<input v-model="model" maxlength="80" autocomplete="off" /></label
        ><label class="field"
          >编号流水（三位，001~999）<input
            v-model="sequence"
            inputmode="numeric"
            maxlength="3"
            autocomplete="off"
            placeholder="例如 008" /><small>{{
            codePreview || "填写后预览完整编号"
          }}</small></label
        ><label class="field"
          >产品类型<select v-model="productType"><option value="">请选择</option><option value="SOFTWARE">软件</option><option value="HARDWARE">软硬件</option></select></label
        ><label class="field"
          >产品属性<select v-model="ownership"><option value="">请选择</option><option value="SELF_DEVELOPED">自研</option><option value="PARTNER">合作</option></select></label
        ><label class="field"
          >别名（可选，用逗号分隔）<textarea
            v-model="aliases"
            rows="2"
            maxlength="800"
          /></label
        ><label v-if="duplicate" class="warning"
          ><input
            v-model="allowDuplicate"
            type="checkbox"
          />发现同名产品，我已核对，仍需创建独立产品。</label
        ></template
      >
    </fieldset>
    <p v-if="error" class="error-inline" role="alert">{{ error }}</p>
    <template #footer
      ><button v-if="step === 2" :disabled="busy" @click="step = 1">
        上一步</button
      ><button :disabled="busy" @click="close">取消</button
      ><button
        v-if="step === 1"
        class="primary"
        :disabled="!chosen"
        @click="step = 2"
      >
        下一步</button
      ><button v-else class="primary" :disabled="busy" @click="prepare">
        下一步确认
      </button></template
    ></Modal
  ><Modal
    v-if="confirmCreate"
    title="确认新增产品"
    :busy="busy"
    @close="confirmCreate = false"
    ><p>请核对产品名称、编号与型号，确认后写入草稿。</p>
    <p class="helper">产品名称：{{ name }}</p>
    <p class="helper">产品编号：{{ codePreview }}</p>
    <p class="helper">产品型号：{{ model }}</p>
    <p class="helper">产品系列：{{ category?.name }}</p>
    <p class="helper">产品类型：{{ productType === "HARDWARE" ? "软硬件" : "软件" }}</p>
    <p class="helper">产品属性：{{ ownership === "PARTNER" ? "合作" : "自研" }}</p>
    <template #footer
      ><button :disabled="busy" @click="confirmCreate = false">返回修改</button
      ><button class="primary" :disabled="busy" @click="create">
        {{ busy ? "正在创建…" : "确认创建" }}
      </button></template
    ></Modal
  ><Modal
    v-if="confirmCancel"
    title="放弃新增输入"
    @close="confirmCancel = false"
    ><p>尚未创建产品。放弃后会清除本次输入。</p>
    <template #footer
      ><button @click="confirmCancel = false">继续填写</button
      ><button class="danger" @click="emit('cancel')">
        放弃输入
      </button></template
    ></Modal
  >
</template>
