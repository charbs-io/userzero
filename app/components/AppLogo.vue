<script setup lang="ts">
withDefaults(defineProps<{
  showText?: boolean
  compact?: boolean
}>(), {
  showText: true,
  compact: false
})
</script>

<template>
  <div class="inline-flex min-w-0 items-center gap-2.5">
    <span
      class="inline-grid shrink-0 place-items-center rounded-lg bg-neutral-950 text-white shadow-sm ring-1 ring-neutral-900/10 dark:bg-white dark:text-neutral-950 dark:ring-white/10"
      :class="compact ? 'size-8' : 'size-9'"
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        :class="compact ? 'size-5' : 'size-6'"
      >
        <path
          d="M16 4.75L24.25 8V15.25C24.25 20.42 20.76 24.88 16 26.25C11.24 24.88 7.75 20.42 7.75 15.25V8L16 4.75Z"
          stroke="currentColor"
          stroke-width="2"
          stroke-linejoin="round"
        />
        <path
          d="M12.25 16.25L15 19L20.5 12.75"
          stroke="currentColor"
          stroke-width="2.2"
          stroke-linecap="round"
          stroke-linejoin="round"
        />
        <circle
          cx="22.5"
          cy="8.5"
          r="3"
          fill="#22D3EE"
        />
      </svg>
    </span>

    <span
      v-if="showText"
      class="truncate text-base font-semibold tracking-normal text-default"
    >
      Product Warden
    </span>
  </div>
</template>
