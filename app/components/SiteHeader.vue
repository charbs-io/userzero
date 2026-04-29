<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const props = defineProps<{
  siteId: string
  title: string
}>()

const route = useRoute()

const items = computed<NavigationMenuItem[][]>(() => [[{
  label: 'Runs',
  icon: 'i-lucide-list-checks',
  to: `/sites/${props.siteId}`,
  active: route.path === `/sites/${props.siteId}`
}, {
  label: 'Site settings',
  icon: 'i-lucide-settings',
  to: `/sites/${props.siteId}/settings`,
  active: route.path === `/sites/${props.siteId}/settings`
}, {
  label: 'GitHub settings',
  icon: 'i-simple-icons-github',
  to: `/sites/${props.siteId}/github`,
  active: route.path === `/sites/${props.siteId}/github`
}]])
</script>

<template>
  <UDashboardNavbar :title="title">
    <template #right>
      <slot name="right" />
    </template>
  </UDashboardNavbar>

  <UDashboardToolbar>
    <UNavigationMenu :items="items" highlight class="flex-1" />
  </UDashboardToolbar>
</template>
