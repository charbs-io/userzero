<script setup lang="ts">
import type { QaRun, Site } from '~/types'

const { data: sites } = await useFetch<Site[]>('/api/sites', { default: () => [] })
const { data: runs } = await useFetch<QaRun[]>('/api/runs', { default: () => [] })

const verifiedCount = computed(() => sites.value.filter(site => site.verified_at).length)
const connectedCount = computed(() => sites.value.filter(site => site.github_connection && !site.github_connection.disconnected_at).length)
const runningCount = computed(() => runs.value.filter(run => ['queued', 'running'].includes(run.status)).length)
const issueCount = computed(() => runs.value.reduce((total, run) => total + (run.issue_count || 0), 0))
const latestRun = computed(() => runs.value[0])
</script>

<template>
  <UDashboardPanel id="overview">
    <template #header>
      <UDashboardNavbar title="Overview">
        <template #right>
          <UButton to="/sites/new" icon="i-lucide-plus" label="Add site" />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div v-if="!sites.length" class="max-w-4xl space-y-4">
        <UAlert
          icon="i-lucide-panels-top-left"
          color="primary"
          variant="subtle"
          title="Set up your first site"
          description="Add the website URL, verify ownership, then connect GitHub so future runs can understand the codebase behind what they see."
        />

        <UCard>
          <div class="grid gap-4 md:grid-cols-[1fr_220px] md:items-center">
            <div class="space-y-2">
              <h2 class="text-base font-semibold">
                Start with the site you want User Zero to test
              </h2>
              <p class="text-sm text-muted">
                Site setup is required before QA runs because each target must prove ownership.
              </p>
            </div>
            <UButton
              to="/sites/new"
              icon="i-lucide-arrow-right"
              label="Create site"
              block
            />
          </div>
        </UCard>
      </div>

      <div v-else class="space-y-6">
        <div class="grid gap-4 lg:grid-cols-4">
          <UCard>
            <p class="text-sm text-muted">
              Sites
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ sites.length }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              Verified
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ verifiedCount }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              GitHub connected
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ connectedCount }}
            </p>
          </UCard>

          <UCard>
            <p class="text-sm text-muted">
              Active runs
            </p>
            <p class="mt-2 text-3xl font-semibold">
              {{ runningCount }}
            </p>
          </UCard>
        </div>

        <div class="grid gap-4 xl:grid-cols-[1fr_380px]">
          <UCard>
            <template #header>
              <div class="flex items-center justify-between gap-3">
                <h2 class="text-base font-semibold">
                  Sites
                </h2>
                <UButton
                  to="/sites"
                  color="neutral"
                  variant="outline"
                  size="sm"
                  label="View all"
                />
              </div>
            </template>

            <div class="grid gap-3 md:grid-cols-2">
              <NuxtLink
                v-for="site in sites.slice(0, 6)"
                :key="site.id"
                :to="`/sites/${site.id}`"
                class="rounded-lg border border-default p-3 hover:bg-elevated/50"
              >
                <div class="flex items-start justify-between gap-3">
                  <div class="min-w-0">
                    <p class="truncate text-sm font-medium">
                      {{ site.hostname }}
                    </p>
                    <p class="truncate text-xs text-muted">
                      {{ site.base_url }}
                    </p>
                  </div>
                  <UBadge :color="site.verified_at ? 'success' : 'warning'" variant="subtle">
                    {{ site.verified_at ? 'Verified' : 'Pending' }}
                  </UBadge>
                </div>
                <p class="mt-3 text-xs text-muted">
                  {{ site.github_connection && !site.github_connection.disconnected_at ? site.github_connection.full_name : 'No GitHub repo connected' }}
                </p>
              </NuxtLink>
            </div>
          </UCard>

          <div class="space-y-4">
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
                description="Start a run from one of your verified sites."
              />
            </UCard>

            <UCard>
              <div class="flex items-center justify-between gap-3">
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
        </div>
      </div>
    </template>
  </UDashboardPanel>
</template>
