<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import BottomSheet from '@/shared/components/BottomSheet.vue'

defineProps<{
  name: string
  breed: string | null
  hasPhoto: boolean
  busy?: boolean
  error?: string | null
}>()

const emit = defineEmits<{
  view: []
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
    icon="ms:photo_camera"
    :title="name"
    :subtitle="breed"
    :close-label="t('animals.carnet.photo.close')"
    :persistent="busy"
  >
    <h3 class="animal-photo-sheet__heading">{{ t('animals.carnet.photo.heading') }}</h3>
    <ul class="animal-photo-sheet__list">
      <li v-if="hasPhoto">
        <button
          type="button"
          class="animal-photo-sheet__action"
          :disabled="busy"
          @click="emit('view')"
        >
          <v-icon icon="ms:image" :size="22" />
          <span class="animal-photo-sheet__label">{{ t('animals.carnet.photo.view') }}</span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="animal-photo-sheet__action"
          :disabled="busy"
          @click="emit('change')"
        >
          <v-icon icon="ms:add_a_photo" :size="22" />
          <span class="animal-photo-sheet__text">
            <span class="animal-photo-sheet__label">
              {{ hasPhoto ? t('animals.form.photo.change') : t('animals.form.photo.add') }}
            </span>
            <span class="animal-photo-sheet__hint">{{ t('animals.carnet.photo.choose') }}</span>
          </span>
          <v-icon class="animal-photo-sheet__chevron" icon="ms:chevron_right" :size="22" />
        </button>
      </li>
      <li v-if="hasPhoto">
        <button
          type="button"
          class="animal-photo-sheet__action"
          :disabled="busy"
          @click="emit('remove')"
        >
          <v-icon icon="ms:hide_image" :size="22" />
          <span class="animal-photo-sheet__label">{{ t('animals.form.photo.remove') }}</span>
        </button>
      </li>
    </ul>

    <p v-if="error" class="animal-photo-sheet__error" role="alert">{{ error }}</p>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.animal-photo-sheet__heading {
  margin: 22px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
}

.animal-photo-sheet__list {
  margin: 12px 0 0;
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
  gap: 16px;
  width: 100%;
  min-height: tokens.$height-picker-row;
  padding: 14px 20px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
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
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.animal-photo-sheet__text {
  display: flex;
  flex: 1 1 auto;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.animal-photo-sheet__label {
  font-size: 16px;
  font-weight: 600;
}

.animal-photo-sheet__hint {
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 1.4;
}

.animal-photo-sheet__action .animal-photo-sheet__chevron {
  color: tokens.$color-text-secondary;
}

.animal-photo-sheet__error {
  margin: 12px 4px 0;
  color: rgb(var(--v-theme-error));
  font-size: 12.5px;
  font-weight: 500;
}
</style>
