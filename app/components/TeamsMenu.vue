<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <UButton
    to="/"
    color="neutral"
    variant="ghost"
    block
    :square="collapsed"
    class="justify-start data-[state=open]:bg-elevated"
    :class="[!collapsed && 'py-2']"
    icon="i-lucide-ghost"
    :label="collapsed ? undefined : 'User Zero'"
  />
</template>
