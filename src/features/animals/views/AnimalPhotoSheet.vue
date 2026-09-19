<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import BottomSheet from '@/shared/components/BottomSheet.vue'

defineProps<{
  name: string
  hasPhoto: boolean
  busy?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  change: []
  remove: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
</script>

<template>
  <BottomSheet
    v-model="open"
    class="animal-photo-sheet"
    :title="t('animals.carnet.photo.sheetTitle', { name })"
    :close-label="t('animals.carnet.photo.close')"
    :persistent="busy"
  >
    <ul class="animal-photo-sheet__list">
      <li>
        <button
          type="button"
          class="animal-photo-sheet__action"
          :disabled="busy"
          @click="emit('change')"
        >
          <v-icon icon="ms:photo_camera" :size="22" />
          {{ hasPhoto ? t('animals.form.photo.change') : t('animals.form.photo.add') }}
        </button>
      </li>
      <li v-if="hasPhoto">
        <button
          type="button"
          class="animal-photo-sheet__action"
          :disabled="busy"
          @click="emit('remove')"
        >
          <v-icon icon="ms:close" :size="22" />
          {{ t('animals.form.photo.remove') }}
        </button>
      </li>
    </ul>

    <p v-if="error" class="animal-photo-sheet__error" role="alert">{{ error }}</p>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.animal-photo-sheet__list {
  margin: 14px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
  list-style: none;
}

.animal-photo-sheet__list li + li {
  border-top: 1px solid tokens.$color-divider;
}

.animal-photo-sheet__action {
  display: flex;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: tokens.$height-picker-row;
  padding: 10px 20px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  font-size: 16px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }

  &:disabled {
    color: tokens.$color-disabled-text;
    cursor: default;
  }

  .v-icon {
    color: rgb(var(--v-theme-primary));
  }
}

.animal-photo-sheet__error {
  margin: 12px 4px 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
