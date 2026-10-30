<script setup lang="ts">
import { ref, onMounted, onUnmounted, computed } from "vue";
import type {
  AdminDraft,
  AdminProductRow,
  Category,
  Template,
  Responses,
} from "@zj/contracts";
import Modal from "./components/Modal.vue";
import { api, stateName, requestKey } from "./api";
import SignIn from "./components/SignIn.vue";
import Management from "./components/Management.vue";
import SiteBannerSettings from "./components/SiteBannerSettings.vue";
import SiteContactSettings from "./components/SiteContactSettings.vue";
import AnalyticsPanel from "./components/AnalyticsPanel.vue";
import FeedbackList from "./components/FeedbackList.vue";
import ProductWizard from "./components/ProductWizard.vue";
import ProductEditor from "./components/ProductEditor.vue";
const authNeeded = ref(false);
const expired = () => {
  authNeeded.value = true;
};
window.addEventListener("zj-session-expired", expired);
onUnmounted(() => window.removeEventListener("zj-session-expired", expired));
const auditTab = ref("operations");
const section = ref("products"),
  q = ref(""),
  category = ref(""),
  state = ref(""),
  owner = ref(""),
  removed = ref(""),
  loading = ref(true),
  error = ref(""),
  rows = ref<AdminProductRow[]>([]),
  categories = ref<Category[]>([]),
  templates = ref<Template[]>([]),
  next = ref<string | null>(null),
  displayName = ref(""),
  isAdmin = ref(false),
  selectedTemplate = ref(""),
  wizard = ref(false),
  editing = ref<AdminDraft | null>(null),
  editor = ref<InstanceType<typeof ProductEditor> | null>(null),
  events = ref<Responses["AuditEvent"][]>([]),
  auditNext = ref<string | null>(null),
  auditProduct = ref(""),
  auditAction = ref("");
let seq = 0;
const shownTemplate = computed(
  () =>
    templates.value.find((t) => t.id === selectedTemplate.value) ??
    templates.value[0],
);
const label = (id: string) =>
  categories.value.find((c) => c.id === id)?.shortName ?? id;
async function load(append = false) {
  const id = ++seq;
  loading.value = true;
  error.value = "";
  try {
    const r = await api.products({
      q: q.value || undefined,
      categoryId: category.value || undefined,
      publicationState: state.value || undefined,
      owner: owner.value.trim() || undefined,
      removed: isAdmin.value && removed.value === "true" ? true : undefined,
      cursor: append ? (next.value ?? undefined) : undefined,
    });
    if (id !== seq) return;
    rows.value = append ? [...rows.value, ...r.data] : r.data;
    next.value = r.page.nextCursor;
  } catch (e) {
    if (id === seq) error.value = e instanceof Error ? e.message : "加载失败";
  } finally {
    if (id === seq) loading.value = false;
  }
}
function resetFilters() {
  q.value = "";
  category.value = "";
  state.value = "";
  owner.value = "";
  removed.value = "";
  void load();
}
async function bootstrap() {
  loading.value = true;
  try {
    const [me, c, t] = await Promise.all([
      api.me(),
      api.categories(),
      api.templates({ includeDisabled: true }),
    ]);
    displayName.value = me.data.displayName;
    isAdmin.value = me.data.role === "ADMIN";
    categories.value = c.data;
    templates.value = t.data;
    await load();
  } catch (e) {
    error.value = e instanceof Error ? e.message : "服务连接失败";
    loading.value = false;
  }
}
async function edit(id: string) {
  loading.value = true;
  error.value = "";
  try {
    editing.value = (await api.draft(id)).data;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "读取失败";
  } finally {
    loading.value = false;
  }
}
async function loadAudit(append = false) {
  loading.value = true;
  error.value = "";
  try {
    const r = await api.audit({
      productId: auditProduct.value || undefined,
      action: auditAction.value || undefined,
      cursor: append ? (auditNext.value ?? undefined) : undefined,
    });
    events.value = append ? [...events.value, ...r.data] : r.data;
    auditNext.value = r.page.nextCursor;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "读取失败";
  } finally {
    loading.value = false;
  }
}
function navigate(target: string) {
  const go = () => {
    editing.value = null;
    section.value = target;
    if (target === "products") void load();
    else if (target === "audit") void loadAudit();
  };
  if (editing.value && editor.value) editor.value.requestLeave(go);
  else go();
}
function created(d: AdminDraft) {
  wizard.value = false;
  editing.value = d;
  void load();
}
const removalRow = ref<AdminProductRow | null>(null), removalMode = ref<"remove" | "restore">("remove"), removalReason = ref(""), removalConfirmed = ref(false), removalBusy = ref(false), removalError = ref(""), removalNotice = ref("");
const removalKey = requestKey();
function openRemoval(row: AdminProductRow, mode: "remove" | "restore") {
  removalRow.value = row; removalMode.value = mode; removalReason.value = ""; removalConfirmed.value = false; removalError.value = "";
}
async function submitRemoval() {
  if (!removalRow.value || !isAdmin.value || !removalConfirmed.value) return;
  const row = removalRow.value, body = { expectedDraftVersion: row.draftVersion, expectedPublicationVersion: row.publicationVersion, reason: removalReason.value.trim(), confirmed: true as const };
  if (!body.reason) { removalError.value = "请填写操作原因"; return; }
  removalBusy.value = true; removalError.value = "";
  try {
    if (removalMode.value === "remove") await api.removeProduct(row.productId, body, removalKey({ mode: "remove", id: row.productId, ...body }));
    else await api.restoreProduct(row.productId, body, removalKey({ mode: "restore", id: row.productId, ...body }));
    removalNotice.value = removalMode.value === "remove" ? "产品已安全移除；历史、原件和身份继续保留。" : "产品已恢复；尚未上架，需要另行确认发布。";
    removalRow.value = null; await load();
  } catch (error) { removalError.value = error instanceof Error ? error.message : "操作未完成，请重试"; }
  finally { removalBusy.value = false; }
}
const actionName = (s: string) =>
  ({
    CREATE: "新增产品",
    SAVE: "保存草稿",
    PUBLISH: "发布",
    UNPUBLISH: "下架",
    REMOVE_PRODUCT: "移除产品",
    RESTORE_PRODUCT: "恢复产品",
    CREATE_CATEGORY: "新增分类",
    UPDATE_CATEGORY: "修改分类",
    CREATE_USER: "新增账号",
    UPDATE_USER: "修改账号",
    UPDATE_SITE_BANNER: "更新首页 Banner",
    UPDATE_SITE_CONTACT: "更新联系方式",
    UPDATE_ANALYTICS_SETTINGS: "更新统计设置",
  })[s] ?? s;
onMounted(bootstrap);
</script>
<template>
  <div class="admin-shell">
    <aside class="sidebar">
      <div class="brand">
        <span class="logo">中技</span>
        <div>中技安全<small>产品平台</small></div>
      </div>
      <p class="workspace-label">内容工作台</p>
      <nav aria-label="后台导航">
        <button
          :class="{ active: section === 'products' }"
          @click="navigate('products')"
        >
          <span aria-hidden="true">▤</span>产品管理</button
        ><button
          :class="{ active: section === 'templates' }"
          @click="navigate('templates')"
        >
          <span aria-hidden="true">▦</span>分类与模板</button
        ><button
          :class="{ active: section === 'audit' }"
          @click="navigate('audit')"
        >
          <span aria-hidden="true">≡</span>操作记录
        </button>
        <button v-if="isAdmin" :class="{ active: section === 'analytics' }" @click="navigate('analytics')"><span aria-hidden="true">▥</span>数据看板</button>
        <button
          v-if="isAdmin"
          :class="{ active: section === 'feedback' }"
          @click="navigate('feedback')"
        >
          <span aria-hidden="true">✉</span>建议反馈
        </button>
        <button
          :class="{ active: section === 'settings' }"
          @click="navigate('settings')"
        >
          <span aria-hidden="true">⚙</span>系统设置
        </button>
      </nav>
      <div class="sidebar-foot">
        <span class="status-dot" />本地演示
        <details>
          <summary>使用说明</summary>
          <p>仅供本机验证。服务重启可能清空会话，请勿录入真实敏感资料。</p>
        </details>
      </div>
    </aside>
    <div class="main-shell">
      <header>
        <span
          >工作空间 <span class="slash">/</span
          >{{
            editing
              ? "内容制作"
              : section === "products"
                ? "产品管理"
                : section === "templates"
                  ? "分类与模板"
                  : section === "analytics" ? "数据看板" : section === "feedback"
                    ? "建议反馈"
                  : section === "settings"
                    ? "系统设置"
                    : "操作记录"
          }}</span
        >
        <div class="identity">
          <span class="demo-tag">模拟身份</span
          ><span>{{ displayName || "连接中" }}</span
          ><span class="avatar">制</span>
        </div>
      </header>
      <main :class="{ 'audit-page': !editing && section === 'audit' }">
        <ProductEditor
          v-if="editing"
          :key="editing.productId"
          ref="editor"
          :draft="editing"
          :categories="categories"
          :templates="templates"
          @back="
            editing = null;
            load();
          "
          @changed="load()"
        /><template v-else
          ><div class="page-title">
            <div>
              <h1>
                {{
                  section === "products"
                    ? "产品管理"
                    : section === "templates"
                      ? "分类与模板"
                      : section === "analytics" ? "数据看板" : section === "feedback"
                        ? "建议反馈"
                      : section === "settings"
                        ? "系统设置"
                        : "操作记录"
                }}
              </h1>
            </div>
            <button
              v-if="section === 'products'"
              class="primary"
              :disabled="loading || !categories.length"
              @click="wizard = true"
            >
              新增产品
            </button>
          </div>
          <div v-if="error" class="error-panel" role="alert">
            <strong>操作未完成</strong>
            <p>{{ error }}</p>
            <button @click="bootstrap">重新连接</button>
          </div>
          <section v-if="section === 'products'" class="table-card spaced">
            <p v-if="removalNotice" class="success-banner" role="status">{{ removalNotice }}</p>
            <form class="toolbar" @submit.prevent="load()">
              <label class="search-control"
                ><span aria-hidden="true">⌕</span
                ><input
                  v-model="q"
                  aria-label="搜索产品"
                  placeholder="搜索产品名称或别名"
                  maxlength="100" /></label
              ><select
                v-model="category"
                aria-label="产品分类"
                @change="load()"
              >
                <option value="">全部分类</option>
                <option v-for="c in categories" :key="c.id" :value="c.id">
                  {{ c.shortName }}
                </option></select
              ><select v-model="state" aria-label="发布状态" @change="load()">
                <option value="">全部状态</option>
                <option value="DRAFT">草稿</option>
                <option value="PUBLISHED">已发布</option>
                <option value="OFFLINE">已下架</option></select
              ><input v-model="owner" aria-label="产品资料负责人筛选" placeholder="产品资料负责人" maxlength="100" />
              <select v-if="isAdmin" v-model="removed" aria-label="移除状态" @change="load()"><option value="">正常产品</option><option value="true">已移除</option></select>
              <button class="primary" type="submit">查询</button>
              <button type="button" @click="resetFilters">重置</button>
            </form>
            <div class="table-heading">
              <strong>产品主档</strong><span>已加载 {{ rows.length }} 款</span>
            </div>
            <div
              v-if="loading && !rows.length"
              class="table-empty"
              role="status"
            >
              正在读取…
            </div>
            <div v-else-if="!rows.length" class="table-empty">
              没有符合条件的产品
            </div>
            <div v-else class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>编号</th>
                    <th>产品名称</th>
                    <th>分类</th>
                    <th>产品资料负责人</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th>操作</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="r in rows" :key="r.productId">
                    <td class="product-code">{{ r.productId }}</td>
                    <td class="product-name">
                      <small v-if="r.deletedAt">已移除 · {{ r.deletionReason }}</small>
                      {{ r.name
                      }}<small v-if="r.hasUnpublishedChanges"
                        >有未发布修改</small
                      >
                    </td>
                    <td>
                      <span class="category-tag">{{
                        label(r.categoryId)
                      }}</span>
                    </td>
                    <td class="muted">{{ r.owner || "待填写" }}</td>
                    <td>
                      <span :class="['state-tag', r.publicationState]">{{
                        stateName(r.publicationState)
                      }}</span>
                    </td>
                    <td class="muted">
                      {{
                        r.updatedAt
                          ? new Date(r.updatedAt).toLocaleString()
                          : "—"
                      }}
                    </td>
                    <td>
                      <button
                        class="text-button"
                        :disabled="loading"
                        @click="edit(r.productId)"
                      >
                        {{ r.deletedAt ? "查看留档" : "编辑" }}
                      </button>
                      <button v-if="isAdmin" class="text-button" :disabled="loading" @click="openRemoval(r, r.deletedAt ? 'restore' : 'remove')">{{ r.deletedAt ? "恢复产品" : "移除产品" }}</button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <div class="table-footer">
              <span>{{ loading ? "正在读取…" : "未发布内容仅在后台可见" }}</span
              ><button v-if="next" :disabled="loading" @click="load(true)">
                加载更多
              </button>
            </div>
          </section>
          <template v-else-if="section === 'templates'">
            <Management
              kind="categories"
              :templates="templates"
              :can-manage="isAdmin"
              @changed="bootstrap"
            />
            <div class="template-grid spaced">
              <button
                v-for="t in templates"
                :key="t.id + '-' + t.version"
                :class="[
                  'template-card',
                  { selected: shownTemplate?.id === t.id },
                ]"
                @click="selectedTemplate = t.id"
              >
                <h2>{{ t.name }}</h2>
                <p>{{ t.description }}</p>
                <span class="template-version"
                  >版本 {{ t.version }} ·
                  {{ t.enabledForCreate ? "可用于新建" : "历史模板" }}</span
                >
              </button>
            </div>
            <section v-if="shownTemplate" class="field-panel">
              <h2>{{ shownTemplate.name }} · 内容结构</h2>
              <p>字段从已绑定的模板版本读取，创建后不自动更换。</p>
              <div
                v-for="f in shownTemplate.fields"
                :key="f.key"
                class="field-row"
              >
                <strong>{{ f.label }}</strong
                ><span>{{ f.requiredOnPublish ? "发布必填" : "可选" }}</span>
                <p>{{ f.help }}</p>
              </div>
            </section>
          </template>
          <template v-else-if="section === 'settings'">
            <AnalyticsPanel v-if="isAdmin" mode="settings" />
            <SiteBannerSettings :can-manage="isAdmin" />
            <SiteContactSettings :can-manage="isAdmin" />
            <Management kind="users" :templates="templates" :can-manage="isAdmin" />
          </template>
          <AnalyticsPanel v-else-if="section === 'analytics' && isAdmin" mode="dashboard" />
          <FeedbackList v-else-if="section === 'feedback' && isAdmin" />
          <div v-else class="audit-workspace">
            <div v-if="isAdmin" class="audit-tabs" role="tablist" aria-label="记录类型">
              <button type="button" role="tab" :aria-selected="auditTab === 'operations'" @click="auditTab = 'operations'">操作记录</button>
              <button type="button" role="tab" :aria-selected="auditTab === 'browsing'" @click="auditTab = 'browsing'">浏览记录</button>
            </div>
            <AnalyticsPanel v-if="auditTab === 'browsing' && isAdmin" mode="records" />
            <section v-else class="table-card spaced audit-operations">
            <p v-if="removalNotice" class="success-banner" role="status">{{ removalNotice }}</p>
            <form class="toolbar" @submit.prevent="loadAudit()">
              <label class="field"
                >产品编号<input
                  v-model="auditProduct"
                  placeholder="例如 ZJ-028" /></label
              ><label class="field"
                >操作<select v-model="auditAction">
                  <option value="">全部操作</option>
                  <option
                    v-for="a in ['CREATE', 'SAVE', 'PUBLISH', 'UNPUBLISH', 'REMOVE_PRODUCT', 'RESTORE_PRODUCT']"
                    :key="a"
                    :value="a"
                  >
                    {{ actionName(a) }}
                  </option>
                </select></label
              ><button type="submit">筛选记录</button>
            </form>
            <div class="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>时间</th>
                    <th>产品</th>
                    <th>操作</th>
                    <th>草稿版本</th>
                    <th>发布版本</th>
                    <th>发布序号</th>
                    <th>操作者</th>
                    <th>原因</th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="e in events" :key="e.eventId">
                    <td>{{ new Date(e.createdAt).toLocaleString() }}</td>
                    <td>{{ e.targetId }}</td>
                    <td>{{ actionName(e.action) }}</td>
                    <td>{{ e.draftVersion }}</td>
                    <td>{{ e.publicationVersion }}</td>
                    <td>{{ e.releaseSequence }}</td>
                    <td>{{ e.actorName }}</td>
                    <td>{{ e.reason || "—" }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p v-if="!events.length" class="table-empty">
              当前会话尚无对应操作记录。
            </p>
            <div class="table-footer">
              <span>仅记录本地模拟会话</span
              ><button
                v-if="auditNext"
                :disabled="loading"
                @click="loadAudit(true)"
              >
                加载更多记录
              </button>
            </div>
            </section>
          </div></template
        >
      </main>
    </div>
  </div>
  <Modal v-if="removalRow" :title="removalMode === 'remove' ? '确认移除产品' : '确认恢复产品'" :busy="removalBusy" @close="removalRow = null">
    <p><strong>{{ removalRow.name }}</strong> · {{ removalRow.productId }}</p>
    <p>{{ removalMode === 'remove' ? '移除后产品从默认管理列表、销售及公开目录隐藏；已发布产品同步下架。编码、型号、UUID、历史资料和原文件全部保留。' : '恢复后回到管理列表，不会自动上架；请核对内容后另行确认发布。' }}</p>
    <label class="field">{{ removalMode === 'remove' ? '移除原因（必填）' : '恢复原因（必填）' }}<textarea v-model="removalReason" :aria-label="removalMode === 'remove' ? '移除原因（必填）' : '恢复原因（必填）'" maxlength="300" rows="3" /></label>
    <label class="check-line"><input v-model="removalConfirmed" type="checkbox" />我已确认产品及本次操作影响</label>
    <p v-if="removalError" class="error-inline" role="alert">{{ removalError }}</p>
    <template #footer><button :disabled="removalBusy" @click="removalRow = null">取消</button><button :class="removalMode === 'remove' ? 'danger' : 'primary'" :disabled="removalBusy || !removalConfirmed || !removalReason.trim()" @click="submitRemoval">{{ removalBusy ? '正在处理…' : removalMode === 'remove' ? '确认移除' : '确认恢复' }}</button></template>
  </Modal>
  <SignIn
    v-if="authNeeded"
    @signed-in="
      authNeeded = false;
      bootstrap();
    "
  />
  <ProductWizard
    v-if="wizard"
    :categories="categories"
    :templates="templates"
    @created="created"
    @cancel="wizard = false"
  />
</template>
