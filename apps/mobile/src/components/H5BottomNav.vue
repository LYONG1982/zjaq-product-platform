<script setup lang="ts">
import { onMounted } from "vue";
import type { CatalogKind } from "../navigation";
defineProps<{ selected: CatalogKind }>();
const tabs = [
  { kind: "home", label: "首页", icon: "70e58.svg", active: "f9fc2.svg" },
  { kind: "products", label: "产品", icon: "6c53b.svg", active: "39878.svg" },
  { kind: "materials", label: "资料", icon: "635af.svg", active: "784af.svg" },
];
onMounted(() => uni.hideTabBar({ animation: false }));
function go(kind: string) { uni.switchTab({ url: '/pages/' + kind + '/index' }); }
</script>
<template>
  <view class="v2-bottom-nav" role="navigation" aria-label="主导航">
    <button role="button" tabindex="0" v-for="tab in tabs" :key="tab.kind" :class="{ active: selected === tab.kind }" :aria-current="selected === tab.kind ? 'page' : undefined" @click="go(tab.kind)">
      <image :src="'/static/h5/figma/' + (selected === tab.kind ? tab.active : tab.icon)" mode="aspectFit" aria-hidden="true" />
      <text>{{ tab.label }}</text>
    </button>
  </view>
</template>
