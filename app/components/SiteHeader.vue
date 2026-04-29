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
  to: `/app/sites/${props.siteId}`,
  active: route.path === `/app/sites/${props.siteId}`
}, {
  label: 'Site settings',
  icon: 'i-lucide-settings',
  to: `/app/sites/${props.siteId}/settings`,
  active: route.path === `/app/sites/${props.siteId}/settings`
}, {
  label: 'GitHub settings',
  icon: 'i-simple-icons-github',
  to: `/app/sites/${props.siteId}/github`,
  active: route.path === `/app/sites/${props.siteId}/github`
}, {
  label: 'Pull requests',
  icon: 'i-lucide-git-pull-request',
  to: `/app/sites/${props.siteId}/pulls`,
  active: route.path === `/app/sites/${props.siteId}/pulls`
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
