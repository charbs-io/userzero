<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

useDashboard()

const open = ref(false)

const links = [[{
  label: 'Overview',
  icon: 'i-lucide-layout-dashboard',
  to: '/',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Sites',
  icon: 'i-lucide-panels-top-left',
  to: '/sites',
  onSelect: () => {
    open.value = false
  }
}, {
  label: 'Runs',
  icon: 'i-lucide-list-checks',
  to: '/runs',
  onSelect: () => {
    open.value = false
  }
}], [{
  label: 'Setup',
  icon: 'i-lucide-book-open-check',
  to: '/setup'
}]] satisfies NavigationMenuItem[][]

const groups = computed(() => [{
  id: 'links',
  label: 'Navigate',
  items: links.flat()
}, {
  id: 'actions',
  label: 'Actions',
  items: [{
    id: 'new-run',
    label: 'Start a QA run',
    icon: 'i-lucide-play',
    to: '/runs/new'
  }, {
    id: 'add-site',
    label: 'Add a site',
    icon: 'i-lucide-shield-check',
    to: '/sites/new'
  }]
}])
</script>

<template>
  <UDashboardGroup unit="rem">
    <UDashboardSidebar
      id="default"
      v-model:open="open"
      collapsible
      resizable
      class="bg-elevated/25"
      :ui="{ footer: 'lg:border-t lg:border-default' }"
    >
      <template #header="{ collapsed }">
        <TeamsMenu :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UDashboardSearchButton :collapsed="collapsed" class="bg-transparent ring-default" />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[0]"
          orientation="vertical"
          tooltip
          popover
        />

        <UNavigationMenu
          :collapsed="collapsed"
          :items="links[1]"
          orientation="vertical"
          tooltip
          class="mt-auto"
        />
      </template>

      <template #footer="{ collapsed }">
        <UserMenu :collapsed="collapsed" />
      </template>
    </UDashboardSidebar>

    <UDashboardSearch :groups="groups" />

    <slot />
  </UDashboardGroup>
</template>
