<script setup lang="ts">
import { useRouter, type RouteLocationRaw } from 'vue-router'

const props = defineProps<{
  icon: string
  label: string
  hint?: string | null
  to: RouteLocationRaw
}>()

const router = useRouter()

function open(): void {
  void router.push(props.to)
}
</script>

<template>
  <button type="button" class="settings-row" @click="open">
    <v-icon class="settings-row__icon" :icon="icon" size="22" />
    <span class="settings-row__text">
      <span class="settings-row__label">{{ label }}</span>
      <span v-if="hint" class="settings-row__hint">{{ hint }}</span>
    </span>
    <v-icon class="settings-row__chevron" icon="ms:chevron_right" size="20" />
  </button>
</template>
