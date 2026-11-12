<script setup lang="ts">
import { ref } from "vue";
import { onShow, onPageScroll, onHide } from "@dcloudio/uni-app";
import CatalogView from "../../components/CatalogView.vue";
import { useMiniProgramShare } from "../../share";
const view = ref<InstanceType<typeof CatalogView> | null>(null);
useMiniProgramShare(() => ({ title: "中技安全产品资料库", path: "/pages/home/index" }));
onShow(() => view.value?.reload());
onHide(() => { view.value?.pauseScroll(); view.value?.pauseBanner(); });
onPageScroll((event) => view.value?.rememberScroll(event.scrollTop));
</script>
<template><CatalogView ref="view" kind="home" /></template>
