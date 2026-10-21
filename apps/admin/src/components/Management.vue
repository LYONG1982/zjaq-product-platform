<script setup lang="ts">
import { ref, watch } from "vue";
import type { Category, Template, Responses, Domain } from "@zj/contracts";
import { api } from "../api";
import Modal from "./Modal.vue";
const props = defineProps<{
    kind: "categories" | "users";
    templates: Template[];
    canManage: boolean;
  }>(),
  emit = defineEmits<{ changed: [] }>();
const categories = ref<Category[]>([]),
  users = ref<Responses["AdminUser"][]>([]),
  loading = ref(false),
  error = ref(""),
  open = ref(false),
  editingId = ref("");
const category = ref<Domain["CategoryWrite"]>({
  name: "",
  shortName: "",
  sortOrder: 50,
  enabled: true,
  defaultTemplateId: "software",
  allowedTemplateIds: ["software"],
});
const user = ref<Domain["AdminUserWrite"]>({
  subjectId: "",
  displayName: "",
  role: "CONTENT_MANAGER",
  enabled: true,
});
async function load() {
  loading.value = true;
  error.value = "";
  try {
    if (props.kind === "categories")
      categories.value = (await api.categories()).data;
    else if (props.canManage) users.value = (await api.users()).data;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    loading.value = false;
  }
}
function editCategory(c?: Category) {
  editingId.value = c?.id ?? "";
  category.value = c
    ? {
        name: c.name,
        shortName: c.shortName,
        sortOrder: c.sortOrder,
        enabled: c.enabled,
        defaultTemplateId: c.defaultTemplateId,
        allowedTemplateIds: [...c.allowedTemplateIds],
        expectedVersion: c.version,
      }
    : {
        name: "",
        shortName: "",
        sortOrder: 50,
        enabled: true,
        defaultTemplateId: "software",
        allowedTemplateIds: ["software"],
      };
  error.value = "";
  open.value = true;
}
function editUser(u?: Responses["AdminUser"]) {
  editingId.value = u?.userId ?? "";
  user.value = u
    ? {
        subjectId: u.subjectId,
        displayName: u.displayName,
        role: u.role,
        enabled: u.enabled,
        expectedVersion: u.version,
      }
    : {
        subjectId: "",
        displayName: "",
        role: "CONTENT_MANAGER",
        enabled: true,
      };
  error.value = "";
  open.value = true;
}
async function save() {
  loading.value = true;
  error.value = "";
  try {
    if (props.kind === "categories") {
      if (editingId.value)
        await api.updateCategory(editingId.value, category.value);
      else await api.createCategory(category.value);
    } else {
      if (editingId.value) await api.updateUser(editingId.value, user.value);
      else await api.createUser(user.value);
    }
    open.value = false;
    await load();
    emit("changed");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "保存失败";
  } finally {
    loading.value = false;
  }
}
watch(() => [props.kind, props.canManage], load, { immediate: true });
</script>
<template>
  <section class="management table-card">
    <div class="table-heading">
      <h2>{{ kind === "categories" ? "产品分类" : "后台账号" }}</h2>
      <button
        v-if="canManage"
        class="primary"
        @click="kind === 'categories' ? editCategory() : editUser()"
      >
        {{ kind === "categories" ? "新增分类" : "新增账号" }}
      </button>
    </div>
    <p v-if="!canManage" class="muted management-note">
      {{
        kind === "categories"
          ? "分类由管理员维护。"
          : "仅管理员可查看和维护后台账号。"
      }}
    </p>
    <div v-if="error && !open" class="error-panel" role="alert">
      {{ error }}<button @click="load">重新加载</button>
    </div>
    <p v-if="loading && !open" role="status" class="management-note">
      正在读取…
    </p>
    <div class="table-scroll">
      <table v-if="kind === 'categories'">
        <thead>
          <tr>
            <th>分类</th>
            <th>默认模板</th>
            <th>排序</th>
            <th>引用产品</th>
            <th>状态</th>
            <th v-if="canManage">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="c in categories" :key="c.id">
            <td>{{ c.name }}</td>
            <td>
              {{ templates.find((t) => t.id === c.defaultTemplateId)?.name }}
            </td>
            <td>{{ c.sortOrder }}</td>
            <td>{{ c.referenceCount }}</td>
            <td>{{ c.enabled ? "启用" : "停用" }}</td>
            <td v-if="canManage">
              <button class="text-button" @click="editCategory(c)">修改</button>
            </td>
          </tr>
        </tbody>
      </table>
      <table v-else-if="canManage">
        <thead>
          <tr>
            <th>显示名称</th>
            <th>身份主体</th>
            <th>角色</th>
            <th>状态</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="u in users" :key="u.userId">
            <td>{{ u.displayName }}</td>
            <td>{{ u.subjectId }}</td>
            <td>{{ u.role === "ADMIN" ? "管理员" : "内容制作人" }}</td>
            <td>{{ u.enabled ? "启用" : "禁用" }}</td>
            <td>
              <button class="text-button" @click="editUser(u)">修改</button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  </section>
  <Modal
    v-if="open"
    :title="
      (editingId ? '修改' : '新增') +
      (kind === 'categories' ? '分类' : '后台账号')
    "
    @close="open = false"
    ><form id="management-form" class="management-form" @submit.prevent="save">
      <template v-if="kind === 'categories'"
        ><label class="field"
          >分类名称<input
            v-model="category.name"
            required
            maxlength="100" /></label
        ><label class="field"
          >简称<input
            v-model="category.shortName"
            required
            maxlength="30" /></label
        ><label class="field"
          >排序<input
            v-model.number="category.sortOrder"
            type="number"
            min="0"
            max="100000"
            required
        /></label>
        <fieldset>
          <legend>允许使用的模板</legend>
          <label
            v-for="t in templates.filter((t) => t.enabledForCreate)"
            :key="t.id"
            class="checkbox-label"
            ><input
              v-model="category.allowedTemplateIds"
              type="checkbox"
              :value="t.id"
            />{{ t.name }}</label
          >
        </fieldset>
        <label class="field"
          >默认模板<select v-model="category.defaultTemplateId">
            <option
              v-for="t in templates.filter((t) =>
                category.allowedTemplateIds.includes(t.id),
              )"
              :key="t.id"
              :value="t.id"
            >
              {{ t.name }}
            </option>
          </select></label
        ><label class="checkbox-label"
          ><input v-model="category.enabled" type="checkbox" />启用分类</label
        ></template
      ><template v-else
        ><label class="field"
          >身份主体<input
            v-model="user.subjectId"
            :disabled="!!editingId"
            required
            maxlength="200"
          /><small>填写身份服务提供的主体 ID。</small></label
        ><label class="field"
          >显示名称<input
            v-model="user.displayName"
            required
            maxlength="100" /></label
        ><label class="field"
          >角色<select v-model="user.role">
            <option value="CONTENT_MANAGER">内容制作人</option>
            <option value="ADMIN">管理员</option>
          </select></label
        ><label class="checkbox-label"
          ><input v-model="user.enabled" type="checkbox" />启用账号</label
        ></template
      >
      <div v-if="error" class="error-panel" role="alert">{{ error }}</div>
    </form>
    <template #footer
      ><button @click="open = false">取消</button
      ><button
        class="primary"
        type="submit"
        form="management-form"
        :disabled="loading"
      >
        {{ loading ? "正在保存…" : "保存" }}
      </button></template
    ></Modal
  >
</template>
