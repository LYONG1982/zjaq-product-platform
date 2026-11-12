<script setup lang="ts">
import { ref } from "vue";
import Modal from "./Modal.vue";
import { signIn } from "../api";
defineProps<{ loggedOut?: boolean }>();
const emit = defineEmits<{ signedIn: [] }>(),
  username = ref(""),
  password = ref(""),
  busy = ref(false),
  error = ref("");
async function submit() {
  busy.value = true;
  error.value = "";
  try {
    await signIn(username.value, password.value);
    emit("signedIn");
  } catch (e) {
    error.value = e instanceof Error ? e.message : "登录失败";
  } finally {
    password.value = "";
    busy.value = false;
  }
}
</script>
<template>
  <Modal :title="loggedOut ? '登录后台' : '重新登录'" @close="() => {}"
    ><p>
      {{
        loggedOut
          ? "已退出当前浏览器会话，请重新登录。"
          : "登录已失效。未提交的正文仍保留在当前页面。"
      }}
    </p>
    <form id="signin" class="management-form" @submit.prevent="submit">
      <label class="field"
        >用户名<input
          v-model="username"
          autocomplete="username"
          required
          maxlength="48" /></label
      ><label class="field"
        >密码<input
          v-model="password"
          type="password"
          autocomplete="current-password"
          required /></label>
      <p v-if="error" class="error-panel" role="alert">{{ error }}</p>
    </form>
    <template #footer
      ><button form="signin" type="submit" class="primary" :disabled="busy">
        {{ busy ? "正在验证…" : "登录并继续" }}
      </button></template
    ></Modal
  >
</template>
