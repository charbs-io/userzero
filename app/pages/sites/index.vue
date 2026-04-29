<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Site } from '~/types'

const route = useRoute()
const toast = useToast()
const { data: sites, pending } = await useFetch<Site[]>('/api/sites', {
  default: () => []
})

onMounted(() => {
  if (route.query.github_error) {
    toast.add({
      title: 'GitHub connection failed',
      description: String(route.query.github_error),
      color: 'error'
    })
  }
})

const columns: TableColumn<Site>[] = [{
  accessorKey: 'hostname',
  header: 'Site'
}, {
  accessorKey: 'verified_at',
  header: 'Verification'
}, {
  accessorKey: 'github_connection',
  header: 'GitHub'
}, {
  accessorKey: 'created_at',
  header: 'Created'
}, {
  id: 'actions',
  header: ''
}]
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #right>
          <UButton to="/sites/new" icon="i-lucide-plus" label="Add site" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <UTable
          :data="sites"
          :columns="columns"
          :loading="pending"
          empty="No sites added yet."
        >
          <template #hostname-cell="{ row }">
            <div class="min-w-0">
              <p class="truncate text-sm font-medium">
                {{ row.original.hostname }}
              </p>
              <p class="truncate text-xs text-muted">
                {{ row.original.base_url }}
              </p>
            </div>
          </template>

          <template #verified_at-cell="{ row }">
            <UBadge :color="row.original.verified_at ? 'success' : 'warning'" variant="subtle">
              {{ row.original.verified_at ? 'Verified' : 'Pending' }}
            </UBadge>
          </template>

          <template #github_connection-cell="{ row }">
            <span class="text-sm text-muted">
              {{ row.original.github_connection && !row.original.github_connection.disconnected_at ? row.original.github_connection.full_name : 'Not connected' }}
            </span>
          </template>

          <template #created_at-cell="{ row }">
            <span class="text-sm text-muted">{{ new Date(row.original.created_at).toLocaleString() }}</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              :to="`/sites/${row.original.id}`"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-arrow-right"
              aria-label="Open site"
            />
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
