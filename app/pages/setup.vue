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
          title="Site ownership is required"
          description="User Zero only tests websites after the signed-in user proves control of the site with a TXT record or a verification meta tag."
        />

        <UCard>
          <template #header>
            <h2 class="text-base font-semibold">
              Required environment
            </h2>
          </template>
          <ul class="list-disc space-y-2 pl-5 text-sm text-muted">
            <li>Supabase project with GitHub OAuth enabled.</li>
            <li>GitHub App configured for repository contents, issues, and pull requests permissions.</li>
            <li>Supabase SQL migration applied and the private screenshot bucket created.</li>
            <li>OpenAI API key configured on the server.</li>
            <li>Railway deployment using the included Playwright Dockerfile.</li>
          </ul>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
