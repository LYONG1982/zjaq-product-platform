<script setup lang="ts">
function back() {
  uni.switchTab({ url: "/pages/products/index" });
}
</script>
<template>
  <view class="empty"
    ><text>内容暂不可用</text><button @click="back">返回产品中心</button></view
  >
</template>
<style scoped>
.empty {
  padding: 80px 24px;
  text-align: center;
}
.empty button {
  margin-top: 24px;
  font-size: 14px;
}
</style>
