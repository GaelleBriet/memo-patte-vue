<script setup lang="ts">
defineProps<{ label: string }>()

defineEmits<{ click: [] }>()
</script>

<template>
  <button class="google-button" type="button" @click="$emit('click')">
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 01-1.8 2.72v2.26h2.9c1.7-1.57 2.7-3.88 2.7-6.62z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.9-2.26c-.8.54-1.83.86-3.06.86-2.35 0-4.34-1.59-5.05-3.72H.96v2.33A9 9 0 009 18z"
      />
      <path
        fill="#FBBC05"
        d="M3.95 10.7A5.4 5.4 0 013.66 9c0-.59.1-1.16.29-1.7V4.97H.96A9 9 0 000 9c0 1.45.35 2.83.96 4.03l2.99-2.33z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.51.46 3.44 1.35l2.58-2.58A9 9 0 009 0 9 9 0 00.96 4.97L3.95 7.3C4.66 5.17 6.65 3.58 9 3.58z"
      />
    </svg>
    <span>{{ label }}</span>
  </button>
</template>

<style scoped lang="scss">
.google-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  width: 100%;
  height: 50px;
  border: 1px solid #747775;
  border-radius: 999px;
  background: #ffffff;
  color: #1f1f1f;
  font-size: 14.5px;
  font-weight: 600;
  cursor: pointer;
}
</style>
