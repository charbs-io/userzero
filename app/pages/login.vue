<script setup lang="ts">
definePageMeta({
  layout: 'blank'
})

const route = useRoute()
const loading = ref(false)
const errorMessage = ref('')

async function signInWithGitHub() {
  const supabase = useSupabaseClient()
  loading.value = true
  errorMessage.value = ''

  const redirectTo = `${window.location.origin}/auth/callback`
  const { error } = await supabase.auth.signInWithOAuth({
    provider: 'github',
    options: {
      redirectTo,
      scopes: 'read:user user:email'
    }
  })

  if (error) {
    errorMessage.value = error.message
    loading.value = false
  }
}
</script>

<template>
  <main class="flex min-h-dvh items-center justify-center px-6 py-12">
    <UCard class="w-full max-w-md">
      <div class="space-y-6">
        <div class="space-y-2">
          <div class="flex items-center gap-2">
            <UIcon name="i-lucide-ghost" class="size-7 text-primary" />
            <h1 class="text-xl font-semibold">
              User Zero
            </h1>
          </div>
          <p class="text-sm text-muted">
            Sign in with GitHub to verify domains and run AI QA journeys.
          </p>
        </div>

        <UAlert
          v-if="route.query.error"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="Sign in failed"
          :description="String(route.query.error)"
        />

        <UAlert
          v-if="errorMessage"
          color="error"
          variant="subtle"
          icon="i-lucide-circle-alert"
          title="GitHub sign in failed"
          :description="errorMessage"
        />

        <UButton
          icon="i-simple-icons-github"
          label="Continue with GitHub"
          block
          size="lg"
          :loading="loading"
          @click="signInWithGitHub"
        />
      </div>
    </UCard>
  </main>
</template>
