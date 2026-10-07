<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ count: number }>()

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
</script>

<template>
  <button type="button" class="unfollowed-animals-link" @click="emit('open')">
    <v-icon icon="ms:pets" size="20" />
    <span class="unfollowed-animals-link__label">
      {{ t('unfollowedAnimalsLink.label', { n: count }) }}
    </span>
    <v-icon icon="ms:chevron_right" size="22" />
  </button>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.unfollowed-animals-link {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  font-size: 13px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}

.unfollowed-animals-link__label {
  flex: 1 1 auto;
}
</style>
