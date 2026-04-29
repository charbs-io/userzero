<script setup lang="ts">
import type { TableColumn } from '@nuxt/ui'
import type { VerifiedDomain } from '~/types'

const toast = useToast()
const hostname = ref('')
const pending = ref(false)
const verifyingId = ref<string | null>(null)
const newToken = ref<{ hostname: string, token: string } | null>(null)

const { data: domains, refresh } = await useFetch<VerifiedDomain[]>('/api/domains', {
  default: () => []
})

const columns: TableColumn<VerifiedDomain>[] = [{
  accessorKey: 'hostname',
  header: 'Domain'
}, {
  accessorKey: 'verified_at',
  header: 'Status'
}, {
  accessorKey: 'verification_method',
  header: 'Method'
}, {
  id: 'actions',
  header: ''
}]

async function addDomain() {
  pending.value = true
  newToken.value = null

  try {
    const response = await $fetch<{ domain: VerifiedDomain, verification_token: string }>('/api/domains', {
      method: 'POST',
      body: { hostname: hostname.value }
    })

    hostname.value = ''
    newToken.value = {
      hostname: response.domain.hostname,
      token: response.verification_token
    }
    await refresh()
    toast.add({ title: 'Domain added', description: 'Add the TXT record or meta tag, then verify ownership.', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Could not add domain', description: getErrorMessage(error), color: 'error' })
  } finally {
    pending.value = false
  }
}

async function verifyDomain(domain: VerifiedDomain) {
  verifyingId.value = domain.id

  try {
    await $fetch(`/api/domains/${domain.id}/verify`, { method: 'POST' })
    await refresh()
    toast.add({ title: 'Domain verified', description: `${domain.hostname} is ready for QA runs.`, color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Verification failed', description: getErrorMessage(error), color: 'error' })
  } finally {
    verifyingId.value = null
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
  <UDashboardPanel id="domains">
    <template #header>
      <UDashboardNavbar title="Domains">
        <template #right>
          <UButton to="/runs/new" icon="i-lucide-play" label="New run" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[420px_1fr]">
        <div class="space-y-4">
          <UCard>
            <template #header>
              <div>
                <h2 class="text-base font-semibold">
                  Add a domain
                </h2>
                <p class="text-sm text-muted">
                  Public targets must prove ownership before User Zero can test them.
                </p>
              </div>
            </template>

            <form class="space-y-4" @submit.prevent="addDomain">
              <UFormField label="Domain or website URL" name="hostname">
                <UInput v-model="hostname" placeholder="example.com" required />
              </UFormField>
              <UButton
                type="submit"
                icon="i-lucide-plus"
                label="Add domain"
                :loading="pending"
                block
              />
            </form>
          </UCard>

          <UAlert
            icon="i-lucide-lock-keyhole"
            color="neutral"
            variant="subtle"
            title="Abuse prevention"
            description="Runs are blocked unless the target hostname is covered by one of your verified domains."
          />
        </div>

        <div class="space-y-4">
          <UCard v-if="newToken">
            <template #header>
              <div>
                <h2 class="text-base font-semibold">
                  Verification instructions
                </h2>
                <p class="text-sm text-muted">
                  Choose one option, deploy it, then click Verify.
                </p>
              </div>
            </template>

            <div class="space-y-4">
              <div>
                <p class="mb-2 text-sm font-medium">
                  Meta tag
                </p>
                <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs"><code>{{ metaTag(newToken.token) }}</code></pre>
              </div>
              <div>
                <p class="mb-2 text-sm font-medium">
                  DNS TXT record
                </p>
                <pre class="overflow-x-auto rounded-md bg-elevated p-3 text-xs"><code>{{ txtRecord(newToken.hostname, newToken.token) }}</code></pre>
              </div>
            </div>
          </UCard>

          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                Verified domains
              </h2>
            </template>

            <UTable :data="domains" :columns="columns" empty="No domains added yet.">
              <template #verified_at-cell="{ row }">
                <UBadge :color="row.original.verified_at ? 'success' : 'warning'" variant="subtle">
                  {{ row.original.verified_at ? 'Verified' : 'Pending' }}
                </UBadge>
              </template>

              <template #verification_method-cell="{ row }">
                <span class="text-sm text-muted">{{ row.original.verification_method || 'Not verified' }}</span>
              </template>

              <template #actions-cell="{ row }">
                <UButton
                  v-if="!row.original.verified_at"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  icon="i-lucide-shield-check"
                  label="Verify"
                  :loading="verifyingId === row.original.id"
                  @click="verifyDomain(row.original)"
                />
              </template>
            </UTable>
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
