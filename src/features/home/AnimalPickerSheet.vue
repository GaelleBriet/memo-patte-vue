<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { animalAvatarGradientCss } from '@/shared/animal-avatar-gradient'
import BottomSheet from '@/shared/BottomSheet.vue'

export type AnimalPickerItem = {
  id: string
  name: string
}

defineProps<{
  animals: readonly AnimalPickerItem[]
}>()

const emit = defineEmits<{
  pick: [animalId: string]
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()

function close(): void {
  open.value = false
}

function pick(animalId: string): void {
  close()
  emit('pick', animalId)
}
</script>

<template>
  <BottomSheet
    v-model="open"
    class="animal-picker-sheet"
    :title="t('home.quickActions.picker.title')"
    :close-label="t('home.quickActions.picker.close')"
  >
    <ul class="animal-picker-sheet__list">
      <li v-for="animal in animals" :key="animal.id">
        <button type="button" class="animal-picker-sheet__animal" @click="pick(animal.id)">
          <span
            class="animal-picker-sheet__avatar"
            :style="{ backgroundImage: animalAvatarGradientCss(animal.id) }"
          />
          <span class="animal-picker-sheet__name">{{ animal.name }}</span>
        </button>
      </li>
    </ul>
  </BottomSheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

.animal-picker-sheet__list {
  margin: 14px 0 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
  list-style: none;
}

.animal-picker-sheet__list li + li {
  border-top: 1px solid tokens.$color-divider;
}

.animal-picker-sheet__animal {
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
  text-align: start;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: rgb(var(--v-theme-primary) / 6%);
  }
}

.animal-picker-sheet__avatar {
  flex: 0 0 auto;
  width: tokens.$size-picker-avatar;
  height: tokens.$size-picker-avatar;
  border-radius: 50%;
}

.animal-picker-sheet__name {
  font-size: 15.5px;
  font-weight: 700;
}
</style>
