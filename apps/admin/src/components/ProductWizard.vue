<script setup lang="ts">
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
  aliases = ref(""),
  busy = ref(false),
  error = ref(""),
  duplicate = ref(false),
  allowDuplicate = ref(false),
  confirmCancel = ref(false);
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
function changeCategory() {
  if (!choices.value.some((t) => t.id === templateId.value)) {
    templateId.value = category.value?.defaultTemplateId ?? "";
    hint.value = "已切换为该分类的默认模板。";
  }
}
changeCategory();
function close() {
  if (name.value || owner.value || aliases.value) confirmCancel.value = true;
  else emit("cancel");
}
async function create() {
  if (busy.value) return;
  error.value = "";
  if (!name.value.trim() || !owner.value.trim() || !chosen.value) {
    error.value = "请填写产品名称、负责人并选择有效模板。";
    return;
  }
  busy.value = true;
  try {
    const check = await api.products({ q: name.value.trim(), limit: 100 });
    duplicate.value = check.data.some(
      (p) => p.name.trim() === name.value.trim(),
    );
    if (duplicate.value && !allowDuplicate.value) return;
    const body: Domain["CreateProduct"] = {
      name: name.value.trim(),
      owner: owner.value.trim(),
      categoryId: categoryId.value,
      templateId: chosen.value.id as Domain["CreateProduct"]["templateId"],
      templateVersion: chosen.value.version,
      aliases: aliases.value
        .split(/[，,\n]/)
        .map((x) => x.trim())
        .filter(Boolean),
    };
    emit("created", (await api.create(body, key(body))).data);
  } catch (e) {
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
          编号将在创建后生成
        </p>
        <label class="field"
          >正式名称<input
            v-model="name"
            maxlength="80"
            @input="allowDuplicate = false"
            autocomplete="off" /></label
        ><label class="field"
          >负责人<input
            v-model="owner"
            maxlength="80"
            autocomplete="off" /></label
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
      ><button v-else class="primary" :disabled="busy" @click="create">
        {{ busy ? "正在创建…" : "创建并开始制作" }}
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
