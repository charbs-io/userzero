<script setup lang="ts">
import type { SelectItem, TableColumn } from '@nuxt/ui'
import type { AggregateGithubPullRequest, GithubPullsResponse, Site } from '~/types'

type PullStateFilter = 'open' | 'closed' | 'all'
type DraftFilter = 'all' | 'draft' | 'ready'

const state = ref<PullStateFilter>('open')
const siteId = ref('all')
const draft = ref<DraftFilter>('all')
const search = ref('')

const stateItems: SelectItem[] = [{
  label: 'Open',
  value: 'open'
}, {
  label: 'Closed',
  value: 'closed'
}, {
  label: 'All',
  value: 'all'
}]

const draftItems: SelectItem[] = [{
  label: 'All PRs',
  value: 'all'
}, {
  label: 'Draft',
  value: 'draft'
}, {
  label: 'Ready',
  value: 'ready'
}]

const { data: sites } = await useFetch<Site[]>('/api/sites', {
  default: () => []
})

const siteItems = computed<SelectItem[]>(() => [{
  label: 'All sites',
  value: 'all'
}, ...sites.value
  .filter(site => site.github_connection && !site.github_connection.disconnected_at)
  .map(site => ({
    label: site.hostname,
    value: site.id
  }))])

const pullQuery = computed(() => ({
  state: state.value,
  siteId: siteId.value === 'all' ? undefined : siteId.value
}))

const {
  data: response,
  pending,
  refresh,
  error
} = await useFetch<GithubPullsResponse>('/api/github/pulls', {
  query: pullQuery,
  default: () => ({
    pulls: [],
    connection_count: 0,
    failures: []
  })
})

const pulls = computed(() => response.value?.pulls || [])
const failures = computed(() => response.value?.failures || [])
const connectedCount = computed(() => response.value?.connection_count || 0)
const draftCount = computed(() => pulls.value.filter(pull => pull.draft).length)
const mergedCount = computed(() => pulls.value.filter(pull => pull.merged_at).length)
const openCount = computed(() => pulls.value.filter(pull => pull.state === 'open').length)

const filteredPulls = computed(() => {
  const query = search.value.trim().toLowerCase()

  return pulls.value.filter((pull) => {
    if (draft.value === 'draft' && !pull.draft) {
      return false
    }

    if (draft.value === 'ready' && pull.draft) {
      return false
    }

    if (!query) {
      return true
    }

    const searchable = [
      pull.title,
      String(pull.number),
      pull.user_login,
      pull.head_ref,
      pull.base_ref,
      pull.site_hostname,
      pull.repository_full_name
    ].join(' ').toLowerCase()

    return searchable.includes(query)
  })
})

const hasFilters = computed(() => Boolean(search.value.trim())
  || draft.value !== 'all'
  || state.value !== 'open'
  || siteId.value !== 'all')
const failureDescription = computed(() => failures.value
  .slice(0, 3)
  .map(failure => `${failure.site_hostname}: ${failure.message}`)
  .join('; '))

const columns: TableColumn<AggregateGithubPullRequest>[] = [{
  accessorKey: 'site_hostname',
  header: 'Site'
}, {
  accessorKey: 'title',
  header: 'Pull request'
}, {
  accessorKey: 'state',
  header: 'State'
}, {
  accessorKey: 'user_login',
  header: 'Author'
}, {
  accessorKey: 'updated_at',
  header: 'Updated'
}, {
  id: 'actions',
  header: ''
}]

function clearFilters() {
  state.value = 'open'
  siteId.value = 'all'
  draft.value = 'all'
  search.value = ''
}

async function refreshPulls() {
  await refresh()
}

function stateColor(pull: AggregateGithubPullRequest) {
  if (pull.merged_at) {
    return 'primary'
  }

  return pull.state === 'open' ? 'success' : 'neutral'
}

function stateLabel(pull: AggregateGithubPullRequest) {
  return pull.merged_at ? 'merged' : pull.state
}

function formatDate(value: string) {
  return new Date(value).toLocaleString()
}

function getErrorMessage(errorValue: unknown) {
  const fetchError = errorValue as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="pulls">
    <template #header>
      <UDashboardNavbar title="PRs">
        <template #right>
          <UButton
            to="/app/sites"
            icon="i-lucide-panels-top-left"
            label="Sites"
            color="neutral"
            variant="outline"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-4">
        <UAlert
          v-if="error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Pull requests could not be loaded"
          :description="getErrorMessage(error)"
        />

        <UAlert
          v-if="!pending && !connectedCount"
          color="warning"
          variant="subtle"
          icon="i-simple-icons-github"
          title="No connected repositories"
          description="Connect GitHub on a site before PRs appear here."
        />

        <UAlert
          v-if="failures.length"
          color="warning"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Some repositories could not be loaded"
          :description="failureDescription"
        />

        <div class="grid gap-4 md:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">
              Visible PRs
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ filteredPulls.length }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              Connected repos
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ connectedCount }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              Open
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ openCount }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              Draft / merged
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ draftCount }} / {{ mergedCount }}
            </p>
          </UCard>
        </div>

        <UCard>
          <template #header>
            <div class="grid gap-3 lg:grid-cols-[160px_220px_160px_1fr_auto_auto] lg:items-end">
              <UFormField label="State" name="state">
                <USelect v-model="state" :items="stateItems" class="w-full" />
              </UFormField>

              <UFormField label="Site" name="site">
                <USelect v-model="siteId" :items="siteItems" class="w-full" />
              </UFormField>

              <UFormField label="Draft" name="draft">
                <USelect v-model="draft" :items="draftItems" class="w-full" />
              </UFormField>

              <UFormField label="Search" name="search">
                <UInput
                  v-model="search"
                  icon="i-lucide-search"
                  placeholder="Title, author, branch, repo"
                  class="w-full"
                />
              </UFormField>

              <UButton
                color="neutral"
                variant="outline"
                icon="i-lucide-refresh-cw"
                label="Refresh"
                :loading="pending"
                @click="refreshPulls"
              />

              <UButton
                color="neutral"
                variant="ghost"
                icon="i-lucide-x"
                label="Clear"
                :disabled="!hasFilters"
                @click="clearFilters"
              />
            </div>
          </template>

          <UTable
            :data="filteredPulls"
            :columns="columns"
            :loading="pending"
            empty="No pull requests match these filters."
          >
            <template #site_hostname-cell="{ row }">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ row.original.site_hostname }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ row.original.repository_full_name }}
                </p>
              </div>
            </template>

            <template #title-cell="{ row }">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  #{{ row.original.number }} {{ row.original.title }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ row.original.head_ref }} -> {{ row.original.base_ref }}
                </p>
              </div>
            </template>

            <template #state-cell="{ row }">
              <div class="flex items-center gap-2">
                <UBadge :color="stateColor(row.original)" variant="subtle">
                  {{ stateLabel(row.original) }}
                </UBadge>
                <UBadge v-if="row.original.draft" color="warning" variant="subtle">
                  draft
                </UBadge>
              </div>
            </template>

            <template #user_login-cell="{ row }">
              <span class="text-sm text-muted">@{{ row.original.user_login }}</span>
            </template>

            <template #updated_at-cell="{ row }">
              <span class="text-sm text-muted">{{ formatDate(row.original.updated_at) }}</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton
                  :to="`/app/sites/${row.original.site_id}/pulls`"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-list-filter"
                  aria-label="Open site pull requests"
                />
                <UButton
                  :to="row.original.html_url"
                  target="_blank"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-external-link"
                  aria-label="Open pull request"
                />
              </div>
            </template>
          </UTable>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
