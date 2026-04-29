<script setup lang="ts">
import type { Site } from '~/types'

const route = useRoute()
const toast = useToast()
const siteId = computed(() => String(route.params.id))
const verifying = ref(false)

const { data: site, refresh } = await useFetch<Site>(() => `/api/sites/${siteId.value}`, {
  default: () => null as unknown as Site
})

async function verifySite() {
  verifying.value = true

  try {
    await $fetch<Site>(`/api/sites/${siteId.value}/verify`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'Site verified', description: `${site.value.hostname} is ready for QA runs.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Verification failed', description: getErrorMessage(error), color: 'error' })
  } finally {
    verifying.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="site-settings">
    <template #header>
      <SiteHeader :site-id="siteId" :title="site?.hostname || 'Site settings'" />
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              Site details
            </h2>
          </template>

          <div class="grid gap-4 md:grid-cols-2">
            <UFormField label="Base URL">
              <UInput :model-value="site?.base_url" readonly />
            </UFormField>
            <UFormField label="Hostname">
              <UInput :model-value="site?.hostname" readonly />
            </UFormField>
            <UFormField label="Verification method">
              <UInput :model-value="site?.verification_method || 'Not verified'" readonly />
            </UFormField>
            <UFormField label="Last checked">
              <UInput :model-value="site?.last_checked_at ? new Date(site.last_checked_at).toLocaleString() : 'Never'" readonly />
            </UFormField>
          </div>
        </UCard>

        <div class="space-y-4">
          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                Verification
              </h2>
            </template>

            <div class="space-y-3">
              <UBadge :color="site?.verified_at ? 'success' : 'warning'" variant="subtle">
                {{ site?.verified_at ? 'Verified' : 'Pending' }}
              </UBadge>
              <p class="text-sm text-muted">
                {{ site?.verified_at ? 'Runs can start from this site.' : 'Add the verification token from site creation, then check again.' }}
              </p>
              <UButton
                v-if="!site?.verified_at"
                color="neutral"
                variant="outline"
                icon="i-lucide-shield-check"
                label="Verify again"
                :loading="verifying"
                block
                @click="verifySite"
              />
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                GitHub
              </h2>
            </template>
            <div class="space-y-3">
              <p class="text-sm text-muted">
                {{ site?.github_connection && !site.github_connection.disconnected_at ? site.github_connection.full_name : 'No repository connected.' }}
              </p>
              <UButton
                :to="`/sites/${siteId}/github`"
                color="neutral"
                variant="outline"
                icon="i-simple-icons-github"
                label="GitHub settings"
                block
              />
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
