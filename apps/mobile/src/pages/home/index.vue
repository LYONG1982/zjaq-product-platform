<script setup lang="ts">
import { ref } from "vue";
import { onShow, onPageScroll, onHide } from "@dcloudio/uni-app";
import CatalogView from "../../components/CatalogView.vue";
const view = ref<InstanceType<typeof CatalogView> | null>(null);
onShow(() => view.value?.reload());
onHide(() => { view.value?.pauseScroll(); view.value?.pauseBanner(); });
onPageScroll((event) => view.value?.rememberScroll(event.scrollTop));
</script>
<template><CatalogView ref="view" kind="home" /></template>
