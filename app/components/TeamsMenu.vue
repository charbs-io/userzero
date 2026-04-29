<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <NuxtLink
    to="/"
    class="flex min-h-9 items-center rounded-lg px-2 text-sm hover:bg-elevated"
    :class="collapsed ? 'justify-center' : 'justify-start py-2'"
    aria-label="Product Warden home"
  >
    <AppLogo :show-text="!collapsed" :compact="collapsed" />
  </NuxtLink>
</template>
