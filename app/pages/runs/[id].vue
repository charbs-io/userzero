<script setup lang="ts">
import type { QaIssue, QaRun, QaStep } from '~/types'

const route = useRoute()
const toast = useToast()
const stopPending = ref(false)
const selectedScreenshot = ref<{ src: string, title: string, alt: string } | null>(null)

const { data, refresh, pending } = await useFetch<{
  run: QaRun
  steps: QaStep[]
  issues: QaIssue[]
}>(() => `/api/runs/${route.params.id}`, {
  default: () => ({ run: null as unknown as QaRun, steps: [], issues: [] })
})

const terminal = computed(() => ['completed', 'blocked', 'failed', 'cancelled'].includes(data.value.run?.status))
const canStop = computed(() => ['queued', 'running'].includes(data.value.run?.status))
const screenshotModalOpen = computed({
  get: () => Boolean(selectedScreenshot.value),
  set: (open) => {
    if (!open) {
      selectedScreenshot.value = null
    }
  }
})

useIntervalFn(() => {
  if (!terminal.value) {
    refresh()
  }
}, 2000)

const reportUrl = computed(() => `/api/runs/${route.params.id}/report`)

function statusColor(status: QaRun['status']) {
  switch (status) {
    case 'completed':
      return 'success'
    case 'failed':
      return 'error'
    case 'blocked':
      return 'warning'
    case 'cancelled':
      return 'neutral'
    default:
      return 'info'
  }
}

function openScreenshot(step: QaStep) {
  if (!step.screenshot_url) {
    return
  }

  selectedScreenshot.value = {
    src: step.screenshot_url,
    title: `Step ${step.step_number} screenshot`,
    alt: `Screenshot captured during step ${step.step_number}`
  }
}

async function stopRun() {
  if (!data.value.run || !canStop.value) {
    return
  }

  stopPending.value = true

  try {
    data.value.run = await $fetch<QaRun>(`/api/runs/${route.params.id}/stop`, {
      method: 'POST'
    })
    await refresh()
    toast.add({ title: 'Run stopped', color: 'success' })
  } catch (error: unknown) {
    toast.add({ title: 'Run could not be stopped', description: getErrorMessage(error), color: 'error' })
  } finally {
    stopPending.value = false
  }
}

function getErrorMessage(error: unknown) {
  const fetchError = error as { data?: { message?: string }, message?: string }
  return fetchError.data?.message || fetchError.message || 'Unexpected error'
}
</script>

<template>
  <div class="contents">
    <UDashboardPanel id="run-detail">
      <template #header>
        <UDashboardNavbar :title="data.run?.target_hostname || 'Run detail'">
          <template #right>
            <UButton
              v-if="canStop"
              color="error"
              variant="outline"
              icon="i-lucide-square"
              label="Stop run"
              :loading="stopPending"
              @click="stopRun"
            />
            <UButton
              :to="reportUrl"
              target="_blank"
              color="neutral"
              variant="outline"
              icon="i-lucide-file-text"
              label="Open markdown"
            />
          </template>
        </UDashboardNavbar>
      </template>

      <template #body>
        <div v-if="pending && !data.run" class="p-8">
          <UProgress animation="carousel" />
        </div>

        <div v-else-if="data.run" class="space-y-4">
          <div class="grid gap-4 lg:grid-cols-4">
            <UCard class="lg:col-span-2">
              <p class="text-sm text-muted">
                Goal
              </p>
              <p class="mt-2 text-sm">
                {{ data.run.goal }}
              </p>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">
                Status
              </p>
              <UBadge class="mt-2" :color="statusColor(data.run.status)" variant="subtle">
                {{ data.run.status }}
              </UBadge>
            </UCard>
            <UCard>
              <p class="text-sm text-muted">
                Issues
              </p>
              <p class="mt-2 text-2xl font-semibold">
                {{ data.issues.length }}
              </p>
            </UCard>
          </div>

          <UAlert
            v-if="data.run.error"
            color="error"
            variant="subtle"
            icon="i-lucide-circle-alert"
            title="Run error"
            :description="data.run.error"
          />

          <div class="grid gap-4 xl:grid-cols-[1fr_420px]">
            <UCard>
              <template #header>
                <h2 class="text-base font-semibold">
                  Journey trace
                </h2>
              </template>

              <div class="space-y-4">
                <div v-for="step in data.steps" :key="step.id" class="grid gap-3 rounded-lg border border-default p-3 md:grid-cols-[220px_1fr]">
                  <button
                    v-if="step.screenshot_url"
                    type="button"
                    class="block overflow-hidden rounded-md border border-default bg-elevated text-left transition hover:brightness-95 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                    :aria-label="`Open step ${step.step_number} screenshot`"
                    @click="openScreenshot(step)"
                  >
                    <img :src="step.screenshot_url" :alt="`Step ${step.step_number} screenshot`" class="aspect-video w-full object-cover">
                  </button>
                  <div v-else class="flex aspect-video items-center justify-center rounded-md border border-dashed border-default text-sm text-muted">
                    No screenshot
                  </div>

                  <div class="min-w-0 space-y-2">
                    <div class="flex items-center justify-between gap-3">
                      <p class="font-medium">
                        Step {{ step.step_number }}
                      </p>
                      <UBadge color="neutral" variant="subtle">
                        {{ (step.action as any).type || 'observe' }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted">
                      {{ step.observation }}
                    </p>
                    <p class="text-sm">
                      {{ (step.action as any).reason || step.progress }}
                    </p>
                  </div>
                </div>

                <UAlert
                  v-if="!data.steps.length"
                  icon="i-lucide-loader-circle"
                  color="neutral"
                  variant="subtle"
                  title="Waiting for first step"
                  description="The runner will add screenshots and observations as it works through the goal."
                />
              </div>
            </UCard>

            <div class="space-y-4">
              <UCard v-if="data.run.video_url">
                <template #header>
                  <h2 class="text-base font-semibold">
                    Run video
                  </h2>
                </template>

                <video
                  :src="data.run.video_url"
                  controls
                  preload="metadata"
                  class="aspect-video w-full rounded-md border border-default bg-black"
                />
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">
                    Issues found
                  </h2>
                </template>

                <div class="space-y-3">
                  <div v-for="issue in data.issues" :key="issue.id" class="rounded-lg border border-default p-3">
                    <div class="mb-2 flex items-center justify-between gap-3">
                      <p class="text-sm font-medium">
                        {{ issue.title }}
                      </p>
                      <UBadge :color="issue.severity === 'high' ? 'error' : issue.severity === 'medium' ? 'warning' : 'neutral'" variant="subtle">
                        {{ issue.severity }}
                      </UBadge>
                    </div>
                    <p class="text-sm text-muted">
                      {{ issue.description }}
                    </p>
                    <p class="mt-2 text-sm">
                      {{ issue.suggested_fix }}
                    </p>
                  </div>
                  <p v-if="!data.issues.length" class="text-sm text-muted">
                    No issues recorded yet.
                  </p>
                </div>
              </UCard>

              <UCard>
                <template #header>
                  <h2 class="text-base font-semibold">
                    Report
                  </h2>
                </template>
                <pre class="max-h-[560px] overflow-auto whitespace-pre-wrap text-sm">{{ data.run.report_md || (data.run.status === 'cancelled' ? 'No report was generated because the run was stopped.' : 'The markdown report will appear when the run finishes.') }}</pre>
              </UCard>
            </div>
          </div>
        </div>
      </template>
    </UDashboardPanel>

    <UModal v-model:open="screenshotModalOpen" fullscreen :title="selectedScreenshot?.title || 'Screenshot'">
      <template #body>
        <div class="flex min-h-[calc(100vh-8rem)] items-center justify-center bg-black p-3">
          <img
            v-if="selectedScreenshot"
            :src="selectedScreenshot.src"
            :alt="selectedScreenshot.alt"
            class="max-h-[calc(100vh-10rem)] w-full object-contain"
          >
        </div>
      </template>
    </UModal>
  </div>
</template>
