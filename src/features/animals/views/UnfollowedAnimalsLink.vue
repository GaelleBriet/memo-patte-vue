<script setup lang="ts">
import { useI18n } from 'vue-i18n'

defineProps<{ count: number }>()

const emit = defineEmits<{ open: [] }>()

const { t } = useI18n()
</script>

<template>
  <button type="button" class="carnet-unfollowed-link" @click="emit('open')">
    <v-icon icon="ms:pets" size="20" />
    <span class="carnet-unfollowed-link__label">
      {{ t('animals.carnet.unfollowed.link', { n: count }) }}
    </span>
    <v-icon icon="ms:chevron_right" size="22" />
  </button>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.carnet-unfollowed-link {
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

.carnet-unfollowed-link__label {
  flex: 1 1 auto;
}
</style>
