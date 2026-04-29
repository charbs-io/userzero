<script setup lang="ts">
import type { SelectItem, TableColumn } from '@nuxt/ui'
import type { GithubPullRequest, Site } from '~/types'

const route = useRoute()
const toast = useToast()
const siteId = computed(() => String(route.params.id))
const state = ref<'open' | 'closed' | 'all'>('open')
const selectedPull = ref<GithubPullRequest | null>(null)
const question = ref('')
const answer = ref('')
const asking = ref(false)

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

const { data: site } = await useFetch<Site>(() => `/api/sites/${siteId.value}`, {
  default: () => null as unknown as Site
})
const { data: pulls, refresh, pending } = await useFetch<GithubPullRequest[]>(() => `/api/sites/${siteId.value}/github/pulls`, {
  query: computed(() => ({ state: state.value })),
  default: () => []
})

const activeConnection = computed(() => {
  const connection = site.value?.github_connection
  return connection && !connection.disconnected_at ? connection : null
})
const indexReady = computed(() => activeConnection.value?.repository_index_status === 'ready')

const columns: TableColumn<GithubPullRequest>[] = [{
  accessorKey: 'number',
  header: '#'
}, {
  accessorKey: 'title',
  header: 'Pull request'
}, {
  accessorKey: 'state',
  header: 'State'
}, {
  accessorKey: 'updated_at',
  header: 'Updated'
}, {
  id: 'actions',
  header: ''
}]

watch(state, async () => {
  await refresh()
})

function choosePull(pull: GithubPullRequest) {
  selectedPull.value = pull
  answer.value = ''
  question.value = ''
}

async function askQuestion() {
  if (!selectedPull.value || !question.value.trim()) {
    return
  }

  asking.value = true
  answer.value = ''

  try {
    const response = await $fetch<{ answer: string }>(`/api/sites/${siteId.value}/github/pulls/${selectedPull.value.number}/question`, {
      method: 'POST',
      body: {
        question: question.value
      }
    })
    answer.value = response.answer
  } catch (error: unknown) {
    toast.add({ title: 'AI question failed', description: getErrorMessage(error), color: 'error' })
  } finally {
    asking.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="site-pulls">
    <template #header>
      <SiteHeader :site-id="siteId" :title="site?.hostname || 'Pull requests'" />
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[1fr_420px]">
        <UCard>
          <template #header>
            <div class="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">
                  Pull requests
                </h2>
                <p class="text-sm text-muted">
                  {{ activeConnection ? activeConnection.full_name : 'No repository connected' }}
                </p>
              </div>
              <USelect v-model="state" :items="stateItems" class="w-36" />
            </div>
          </template>

          <UAlert
            v-if="!activeConnection"
            color="warning"
            variant="subtle"
            icon="i-simple-icons-github"
            title="Connect GitHub first"
            description="A site needs an active repository connection before pull requests can be listed."
          />

          <UTable
            v-else
            :data="pulls"
            :columns="columns"
            :loading="pending"
            empty="No pull requests match this filter."
          >
            <template #number-cell="{ row }">
              <span class="text-sm text-muted">#{{ row.original.number }}</span>
            </template>

            <template #title-cell="{ row }">
              <div class="min-w-0">
                <p class="truncate text-sm font-medium">
                  {{ row.original.title }}
                </p>
                <p class="truncate text-xs text-muted">
                  {{ row.original.head_ref }} -> {{ row.original.base_ref }}
                </p>
              </div>
            </template>

            <template #state-cell="{ row }">
              <div class="flex items-center gap-2">
                <UBadge :color="row.original.state === 'open' ? 'success' : 'neutral'" variant="subtle">
                  {{ row.original.merged_at ? 'merged' : row.original.state }}
                </UBadge>
                <UBadge v-if="row.original.draft" color="warning" variant="subtle">
                  draft
                </UBadge>
              </div>
            </template>

            <template #updated_at-cell="{ row }">
              <span class="text-sm text-muted">{{ new Date(row.original.updated_at).toLocaleString() }}</span>
            </template>

            <template #actions-cell="{ row }">
              <div class="flex justify-end gap-1">
                <UButton
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-message-circle-question"
                  aria-label="Ask AI about pull request"
                  @click="choosePull(row.original)"
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

        <div class="space-y-4">
          <UAlert
            v-if="activeConnection && !indexReady"
            color="warning"
            variant="subtle"
            icon="i-lucide-database-zap"
            title="Repository index is not ready"
            :description="`Current status: ${activeConnection.repository_index_status}. AI Q&A needs a ready index.`"
          />

          <UCard>
            <template #header>
              <div>
                <h2 class="text-base font-semibold">
                  Ask AI
                </h2>
                <p class="text-sm text-muted">
                  {{ selectedPull ? `PR #${selectedPull.number}: ${selectedPull.title}` : 'Select a pull request to ask a question.' }}
                </p>
              </div>
            </template>

            <form class="space-y-3" @submit.prevent="askQuestion">
              <UTextarea
                v-model="question"
                autoresize
                placeholder="What changed, what risks should I review, or where should I test?"
                :disabled="!selectedPull || !indexReady"
              />
              <div class="flex justify-end">
                <UButton
                  type="submit"
                  icon="i-lucide-send"
                  label="Ask"
                  :loading="asking"
                  :disabled="!selectedPull || !question.trim() || !indexReady"
                />
              </div>
            </form>

            <pre v-if="answer" class="mt-4 max-h-[520px] overflow-auto whitespace-pre-wrap text-sm">{{ answer }}</pre>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
