<script setup lang="ts">
import type { SelectItem } from '@nuxt/ui'
import type { Site } from '~/types'

type GithubRepositoryOption = {
  id: number
  full_name: string
  owner: string
  html_url: string
  default_branch: string
  permissions: Record<string, boolean>
}

const route = useRoute()
const router = useRouter()
const toast = useToast()
const siteId = computed(() => String(route.params.id))
const installationId = computed(() => Number(route.query.installation_id || 0))

const { data: site, refresh } = await useFetch<Site>(() => `/api/sites/${siteId.value}`, {
  default: () => null as unknown as Site
})

const repositories = ref<GithubRepositoryOption[]>([])
const repositoriesPending = ref(false)
const connecting = ref(false)
const saving = ref(false)
const disconnecting = ref(false)
const selectedRepositoryId = ref<number | null>(null)
const settings = reactive({
  useRepositoryContext: true,
  allowIssueCreation: false,
  allowPrCreation: false
})

const activeConnection = computed(() => {
  const connection = site.value?.github_connection
  return connection && !connection.disconnected_at ? connection : null
})
const repositoryItems = computed<SelectItem[]>(() => repositories.value.map(repository => ({
  label: repository.full_name,
  value: repository.id
})))

watchEffect(() => {
  if (!activeConnection.value) {
    return
  }

  selectedRepositoryId.value = activeConnection.value.repository_id
  settings.useRepositoryContext = activeConnection.value.use_repository_context
  settings.allowIssueCreation = activeConnection.value.allow_issue_creation
  settings.allowPrCreation = activeConnection.value.allow_pr_creation
})

onMounted(async () => {
  if (installationId.value) {
    await loadRepositories()
  }
})

async function connectGithub() {
  connecting.value = true

  try {
    const response = await $fetch<{ url: string }>(`/api/sites/${siteId.value}/github/connect`, { method: 'POST' })
    await navigateTo(response.url, { external: true })
  } catch (error: unknown) {
    toast.add({ title: 'Could not start GitHub setup', description: getErrorMessage(error), color: 'error' })
  } finally {
    connecting.value = false
  }
}

async function loadRepositories() {
  repositoriesPending.value = true

  try {
    repositories.value = await $fetch<GithubRepositoryOption[]>(`/api/sites/${siteId.value}/github/repositories`, {
      query: { installationId: installationId.value }
    })
    selectedRepositoryId.value = repositories.value[0]?.id || selectedRepositoryId.value
  } catch (error: unknown) {
    toast.add({ title: 'Could not load repositories', description: getErrorMessage(error), color: 'error' })
  } finally {
    repositoriesPending.value = false
  }
}

async function saveConnection() {
  const repositoryId = selectedRepositoryId.value || activeConnection.value?.repository_id
  const targetInstallationId = installationId.value || activeConnection.value?.installation_id

  if (!repositoryId || !targetInstallationId) {
    toast.add({ title: 'Choose a repository', color: 'warning' })
    return
  }

  saving.value = true

  try {
    await $fetch(`/api/sites/${siteId.value}/github`, {
      method: 'PUT',
      body: {
        installationId: targetInstallationId,
        repositoryId,
        useRepositoryContext: settings.useRepositoryContext,
        allowIssueCreation: settings.allowIssueCreation,
        allowPrCreation: settings.allowPrCreation
      }
    })
    await refresh()
    await router.replace(`/sites/${siteId.value}/github`)
    toast.add({ title: 'GitHub settings saved', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not save GitHub settings', description: getErrorMessage(error), color: 'error' })
  } finally {
    saving.value = false
  }
}

async function disconnectGithub() {
  disconnecting.value = true

  try {
    await $fetch(`/api/sites/${siteId.value}/github`, { method: 'DELETE' })
    await refresh()
    selectedRepositoryId.value = null
    toast.add({ title: 'GitHub disconnected', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not disconnect GitHub', description: getErrorMessage(error), color: 'error' })
  } finally {
    disconnecting.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="site-github">
    <template #header>
      <SiteHeader :site-id="siteId" :title="site?.hostname || 'GitHub settings'" />
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">
                  Repository connection
                </h2>
                <p class="text-sm text-muted">
                  Connect the repo that powers this site so runs can use bounded code context.
                </p>
              </div>
              <UBadge :color="activeConnection ? 'success' : 'neutral'" variant="subtle">
                {{ activeConnection ? 'Connected' : 'Not connected' }}
              </UBadge>
            </div>
          </template>

          <div class="space-y-4">
            <UAlert
              v-if="!site?.verified_at"
              icon="i-lucide-shield-alert"
              color="warning"
              variant="subtle"
              title="Verify this site first"
              description="GitHub can be connected after ownership is verified."
            />

            <div v-if="activeConnection" class="rounded-lg border border-default p-3">
              <div class="flex items-start justify-between gap-3">
                <div class="min-w-0">
                  <p class="truncate text-sm font-medium">
                    {{ activeConnection.full_name }}
                  </p>
                  <p class="truncate text-xs text-muted">
                    {{ activeConnection.html_url }}
                  </p>
                </div>
                <UButton
                  :to="activeConnection.html_url"
                  target="_blank"
                  color="neutral"
                  variant="ghost"
                  size="sm"
                  icon="i-lucide-external-link"
                  aria-label="Open repository"
                />
              </div>
            </div>

            <div v-if="installationId" class="space-y-2">
              <UFormField label="Repository" name="repository">
                <USelect
                  v-model="selectedRepositoryId"
                  :items="repositoryItems"
                  :loading="repositoriesPending"
                  placeholder="Choose repository"
                  class="w-full"
                />
              </UFormField>
            </div>

            <div class="grid gap-3">
              <USwitch v-model="settings.useRepositoryContext" label="Use repository context in runs" />
              <USwitch v-model="settings.allowIssueCreation" label="Opt in to future GitHub issue creation" />
              <USwitch v-model="settings.allowPrCreation" label="Opt in to future pull request creation" />
            </div>

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                v-if="!activeConnection && !installationId"
                icon="i-simple-icons-github"
                label="Connect GitHub App"
                :loading="connecting"
                :disabled="!site?.verified_at"
                @click="connectGithub"
              />
              <UButton
                v-if="installationId || activeConnection"
                icon="i-lucide-save"
                label="Save GitHub settings"
                :loading="saving"
                @click="saveConnection"
              />
              <UButton
                v-if="activeConnection"
                color="error"
                variant="outline"
                icon="i-lucide-unlink"
                label="Disconnect"
                :loading="disconnecting"
                @click="disconnectGithub"
              />
            </div>
          </div>
        </UCard>

        <div class="space-y-4">
          <UAlert
            icon="i-lucide-code-xml"
            color="primary"
            variant="subtle"
            title="Context used by runs"
            description="Runs can include repository metadata, README excerpts, package hints, and a capped route/file list. Installation tokens are short-lived and never stored."
          />

          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                Coming next
              </h2>
            </template>
            <div class="space-y-3">
              <UButton
                icon="i-lucide-circle-dot"
                label="Create GitHub issue from finding"
                disabled
                block
              />
              <UButton
                icon="i-lucide-git-pull-request"
                label="Create autofix pull request"
                disabled
                block
              />
              <p class="text-sm text-muted">
                The opt-ins above are stored now, but write actions stay disabled until the automation pipeline is implemented.
              </p>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
