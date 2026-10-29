<script setup lang="ts">
import { ref, computed } from "vue";
import type { AdminDraft, Template } from "@zj/contracts";
import AssetViewer from "./AssetViewer.vue";
import Modal from "./Modal.vue";
const props = defineProps<{
  draft: AdminDraft;
  template?: Template;
  publishing?: boolean;
}>();
const emit = defineEmits<{ back: []; publish: [] }>();
const mobile = ref(false),
  material = ref<number | null>(null),
  media = ref<number | null>(null);
const c = computed(() => props.draft.content),
  selected = computed(() =>
    material.value === null ? null : c.value.materials[material.value],
  );
</script>
<template>
  <section class="preview-shell">
    <div class="preview-actions">
      <strong>草稿预览，未对外发布 · v{{ draft.draftVersion }}</strong>
      <div>
        <button :aria-pressed="!mobile" @click="mobile = false">PC 宽度</button
        ><button :aria-pressed="mobile" @click="mobile = true">移动宽度</button
        ><button @click="emit('back')">返回编辑</button
        ><button
          class="primary"
          :disabled="publishing"
          @click="emit('publish')"
        >
          发布此草稿
        </button>
      </div>
    </div>
    <article :class="['product-preview', { mobile }]">
      <p class="eyebrow">{{ draft.productId }} · {{ template?.name }}</p>
      <h1>{{ c.name }}</h1>
      <p v-if="c.tagline" class="preview-tagline">{{ c.tagline }}</p>
      <div v-if="!c.media.length" class="neutral-cover">暂无产品图片</div>
      <div v-else class="media-buttons">
        <button v-for="(m, i) in c.media" :key="m.mediaId" @click="media = i">
          查看素材：{{ m.alt }}
        </button>
      </div>
      <section v-if="c.summary">
        <h2>产品简介</h2>
        <p>{{ c.summary }}</p>
      </section>
      <section v-if="c.audiences">
        <h2>适用对象</h2>
        <p>{{ c.audiences }}</p>
      </section>
      <section
        v-for="group in [
          { key: 'problemValues' as const, title: '问题与价值' },
          { key: 'features' as const, title: '核心能力' },
          { key: 'scenarios' as const, title: '应用场景' },
        ].filter((g) => c[g.key].length)"
        :key="group.key"
      >
        <h2>{{ group.title }}</h2>
        <div v-for="item in c[group.key]" :key="item.id" class="preview-item">
          <h3>{{ item.title }}</h3>
          <p>{{ item.text }}</p>
        </div>
      </section>
      <section v-if="Object.values(c.technical).some((v) => v.trim())">
        <h2>参数与条件</h2>
        <dl>
          <template
            v-for="f in template?.fields.filter((f) =>
              c.technical[f.key]?.trim(),
            )"
            :key="f.key"
            ><dt>{{ f.label }}</dt>
            <dd>{{ c.technical[f.key] }}</dd></template
          >
        </dl>
      </section>
      <section v-if="c.boundaries">
        <h2>能力边界</h2>
        <p>{{ c.boundaries }}</p>
      </section>
      <section>
        <h2>当前草稿资料</h2>
        <p v-if="!c.materials.length">尚未添加可用预览资料。</p>
        <div
          v-for="(m, i) in c.materials"
          :key="m.materialId"
          class="material-line"
        >
          <div>
            <strong>{{ m.name }}</strong>
            <p>
              {{ m.versionLabel }} ·
              {{ m.preview.kind === "pdf" ? "PDF" : m.preview.kind === "video" ? "视频" : "有序图片" }} ·
              <template v-if="m.preview.kind !== 'video'">{{ m.preview.kind === "pdf" ? m.preview.pageCount : m.preview.pages.length }} 页</template>
            </p>
          </div>
          <button @click="material = i">预览</button>
        </div>
      </section>
    </article>
  </section>
  <Modal v-if="selected" :title="selected.name" wide @close="material = null"
    ><AssetViewer
      :product-id="draft.productId"
      :kind="selected.preview.kind"
      :asset-ids="
        selected.preview.kind !== 'images'
          ? [selected.preview.assetId]
          : selected.preview.pages.map((p) => p.assetId)
      "
      :alts="
        selected.preview.kind === 'images'
          ? selected.preview.pages.map((p) => p.alt)
          : undefined
      " /></Modal
  ><Modal v-if="media !== null" title="草稿素材预览" wide @close="media = null"
    ><AssetViewer
      :product-id="draft.productId"
      kind="images"
      :asset-ids="[c.media[media].assetId]"
      :alts="[c.media[media].alt]"
  /></Modal>
</template>
