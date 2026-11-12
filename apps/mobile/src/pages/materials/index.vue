<script setup lang="ts">
import { ref } from "vue";
import { onShow, onPageScroll, onHide } from "@dcloudio/uni-app";
import CatalogView from "../../components/CatalogView.vue";
import { useMiniProgramShare } from "../../share";
const view = ref<InstanceType<typeof CatalogView> | null>(null);
useMiniProgramShare(() => ({ title: "资料中心｜中技安全", path: "/pages/materials/index" }));
onShow(() => view.value?.reload());
onHide(() => view.value?.pauseScroll());
onPageScroll((event) => view.value?.rememberScroll(event.scrollTop));
</script>
<template><CatalogView ref="view" kind="materials" /></template>
