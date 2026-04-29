<script setup lang="ts">
import type { Site } from '~/types'

const toast = useToast()
const url = ref('')
const pending = ref(false)
const verifying = ref(false)
const newSite = ref<Site | null>(null)
const verificationToken = ref('')

async function addSite() {
  pending.value = true
  newSite.value = null
  verificationToken.value = ''

  try {
    const response = await $fetch<{ site: Site, verification_token: string }>('/api/sites', {
      method: 'POST',
      body: { url: url.value }
    })

    newSite.value = response.site
    verificationToken.value = response.verification_token
    url.value = ''
    toast.add({ title: 'Site added', description: 'Add the meta tag or DNS TXT record, then verify ownership.', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not add site', description: getErrorMessage(error), color: 'error' })
  } finally {
    pending.value = false
  }
}

async function verifySite() {
  if (!newSite.value) {
    return
  }

  verifying.value = true

  try {
    newSite.value = await $fetch<Site>(`/api/sites/${newSite.value.id}/verify`, { method: 'POST' })
    toast.add({ title: 'Site verified', description: `${newSite.value.hostname} is ready for QA runs.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Verification failed', description: getErrorMessage(error), color: 'error' })
  } finally {
    verifying.value = false
  }
}

function metaTag(token: string) {
  return `<meta name="userzero-site-verification" content="${token}">`
}

function txtRecord(host: string, token: string) {
  return `_userzero.${host} TXT "userzero-site-verification=${token}"`
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="new-site">
    <template #header>
      <UDashboardNavbar title="Add site" />
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div class="space-y-4">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-base font-semibold">
                  Site URL
                </h2>
                <p class="text-sm text-muted">
                  Enter the public URL exactly as User Zero should start from.
                </p>
              </div>
            </template>

            <form class="space-y-4" @submit.prevent="addSite">
              <UFormField label="Website URL" name="url" required>
                <UInput v-model="url" placeholder="https://example.com" required />
              </UFormField>
              <UButton
                type="submit"
                icon="i-lucide-plus"
                label="Add site"
                :loading="pending"
                block
              />
            </form>
          </UCard>

          <UAlert
            icon="i-lucide-lock-keyhole"
            color="neutral"
            variant="subtle"
            title="Ownership is required"
            description="Runs are blocked unless the target hostname is covered by one of your verified sites."
          />
        </div>

        <div class="space-y-4">
          <UCard v-if="newSite && verificationToken">
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <div>
                  <h2 class="text-base font-semibold">
                    Verify {{ newSite.hostname }}
                  </h2>
                  <p class="text-sm text-muted">
                    Choose one option, deploy it, then verify.
                  </p>
                </div>
                <UBadge :color="newSite.verified_at ? 'success' : 'warning'" variant="subtle">
                  {{ newSite.verified_at ? 'Verified' : 'Pending' }}
                </UBadge>
              </div>
            </template>

            <div class="space-y-4">
              <div>
                <p class="mb-2 text-sm font-medium">
                  Meta tag
                </p>
                <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs"><code>{{ metaTag(verificationToken) }}</code></pre>
              </div>
              <div>
                <p class="mb-2 text-sm font-medium">
                  DNS TXT record
                </p>
                <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs"><code>{{ txtRecord(newSite.hostname, verificationToken) }}</code></pre>
              </div>
              <div class="flex flex-wrap justify-end gap-2">
                <UButton
                  color="neutral"
                  variant="outline"
                  icon="i-lucide-shield-check"
                  label="Verify"
                  :loading="verifying"
                  :disabled="Boolean(newSite.verified_at)"
                  @click="verifySite"
                />
                <UButton
                  v-if="newSite.verified_at"
                  :to="`/sites/${newSite.id}/github`"
                  icon="i-simple-icons-github"
                  label="Connect GitHub"
                />
              </div>
            </div>
          </UCard>

          <UCard v-else>
            <template #header>
              <h2 class="text-base font-semibold">
                What happens next
              </h2>
            </template>
            <div class="grid gap-3 md:grid-cols-3">
              <div class="rounded-lg border border-default p-3">
                <UIcon name="i-lucide-globe" class="mb-3 size-5 text-primary" />
                <p class="text-sm font-medium">
                  Add URL
                </p>
                <p class="mt-1 text-sm text-muted">
                  Store the site origin and hostname.
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <UIcon name="i-lucide-shield-check" class="mb-3 size-5 text-primary" />
                <p class="text-sm font-medium">
                  Verify
                </p>
                <p class="mt-1 text-sm text-muted">
                  Prove ownership with a meta tag or TXT record.
                </p>
              </div>
              <div class="rounded-lg border border-default p-3">
                <UIcon name="i-simple-icons-github" class="mb-3 size-5 text-primary" />
                <p class="text-sm font-medium">
                  Connect repo
                </p>
                <p class="mt-1 text-sm text-muted">
                  Give runs bounded codebase context.
                </p>
              </div>
            </div>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
