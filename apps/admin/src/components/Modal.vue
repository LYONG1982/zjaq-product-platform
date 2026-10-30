<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount, useId } from "vue";
const props = defineProps<{ title: string; wide?: boolean; busy?: boolean; scrollBody?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const el = ref<HTMLDialogElement>();
const id = useId();
let previous: HTMLElement | null = null;
onMounted(() => {
  previous = document.activeElement as HTMLElement;
  el.value?.showModal();
});
onBeforeUnmount(() => {
  el.value?.close();
  previous?.focus();
});
function close() {
  if (!props.busy) emit("close");
}
</script>
<template>
  <Teleport to="body"
    ><dialog
      ref="el"
      :aria-labelledby="id"
      :class="['modal', { wide, 'scroll-body': scrollBody }]"
      @cancel.prevent="close"
    >
      <div class="modal-heading">
        <h2 :id="id">{{ title }}</h2>
        <button :aria-label="'关闭' + title" :disabled="busy" @click="close">
          关闭
        </button>
      </div>
      <div v-if="scrollBody" class="modal-body"><slot /></div>
      <slot v-else />
      <div class="modal-footer"><slot name="footer" /></div></dialog
  ></Teleport>
</template>
<style scoped>
.modal.scroll-body[open] { display: flex; flex-direction: column; padding: 0; max-height: 90vh; max-height: 90dvh; }
.scroll-body .modal-heading { flex: none; margin: 0; padding: 20px 24px; }
.scroll-body .modal-body { min-height: 0; overflow: auto; padding: 20px 24px; }
.scroll-body .modal-footer { flex: none; margin: 0; padding: 16px 24px; background: #fff; }
@media (max-width: 600px) { .scroll-body .modal-heading, .scroll-body .modal-body, .scroll-body .modal-footer { padding-left: 16px; padding-right: 16px; } }
</style>
