<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { QaRun, Site } from '~/types'

const route = useRoute()
const siteId = computed(() => String(route.params.id))

const { data: site } = await useFetch<Site>(() => `/api/sites/${siteId.value}`, {
  default: () => null as unknown as Site
})
const { data: runs, refresh, pending } = await useFetch<QaRun[]>(() => `/api/sites/${siteId.value}/runs`, {
  default: () => []
})

useIntervalFn(() => refresh(), 5000)

const columns: TableColumn<QaRun>[] = [{
  accessorKey: 'target_url',
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
  <UDashboardPanel id="site-runs">
    <template #header>
      <SiteHeader :site-id="siteId" :title="site?.hostname || 'Site'">
        <template #right>
          <UButton :to="`/app/runs/new?site=${siteId}`" icon="i-lucide-play" label="New run" />
        </template>
      </SiteHeader>
    </template>

    <template #body>
      <div class="space-y-4">
        <div class="grid gap-4 lg:grid-cols-3">
          <UCard>
            <p class="text-sm text-muted">
              Base URL
            </p>
            <p class="mt-2 truncate text-sm font-medium">
              {{ site?.base_url }}
            </p>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              Verification
            </p>
            <UBadge class="mt-2" :color="site?.verified_at ? 'success' : 'warning'" variant="subtle">
              {{ site?.verified_at ? 'Verified' : 'Pending' }}
            </UBadge>
          </UCard>
          <UCard>
            <p class="text-sm text-muted">
              GitHub
            </p>
            <p class="mt-2 truncate text-sm font-medium">
              {{ site?.github_connection && !site.github_connection.disconnected_at ? site.github_connection.full_name : 'Not connected' }}
            </p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <h2 class="text-base font-semibold">
                Runs
              </h2>
              <UButton
                :to="`/app/runs/new?site=${siteId}`"
                color="neutral"
                variant="outline"
                size="sm"
                icon="i-lucide-play"
                label="New run"
              />
            </div>
          </template>

          <UTable
            :data="runs"
            :columns="columns"
            :loading="pending"
            empty="No runs for this site yet."
          >
            <template #target_url-cell="{ row }">
              <span class="text-sm">{{ row.original.target_url }}</span>
            </template>

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
                :to="`/app/runs/${row.original.id}`"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-arrow-right"
                aria-label="Open run"
              />
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
