<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { Site } from '~/types'

const route = useRoute()
const toast = useToast()
const deletingSiteId = ref<string | null>(null)
const { data: sites, pending, refresh } = await useFetch<Site[]>('/api/sites', {
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

async function deleteSite(site: Site) {
  if (!window.confirm(`Delete ${site.hostname}? QA run history will be kept, but it will no longer be attached to this site.`)) {
    return
  }

  deletingSiteId.value = site.id

  try {
    await $fetch(`/api/sites/${site.id}`, { method: 'DELETE' })
    await refresh()
    toast.add({ title: 'Site deleted', description: `${site.hostname} was removed.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not delete site', description: getErrorMessage(error), color: 'error' })
  } finally {
    deletingSiteId.value = null
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="sites">
    <template #header>
      <UDashboardNavbar title="Sites">
        <template #right>
          <UButton to="/app/sites/new" icon="i-lucide-plus" label="Add site" />
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
            <div class="flex justify-end gap-1">
              <UButton
                color="error"
                variant="ghost"
                size="sm"
                icon="i-lucide-trash-2"
                aria-label="Delete site"
                :loading="deletingSiteId === row.original.id"
                :disabled="Boolean(deletingSiteId)"
                @click="deleteSite(row.original)"
              />
              <UButton
                :to="`/app/sites/${row.original.id}`"
                color="neutral"
                variant="ghost"
                size="sm"
                icon="i-lucide-arrow-right"
                aria-label="Open site"
              />
            </div>
          </template>
        </UTable>
      </UCard>
    </template>
  </UDashboardPanel>
</template>
