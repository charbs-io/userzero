// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vueuse/nuxt'
  ],

  devtools: {
    enabled: true
  },

  css: ['~/assets/css/main.css'],

  runtimeConfig: {
    supabaseServiceRoleKey: '',
    apiKeyEncryptionSecret: '',
    openaiModel: 'gpt-5.4-mini',
    openaiReportModel: 'gpt-5.5',
    screenshotBucket: 'qa-screenshots',
    githubAppId: '',
    githubAppPrivateKey: '',
    githubAppSlug: '',
    githubAppWebhookSecret: '',
    public: {
      appBaseUrl: '',
      supabaseUrl: '',
      supabasePublishableKey: ''
    }
  },

  routeRules: {
    '/api/**': {
      cors: false
    }
  },

  compatibilityDate: '2024-07-11',

  vite: {
    optimizeDeps: {
      include: ['@supabase/ssr']
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  fonts: {
    provider: 'local',
    families: [{
      name: 'Instrument Sans',
      provider: 'none'
    }]
  }
})
