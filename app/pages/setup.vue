<script setup lang="ts">
import type { OpenAISettingsStatus } from '~/types'

const toast = useToast()
const savingOpenAIKey = ref(false)
const clearingOpenAIKey = ref(false)

const openAIForm = reactive({
  apiKey: ''
})

const emptyOpenAISettings: OpenAISettingsStatus = {
  configured: false,
  updated_at: null
}

const { data: openAISettings } = await useFetch<OpenAISettingsStatus>('/api/settings/openai', {
  default: () => emptyOpenAISettings
})
const openAIStatus = computed(() => openAISettings.value || emptyOpenAISettings)

async function saveOpenAIKey() {
  savingOpenAIKey.value = true

  try {
    openAISettings.value = await $fetch<OpenAISettingsStatus>('/api/settings/openai', {
      method: 'PUT',
      body: {
        apiKey: openAIForm.apiKey
      }
    })

    openAIForm.apiKey = ''
    toast.add({ title: 'OpenAI key saved', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'OpenAI key could not be saved', description: getErrorMessage(error), color: 'error' })
  } finally {
    savingOpenAIKey.value = false
  }
}

async function clearOpenAIKey() {
  clearingOpenAIKey.value = true

  try {
    openAISettings.value = await $fetch<OpenAISettingsStatus>('/api/settings/openai', {
      method: 'DELETE'
    })

    openAIForm.apiKey = ''
    toast.add({ title: 'OpenAI key removed', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'OpenAI key could not be removed', description: getErrorMessage(error), color: 'error' })
  } finally {
    clearingOpenAIKey.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <UDashboardPanel id="setup">
    <template #header>
      <UDashboardNavbar title="Setup" />
    </template>

    <template #body>
      <div class="max-w-3xl space-y-4">
        <UAlert
          icon="i-lucide-shield-check"
          color="primary"
          variant="subtle"
          title="Domain ownership is required"
          description="User Zero only tests websites after the signed-in user proves control of the domain with a TXT record or a verification meta tag."
        />

        <UCard>
          <template #header>
            <div class="flex items-start justify-between gap-4">
              <div>
                <h2 class="text-base font-semibold">
                  OpenAI API key
                </h2>
                <p class="text-sm text-muted">
                  Saved keys are encrypted server-side and are never displayed again.
                </p>
              </div>
              <UBadge
                :color="openAIStatus.configured ? 'success' : 'warning'"
                variant="subtle"
                :label="openAIStatus.configured ? 'Saved' : 'Missing'"
              />
            </div>
          </template>

          <form class="space-y-4" @submit.prevent="saveOpenAIKey">
            <UAlert
              v-if="openAIStatus.configured"
              icon="i-lucide-key-round"
              color="success"
              variant="subtle"
              :title="openAIStatus.updated_at ? `Saved ${new Date(openAIStatus.updated_at).toISOString()}` : 'OpenAI key saved'"
              description="Enter a new key to replace it, or remove the saved key."
            />

            <UFormField label="API key" name="apiKey" required>
              <UInput
                v-model="openAIForm.apiKey"
                type="password"
                autocomplete="off"
                placeholder="sk-..."
                required
              />
            </UFormField>

            <div class="flex flex-wrap justify-end gap-2">
              <UButton
                v-if="openAIStatus.configured"
                type="button"
                icon="i-lucide-trash-2"
                label="Remove key"
                color="error"
                variant="soft"
                :loading="clearingOpenAIKey"
                @click="clearOpenAIKey"
              />
              <UButton
                type="submit"
                icon="i-lucide-save"
                :label="openAIStatus.configured ? 'Replace key' : 'Save key'"
                :loading="savingOpenAIKey"
              />
            </div>
          </form>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              Required environment
            </h2>
          </template>
          <ul class="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Supabase project with GitHub OAuth enabled.</li>
            <li>Supabase SQL migration applied and the private screenshot bucket created.</li>
            <li>Server encryption secret configured for saved OpenAI API keys.</li>
            <li>Railway deployment using the included Playwright Dockerfile.</li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
