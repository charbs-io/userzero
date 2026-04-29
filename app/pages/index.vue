<script setup lang="ts">
import type { SupabaseClient } from '@supabase/supabase-js'

definePageMeta({
  layout: 'blank'
})

useSeoMeta({
  title: 'Product Warden | AI browser QA for verified web apps',
  description: 'Run AI-guided browser checks against verified websites and review screenshots, step traces, issues and markdown reports.'
})

const auditModes = [{
  name: 'Customer',
  icon: 'i-lucide-user-round',
  focus: 'Experience and conversion friction',
  summary: 'Acts through the requested journey with normal user expectations and records visible confusion, dead ends and blockers.',
  records: ['Journey clarity and trust gaps', 'Conversion blockers', 'Plain-language evidence']
}, {
  name: 'QA engineer',
  icon: 'i-lucide-bug',
  focus: 'Functional defects and regressions',
  summary: 'Exercises forms, navigation, state changes and error states, then records reproducible issues with suggested fixes.',
  records: ['Broken UI behavior', 'Validation gaps', 'Regression risk']
}, {
  name: 'Performance engineer',
  icon: 'i-lucide-gauge',
  focus: 'Load timing and runtime noise',
  summary: 'Uses browser diagnostics during the journey to surface slow requests, page errors and console noise where available.',
  records: ['Page-load timing', 'Slow network requests', 'Console and page errors']
}, {
  name: 'Security engineer',
  icon: 'i-lucide-shield-alert',
  focus: 'Visible security and privacy risks',
  summary: 'Looks for auth, permission, mixed-content and privacy issues from the browser journey without intrusive testing.',
  records: ['Visible privacy leaks', 'Auth and permission mistakes', 'Severity and remediation notes']
}]

const activeMode = ref(0)
const selectedMode = computed(() => auditModes[activeMode.value] ?? auditModes[0]!)
const isSignedIn = ref(false)
let authSubscription: { unsubscribe: () => void } | null = null
const authButton = computed(() => isSignedIn.value
  ? {
      to: '/app',
      label: 'Go to app',
      icon: 'i-lucide-layout-dashboard'
    }
  : {
      to: '/login',
      label: 'Log in',
      icon: 'i-lucide-log-in'
    })

onMounted(async () => {
  const supabase = useNuxtApp().$supabase as SupabaseClient | null

  if (!supabase) {
    return
  }

  const { data } = await supabase.auth.getSession()
  isSignedIn.value = Boolean(data.session)

  const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
    isSignedIn.value = Boolean(session)
  })

  authSubscription = listener.subscription
})

onBeforeUnmount(() => {
  authSubscription?.unsubscribe()
})

const productFacts = [{
  value: 'Verified sites',
  label: 'runs start only on hostnames you prove you control'
}, {
  value: 'Browser evidence',
  label: 'screenshots, step traces, issues and report output'
}, {
  value: 'Optional GitHub',
  label: 'repository context, issues and pull requests when enabled'
}]

const features = [{
  title: 'Verified-site runs',
  description: 'Product Warden blocks runs unless the target hostname is covered by a site you have verified with a meta tag or DNS record.',
  icon: 'i-lucide-shield-check'
}, {
  title: 'Browser-driven journeys',
  description: 'A Playwright browser opens the target URL, inspects visible controls and works through the goal with the selected persona.',
  icon: 'i-lucide-mouse-pointer-click'
}, {
  title: 'Inspectable evidence',
  description: 'Runs store screenshots, action history, issue records, markdown reports and videos when available, so findings can be reviewed instead of taken on faith.',
  icon: 'i-lucide-file-search'
}, {
  title: 'Opt-in GitHub actions',
  description: 'When a repository is connected, indexed and allowed, findings can use repository context and create GitHub issues or pull requests.',
  icon: 'i-simple-icons-github'
}]

const steps = [{
  title: 'Verify a site',
  description: 'Add the public URL and prove ownership before Product Warden can start a run.'
}, {
  title: 'Choose personas and a goal',
  description: 'Select one or more starter or custom personas, then describe the journey in plain language.'
}, {
  title: 'Review the run evidence',
  description: 'Open the step trace, screenshots, issue list, markdown reports and any recorded video from the completed run.'
}, {
  title: 'Act on findings',
  description: 'Handle issues manually, or enable GitHub actions for issue and pull request creation from individual findings.'
}]

const faqs = [{
  question: 'Is this replacing automated tests?',
  answer: 'No. Product Warden is an exploratory QA layer. Keep deterministic tests for known contracts and use this for visible journey checks and product friction.'
}, {
  question: 'What does it actually do during a run?',
  answer: 'It launches a browser, captures screenshots, inventories visible controls, asks the selected persona what to do next and stores the resulting steps, issues and reports.'
}, {
  question: 'Are the findings guaranteed?',
  answer: 'No. AI browser runs can miss things or misjudge severity. The report is reviewable evidence for a human team, not an automatic pass or fail certificate.'
}, {
  question: 'Can it test any website?',
  answer: 'No. The target must be a public HTTP or HTTPS hostname covered by a verified site in your workspace. Runs stop if they leave that boundary.'
}, {
  question: 'What does GitHub integration do?',
  answer: 'Repository context is optional. If connected, indexed and explicitly enabled, it can help runs reason about likely implementation areas and create GitHub issues or pull requests from findings.'
}]
</script>

<template>
  <main class="min-h-dvh overflow-hidden bg-default text-default">
    <header class="sticky top-0 z-40 border-b border-default/70 bg-default/90 backdrop-blur">
      <div class="mx-auto flex h-16 w-full max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <NuxtLink to="/" aria-label="Product Warden home">
          <AppLogo />
        </NuxtLink>

        <nav class="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Main">
          <a href="#features" class="hover:text-default">Features</a>
          <a href="#workflow" class="hover:text-default">Workflow</a>
          <a href="#faq" class="hover:text-default">FAQ</a>
        </nav>

        <UButton
          :to="authButton.to"
          :label="authButton.label"
          :icon="authButton.icon"
          color="primary"
        />
      </div>
    </header>

    <section class="relative">
      <div class="mx-auto grid w-full max-w-7xl gap-12 px-4 py-16 sm:px-6 sm:py-20 lg:grid-cols-[1fr_480px] lg:px-8 lg:py-24">
        <div class="flex max-w-3xl flex-col justify-center">
          <UBadge
            color="primary"
            variant="subtle"
            class="w-fit"
          >
            Verified-site browser QA
          </UBadge>

          <h1 class="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-default sm:text-5xl xl:text-6xl">
            Run AI-guided QA on the web flows you own.
          </h1>

          <p class="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Product Warden opens a real browser against a verified URL, works through a goal with selected personas and gives you screenshots, steps, issues and markdown reports to review.
          </p>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <UButton
              :to="authButton.to"
              :label="authButton.label"
              :icon="authButton.icon"
              size="xl"
            />
            <UButton
              to="#features"
              label="See how it works"
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="outline"
              size="xl"
            />
          </div>

          <dl class="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
            <div
              v-for="fact in productFacts"
              :key="fact.value"
              class="rounded-lg border border-default bg-elevated/35 p-4"
            >
              <dt class="text-sm font-semibold text-default">
                {{ fact.value }}
              </dt>
              <dd class="mt-2 text-sm leading-6 text-muted">
                {{ fact.label }}
              </dd>
            </div>
          </dl>
        </div>

        <aside class="relative lg:pt-10" aria-label="Interactive QA evidence preview">
          <div class="rounded-lg border border-default bg-default shadow-2xl shadow-cyan-950/10 dark:shadow-cyan-950/25">
            <div class="border-b border-default p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-default">
                    Run evidence preview
                  </p>
                  <p class="text-xs text-muted">
                    {{ selectedMode.focus }}
                  </p>
                </div>
                <UButton
                  :to="authButton.to"
                  :label="authButton.label"
                  :icon="authButton.icon"
                  size="sm"
                />
              </div>

              <div class="mt-4 grid grid-cols-2 gap-2">
                <button
                  v-for="(mode, index) in auditModes"
                  :key="mode.name"
                  type="button"
                  class="rounded-lg border px-3 py-2 text-left text-sm transition"
                  :class="activeMode === index ? 'border-primary bg-primary/10 text-default' : 'border-default bg-elevated/40 text-muted hover:text-default'"
                  :aria-pressed="activeMode === index"
                  @click="activeMode = index"
                >
                  <UIcon :name="mode.icon" class="mb-2 size-4" />
                  <span class="block truncate">{{ mode.name }}</span>
                </button>
              </div>
            </div>

            <div class="space-y-5 p-5">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-sm text-muted">
                    Selected persona
                  </p>
                  <p class="mt-1 text-3xl font-semibold text-default">
                    {{ selectedMode.name }}
                  </p>
                </div>
                <UBadge
                  color="neutral"
                  variant="subtle"
                  size="lg"
                >
                  Starter template
                </UBadge>
              </div>

              <p class="rounded-lg border border-default bg-elevated/35 p-4 text-sm leading-6 text-muted">
                {{ selectedMode.summary }}
              </p>

              <div class="space-y-3">
                <p class="text-sm font-medium text-default">
                  Report focus
                </p>
                <div
                  v-for="record in selectedMode.records"
                  :key="record"
                  class="flex items-center gap-3 rounded-lg border border-default px-3 py-2"
                >
                  <span class="inline-grid size-7 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                    <UIcon name="i-lucide-check" class="size-4" />
                  </span>
                  <span class="text-sm text-default">{{ record }}</span>
                </div>
              </div>
            </div>
          </div>
        </aside>
      </div>
    </section>

    <section id="features" class="border-y border-default bg-elevated/25">
      <div class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div class="max-w-2xl">
          <p class="text-sm font-medium text-primary">
            What it actually does
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-normal text-default sm:text-4xl">
            Browser runs with evidence you can inspect.
          </h2>
          <p class="mt-4 text-base leading-7 text-muted">
            The product is intentionally narrow: verified web targets, visible browser journeys, saved evidence and optional repository context.
          </p>
        </div>

        <div class="mt-10 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <article
            v-for="feature in features"
            :key="feature.title"
            class="rounded-lg border border-default bg-default p-5"
          >
            <span class="inline-grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
              <UIcon :name="feature.icon" class="size-5" />
            </span>
            <h3 class="mt-5 text-base font-semibold text-default">
              {{ feature.title }}
            </h3>
            <p class="mt-3 text-sm leading-6 text-muted">
              {{ feature.description }}
            </p>
          </article>
        </div>
      </div>
    </section>

    <section id="workflow">
      <div class="mx-auto grid w-full max-w-7xl gap-10 px-4 py-16 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] lg:px-8">
        <div>
          <p class="text-sm font-medium text-primary">
            How it works
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-normal text-default sm:text-4xl">
            From a verified URL to a reviewable report.
          </h2>
          <p class="mt-4 text-base leading-7 text-muted">
            Start with one journey your team would normally smoke test, then inspect the generated evidence before deciding what to fix.
          </p>
        </div>

        <div class="grid gap-4">
          <div
            v-for="(step, index) in steps"
            :key="step.title"
            class="grid gap-4 rounded-lg border border-default bg-default p-5 sm:grid-cols-[56px_1fr]"
          >
            <div class="inline-grid size-12 place-items-center rounded-lg bg-elevated text-lg font-semibold text-default">
              {{ index + 1 }}
            </div>
            <div>
              <h3 class="text-base font-semibold text-default">
                {{ step.title }}
              </h3>
              <p class="mt-2 text-sm leading-6 text-muted">
                {{ step.description }}
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>

    <section id="faq" class="border-y border-default bg-elevated/25">
      <div class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div class="max-w-2xl">
          <p class="text-sm font-medium text-primary">
            Limits
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-normal text-default sm:text-4xl">
            Useful evidence, not magic QA.
          </h2>
        </div>

        <div class="mt-10 grid gap-4 lg:grid-cols-3">
          <article
            v-for="item in faqs"
            :key="item.question"
            class="rounded-lg border border-default bg-default p-5"
          >
            <h3 class="text-base font-semibold text-default">
              {{ item.question }}
            </h3>
            <p class="mt-3 text-sm leading-6 text-muted">
              {{ item.answer }}
            </p>
          </article>
        </div>
      </div>
    </section>

    <section>
      <div class="mx-auto w-full max-w-7xl px-4 py-16 sm:px-6 lg:px-8">
        <div class="grid gap-8 rounded-lg border border-default bg-neutral-950 p-6 text-white sm:p-8 lg:grid-cols-[1fr_auto] lg:items-center dark:bg-white dark:text-neutral-950">
          <div>
            <h2 class="text-3xl font-semibold tracking-normal">
              Start with one journey you already care about.
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-white/70 dark:text-neutral-700">
              Log in, verify a site, choose a persona and review the browser evidence before deciding what to fix.
            </p>
          </div>

          <UButton
            :to="authButton.to"
            :label="authButton.label"
            :icon="authButton.icon"
            color="primary"
            size="xl"
          />
        </div>
      </div>
    </section>
  </main>
</template>
