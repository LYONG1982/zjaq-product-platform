<script setup lang="ts">
import { onMounted, ref, onBeforeUnmount, useId } from "vue";
const props = defineProps<{ title: string; wide?: boolean; busy?: boolean }>();
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
      :class="['modal', { wide }]"
      @cancel.prevent="close"
    >
      <div class="modal-heading">
        <h2 :id="id">{{ title }}</h2>
        <button :aria-label="'关闭' + title" :disabled="busy" @click="close">
          关闭
        </button>
      </div>
      <slot />
      <div class="modal-footer"><slot name="footer" /></div></dialog
  ></Teleport>
</template>
