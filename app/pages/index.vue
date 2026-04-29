<script setup lang="ts">
import type { QaRun, VerifiedDomain } from '~/types'

const { data: domains } = await useFetch<VerifiedDomain[]>('/api/domains', { default: () => [] })
const { data: runs } = await useFetch<QaRun[]>('/api/runs', { default: () => [] })

const verifiedCount = computed(() => domains.value.filter(domain => domain.verified_at).length)
const runningCount = computed(() => runs.value.filter(run => ['queued', 'running'].includes(run.status)).length)
const issueCount = computed(() => runs.value.reduce((total, run) => total + (run.issue_count || 0), 0))
const latestRun = computed(() => runs.value[0])
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #right>
          <UButton to="/runs/new" icon="i-lucide-play" label="New run" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="grid gap-4 lg:grid-cols-3">
        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-muted">
                Verified domains
              </p>
              <p class="mt-2 text-3xl font-semibold">
                {{ verifiedCount }}
              </p>
            </div>
            <UIcon name="i-lucide-shield-check" class="size-8 text-primary" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-muted">
                Active runs
              </p>
              <p class="mt-2 text-3xl font-semibold">
                {{ runningCount }}
              </p>
            </div>
            <UIcon name="i-lucide-loader-circle" class="size-8 text-info" />
          </div>
        </UCard>

        <UCard>
          <div class="flex items-center justify-between gap-4">
            <div>
              <p class="text-sm text-muted">
                Issues found
              </p>
              <p class="mt-2 text-3xl font-semibold">
                {{ issueCount }}
              </p>
            </div>
            <UIcon name="i-lucide-bug" class="size-8 text-warning" />
          </div>
        </UCard>
      </div>

      <div class="mt-6 grid gap-4 lg:grid-cols-[1fr_380px]">
        <UCard>
          <template #header>
            <div class="flex items-center justify-between gap-3">
              <div>
                <h2 class="text-base font-semibold">
                  Getting started
                </h2>
                <p class="text-sm text-muted">
                  Verify a domain before launching a public website run.
                </p>
              </div>
              <UBadge color="primary" variant="subtle">
                GitHub auth
              </UBadge>
            </div>
          </template>

          <div class="grid gap-3 md:grid-cols-3">
            <UButton
              to="/domains"
              color="neutral"
              variant="soft"
              icon="i-lucide-globe-lock"
              label="Add domain"
              block
            />
            <UButton
              to="/runs/new"
              color="neutral"
              variant="soft"
              icon="i-lucide-play-circle"
              label="Create run"
              block
            />
            <UButton
              to="/runs"
              color="neutral"
              variant="soft"
              icon="i-lucide-list-checks"
              label="View reports"
              block
            />
          </div>
        </UCard>

        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              Latest run
            </h2>
          </template>

          <div v-if="latestRun" class="space-y-3">
            <div class="flex items-center justify-between gap-3">
              <p class="truncate text-sm font-medium">
                {{ latestRun.target_hostname }}
              </p>
              <UBadge :color="latestRun.status === 'failed' ? 'error' : latestRun.status === 'completed' ? 'success' : 'warning'" variant="subtle">
                {{ latestRun.status }}
              </UBadge>
            </div>
            <p class="line-clamp-3 text-sm text-muted">
              {{ latestRun.goal }}
            </p>
            <UButton
              :to="`/runs/${latestRun.id}`"
              color="neutral"
              variant="outline"
              label="Open run"
              block
            />
          </div>
          <UAlert
            v-else
            icon="i-lucide-info"
            color="neutral"
            variant="subtle"
            title="No runs yet"
            description="Create your first QA run after verifying a domain."
          />
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
