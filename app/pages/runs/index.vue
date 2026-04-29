<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { QaRun } from '~/types'

const { data: runs, refresh, pending } = await useFetch<QaRun[]>('/api/runs', {
  default: () => []
})

useIntervalFn(() => refresh(), 5000)

const columns: TableColumn<QaRun>[] = [{
  accessorKey: 'target_hostname',
  header: 'Target'
}, {
  accessorKey: 'status',
  header: 'Status'
}, {
  accessorKey: 'issue_count',
  header: 'Issues'
}, {
  accessorKey: 'created_at',
  header: 'Created'
}, {
  id: 'actions',
  header: ''
}]
</script>

<template>
  <UDashboardPanel id="runs">
    <template #header>
      <UDashboardNavbar title="Runs">
        <template #right>
          <UButton to="/runs/new" icon="i-lucide-play" label="New run" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <UCard>
        <UTable
          :data="runs"
          :columns="columns"
          :loading="pending"
          empty="No QA runs yet."
        >
          <template #status-cell="{ row }">
            <UBadge
              :color="row.original.status === 'failed' ? 'error' : row.original.status === 'completed' ? 'success' : row.original.status === 'blocked' ? 'warning' : 'info'"
              variant="subtle"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #created_at-cell="{ row }">
            <span class="text-sm text-muted">{{ new Date(row.original.created_at).toLocaleString() }}</span>
          </template>

          <template #actions-cell="{ row }">
            <UButton
              :to="`/runs/${row.original.id}`"
              color="neutral"
              variant="ghost"
              size="sm"
              icon="i-lucide-arrow-right"
              aria-label="Open run"
            />
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
