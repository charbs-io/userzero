<script setup lang="ts">
import type { VerifiedDomain } from '~/types'

const toast = useToast()
const router = useRouter()
const submitting = ref(false)

const form = reactive({
  url: '',
  persona: 'first-time founder setting up a team workspace',
  goal: '',
  username: '',
  password: '',
  maxSteps: 20
})

const { data: domains } = await useFetch<VerifiedDomain[]>('/api/domains', {
  default: () => []
})

const verifiedDomains = computed(() => domains.value.filter(domain => domain.verified_at))

async function startRun() {
  submitting.value = true

  try {
    const response = await $fetch<{ id: string }>('/api/runs', {
      method: 'POST',
      body: {
        url: form.url,
        persona: form.persona,
        goal: form.goal,
        maxSteps: Number(form.maxSteps),
        credentials: {
          username: form.username || undefined,
          password: form.password || undefined
        }
      }
    })

    await router.push(`/runs/${response.id}`)
  } catch (error: unknown) {
    toast.add({ title: 'Run could not start', description: getErrorMessage(error), color: 'error' })
  } finally {
    submitting.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="new-run">
    <template #header>
      <UDashboardNavbar title="New run" />
    </template>

    <template #body>
      <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
        <UCard>
          <template #header>
            <div>
              <h2 class="text-base font-semibold">
                Customer simulation
              </h2>
              <p class="text-sm text-muted">
                User Zero will visually inspect the product, act through Playwright, and produce a QA report.
              </p>
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="startRun">
            <UFormField label="Target URL" name="url" required>
              <UInput v-model="form.url" placeholder="https://app.example.com/signup" required />
            </UFormField>

            <UFormField label="Persona" name="persona" required>
              <UInput v-model="form.persona" required />
            </UFormField>

            <UFormField label="Goal" name="goal" required>
              <UTextarea
                v-model="form.goal"
                placeholder="Sign up, create a workspace, invite a teammate, and upgrade plan"
                required
                autoresize
              />
            </UFormField>

            <div class="grid gap-4 md:grid-cols-2">
              <UFormField label="Test username" name="username">
                <UInput v-model="form.username" autocomplete="off" placeholder="Optional" />
              </UFormField>

              <UFormField label="Test password" name="password">
                <UInput
                  v-model="form.password"
                  type="password"
                  autocomplete="off"
                  placeholder="Optional"
                />
              </UFormField>
            </div>

            <UFormField label="Max steps" name="maxSteps">
              <UInput
                v-model.number="form.maxSteps"
                type="number"
                min="3"
                max="40"
              />
            </UFormField>

            <div class="flex justify-end">
              <UButton
                type="submit"
                icon="i-lucide-play"
                label="Start QA run"
                :loading="submitting"
              />
            </div>
          </form>
        </UCard>

        <div class="space-y-4">
          <UAlert
            icon="i-lucide-shield-check"
            color="primary"
            variant="subtle"
            title="Only verified domains can be tested"
            description="If the target URL redirects to an unverified domain, the run stops."
          />

          <UCard>
            <template #header>
              <h2 class="text-base font-semibold">
                Ready domains
              </h2>
            </template>
            <div v-if="verifiedDomains.length" class="space-y-2">
              <div v-for="domain in verifiedDomains" :key="domain.id" class="flex items-center gap-2 text-sm">
                <UIcon name="i-lucide-check" class="size-4 text-success" />
                <span>{{ domain.hostname }}</span>
              </div>
            </div>
            <UAlert
              v-else
              color="warning"
              variant="subtle"
              icon="i-lucide-triangle-alert"
              title="No verified domains"
              description="Add and verify a domain before starting a run."
            />
          </UCard>
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
