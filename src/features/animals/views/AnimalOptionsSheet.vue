<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import BottomSheet from '@/shared/components/BottomSheet.vue'

defineProps<{
  name: string
  subtitle: string | null
  /** Faux pour un animal qu'on ne suit plus : « Suivre de nouveau » remplace « Ne plus suivre ». */
  followed: boolean
  busy?: boolean
}>()

const emit = defineEmits<{
  unfollow: []
  follow: []
  delete: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
</script>

<template>
  <BottomSheet
    v-model="open"
    class="animal-options-sheet"
    icon="ms:pets"
    :title="name"
    :subtitle="subtitle"
    :close-label="t('animals.carnet.options.close')"
    :persistent="busy"
  >
    <h3 class="animal-options-sheet__heading">{{ t('animals.carnet.options.title') }}</h3>
    <ul class="animal-options-sheet__list">
      <li>
        <button
          v-if="followed"
          type="button"
          class="animal-options-sheet__action"
          :disabled="busy"
          @click="emit('unfollow')"
        >
          <v-icon icon="ms:visibility_off" :size="22" />
          <span class="animal-options-sheet__text">
            <span class="animal-options-sheet__label">
              {{ t('animals.carnet.options.unfollow', { name }) }}
            </span>
            <span class="animal-options-sheet__hint">
              {{ t('animals.carnet.options.unfollowHint', { name }) }}
            </span>
          </span>
        </button>
        <button
          v-else
          type="button"
          class="animal-options-sheet__action"
          :disabled="busy"
          @click="emit('follow')"
        >
          <v-icon icon="ms:notifications_active" :size="22" />
          <span class="animal-options-sheet__label">
            {{ t('animals.carnet.options.follow', { name }) }}
          </span>
        </button>
      </li>
      <li>
        <button
          type="button"
          class="animal-options-sheet__action animal-options-sheet__action--danger"
          :disabled="busy"
          @click="emit('delete')"
        >
          <v-icon icon="ms:delete" :size="22" />
          <span class="animal-options-sheet__label">
            {{ t('animals.carnet.options.delete', { name }) }}
          </span>
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.animal-options-sheet__heading {
  margin: 22px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
}

.animal-options-sheet__list {
  margin: 12px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
  list-style: none;
}

.animal-options-sheet__list li + li {
  border-top: 1px solid tokens.$color-divider;
}

.animal-options-sheet__action {
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

.animal-options-sheet__action--danger:not(:disabled),
.animal-options-sheet__action--danger:not(:disabled) .v-icon {
  color: rgb(var(--v-theme-error));
}

.animal-options-sheet__text {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
}

.animal-options-sheet__label {
  font-size: 16px;
  font-weight: 600;
}

.animal-options-sheet__hint {
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 1.4;
}
</style>
