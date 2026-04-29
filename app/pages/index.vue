<script setup lang="ts">
definePageMeta({
  layout: 'blank'
})

useSeoMeta({
  title: 'Product Warden | AI QA agents for web products',
  description: 'Product Warden sends AI customers through verified websites and returns QA reports with screenshots, issues and code context.'
})

const journeys = [{
  name: 'Checkout',
  icon: 'i-lucide-shopping-cart',
  risk: 'Low risk',
  score: '94',
  summary: 'Recovered pricing, cart and payment friction before release.',
  events: ['Product detail loaded', 'Cart accepted variant', 'Payment copy verified']
}, {
  name: 'Signup',
  icon: 'i-lucide-user-plus',
  risk: 'Needs review',
  score: '78',
  summary: 'Found a blocked onboarding path after email confirmation.',
  events: ['Account created', 'Redirect inspected', 'Empty-state issue captured']
}, {
  name: 'Dashboard',
  icon: 'i-lucide-layout-dashboard',
  risk: 'Healthy',
  score: '91',
  summary: 'Confirmed authenticated navigation and key account actions.',
  events: ['Session restored', 'Primary action tested', 'Report evidence saved']
}]

const activeJourney = ref(0)
const selectedJourney = computed(() => journeys[activeJourney.value] ?? journeys[0]!)

const stats = [{
  value: '12 min',
  label: 'from prompt to report'
}, {
  value: '3x',
  label: 'more paths checked per release'
}, {
  value: '0',
  label: 'scripts to maintain'
}]

const features = [{
  title: 'Customer-like agents',
  description: 'Ask Product Warden to buy, sign up, compare, subscribe or recover an account just like a real customer would.',
  icon: 'i-lucide-bot'
}, {
  title: 'Evidence-rich reports',
  description: 'Each run keeps screenshots, step notes and issue summaries together so the next fix is obvious.',
  icon: 'i-lucide-file-search'
}, {
  title: 'Verified targets',
  description: 'Sites must prove ownership before runs start, keeping QA focused on products you actually control.',
  icon: 'i-lucide-shield-check'
}, {
  title: 'GitHub context',
  description: 'Connect a repository so findings can point back to the product surface and the code behind it.',
  icon: 'i-simple-icons-github'
}]

const steps = [{
  title: 'Add a site',
  description: 'Register the product URL and verify ownership before any agent run begins.'
}, {
  title: 'Describe the journey',
  description: 'Tell the agent what a customer is trying to do, from checkout to onboarding.'
}, {
  title: 'Review the report',
  description: 'Open a concise QA report with screenshots, status, issues and next actions.'
}]

const faqs = [{
  question: 'Is this replacing automated tests?',
  answer: 'No. It is a practical layer for exploratory product QA where brittle selectors and narrow assertions miss real customer friction.'
}, {
  question: 'Why does Product Warden verify sites?',
  answer: 'Verification keeps runs limited to products the workspace owns or operates, which is the right boundary for autonomous QA.'
}, {
  question: 'What should I run first?',
  answer: 'Start with the revenue or activation path: checkout, trial signup, account creation, password recovery or the primary dashboard action.'
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
          to="/login"
          label="Log in"
          icon="i-lucide-log-in"
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
            AI product QA for verified web apps
          </UBadge>

          <h1 class="mt-6 max-w-3xl text-4xl font-semibold tracking-normal text-default sm:text-5xl xl:text-6xl">
            Product Warden catches broken product flows before customers do.
          </h1>

          <p class="mt-6 max-w-2xl text-lg leading-8 text-muted">
            Send AI customers through checkout, signup and dashboard journeys. Get a clear report with screenshots, issue notes and the context your team needs to fix the path.
          </p>

          <div class="mt-8 flex flex-col gap-3 sm:flex-row">
            <UButton
              to="/login"
              label="Log in"
              icon="i-lucide-log-in"
              size="xl"
            />
            <UButton
              to="#features"
              label="See features"
              icon="i-lucide-arrow-down"
              color="neutral"
              variant="outline"
              size="xl"
            />
          </div>

          <dl class="mt-12 grid max-w-2xl gap-4 sm:grid-cols-3">
            <div
              v-for="stat in stats"
              :key="stat.label"
              class="rounded-lg border border-default bg-elevated/35 p-4"
            >
              <dt class="text-sm text-muted">
                {{ stat.label }}
              </dt>
              <dd class="mt-2 text-2xl font-semibold text-default">
                {{ stat.value }}
              </dd>
            </div>
          </dl>
        </div>

        <aside class="relative lg:pt-10" aria-label="Interactive QA report preview">
          <div class="rounded-lg border border-default bg-default shadow-2xl shadow-cyan-950/10 dark:shadow-cyan-950/25">
            <div class="border-b border-default p-4">
              <div class="flex items-center justify-between gap-3">
                <div>
                  <p class="text-sm font-medium text-default">
                    Live journey run
                  </p>
                  <p class="text-xs text-muted">
                    {{ selectedJourney.name }} path
                  </p>
                </div>
                <UButton
                  to="/login"
                  label="Log in"
                  icon="i-lucide-log-in"
                  size="sm"
                />
              </div>

              <div class="mt-4 grid grid-cols-3 gap-2">
                <button
                  v-for="(journey, index) in journeys"
                  :key="journey.name"
                  type="button"
                  class="rounded-lg border px-3 py-2 text-left text-sm transition"
                  :class="activeJourney === index ? 'border-primary bg-primary/10 text-default' : 'border-default bg-elevated/40 text-muted hover:text-default'"
                  :aria-pressed="activeJourney === index"
                  @click="activeJourney = index"
                >
                  <UIcon :name="journey.icon" class="mb-2 size-4" />
                  <span class="block truncate">{{ journey.name }}</span>
                </button>
              </div>
            </div>

            <div class="space-y-5 p-5">
              <div class="flex items-start justify-between gap-4">
                <div>
                  <p class="text-sm text-muted">
                    Warden score
                  </p>
                  <p class="mt-1 text-5xl font-semibold text-default">
                    {{ selectedJourney.score }}
                  </p>
                </div>
                <UBadge
                  :color="selectedJourney.risk === 'Needs review' ? 'warning' : 'success'"
                  variant="subtle"
                  size="lg"
                >
                  {{ selectedJourney.risk }}
                </UBadge>
              </div>

              <div class="h-2 rounded-full bg-elevated">
                <div
                  class="h-2 rounded-full bg-primary"
                  :style="{ width: `${selectedJourney.score}%` }"
                />
              </div>

              <p class="rounded-lg border border-default bg-elevated/35 p-4 text-sm leading-6 text-muted">
                {{ selectedJourney.summary }}
              </p>

              <div class="space-y-3">
                <div
                  v-for="event in selectedJourney.events"
                  :key="event"
                  class="flex items-center gap-3 rounded-lg border border-default px-3 py-2"
                >
                  <span class="inline-grid size-7 shrink-0 place-items-center rounded-full bg-success/10 text-success">
                    <UIcon name="i-lucide-check" class="size-4" />
                  </span>
                  <span class="text-sm text-default">{{ event }}</span>
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
            What it does
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-normal text-default sm:text-4xl">
            A QA teammate that understands product intent.
          </h2>
          <p class="mt-4 text-base leading-7 text-muted">
            Product Warden is built for the messy flows that matter most: authenticated pages, buying paths, account setup and release smoke checks.
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
            From a plain-English goal to a usable QA report.
          </h2>
          <p class="mt-4 text-base leading-7 text-muted">
            Keep the workflow close to how teams already ship: pick the product surface, state the customer goal and review the evidence.
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
            Questions
          </p>
          <h2 class="mt-3 text-3xl font-semibold tracking-normal text-default sm:text-4xl">
            Built for release checks, not theatre.
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
              Run the journey your customers care about next.
            </h2>
            <p class="mt-3 max-w-2xl text-sm leading-6 text-white/70 dark:text-neutral-700">
              Log in, verify a site and let Product Warden inspect the path before it reaches production traffic.
            </p>
          </div>

          <UButton
            to="/login"
            label="Log in"
            icon="i-lucide-log-in"
            color="primary"
            size="xl"
          />
        </div>
      </div>
    </section>
  </main>
</template>
