<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { QaRun } from '~/types'

const toast = useToast()
const stoppingRunId = ref<string | null>(null)

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

function statusColor(status: QaRun['status']) {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'blocked':
      return 'warning'
    case 'cancelled':
      return 'neutral'
    default:
      return 'info'
  }
}

function canStopRun(run: QaRun) {
  return ['queued', 'running'].includes(run.status)
}

async function stopRun(run: QaRun) {
  if (!canStopRun(run)) {
    return
  }

  stoppingRunId.value = run.id

  try {
    await $fetch(`/api/runs/${run.id}/stop`, {
      method: 'POST'
    })
    await refresh()
    toast.add({ title: 'Run stopped', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Run could not be stopped', description: getErrorMessage(error), color: 'error' })
  } finally {
    stoppingRunId.value = null
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
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
              :color="statusColor(row.original.status)"
              variant="subtle"
            >
              {{ row.original.status }}
            </UBadge>
          </template>

          <template #created_at-cell="{ row }">
            <span class="text-sm text-muted">{{ new Date(row.original.created_at).toLocaleString() }}</span>
          </template>

          <template #actions-cell="{ row }">
            <div class="flex justify-end gap-1">
              <UButton
                v-if="canStopRun(row.original)"
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-square"
                aria-label="Stop run"
                :loading="stoppingRunId === row.original.id"
                @click="stopRun(row.original)"
              />
              <UButton
                :to="`/runs/${row.original.id}`"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-arrow-right"
                aria-label="Open run"
              />
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
