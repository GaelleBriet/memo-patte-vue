<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { animalAvatarGradientCss } from '@/shared/animal-avatar-gradient'

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
  <v-bottom-sheet
    v-model="open"
    class="animal-picker-sheet"
    content-class="animal-picker-sheet__content"
  >
    <div class="animal-picker-sheet__panel">
      <button
        type="button"
        class="animal-picker-sheet__handle"
        :aria-label="t('home.quickActions.picker.close')"
        @click="close"
      />

      <h2 class="animal-picker-sheet__title">{{ t('home.quickActions.picker.title') }}</h2>

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
    </div>
  </v-bottom-sheet>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant, et le voile comme le
// conteneur appartiennent à Vuetify. Même patron que la feuille de pesée.
.animal-picker-sheet {
  --v-overlay-opacity: #{tokens.$opacity-overlay-scrim};

  .v-overlay__scrim {
    background: tokens.$color-overlay-scrim;
  }
}

.animal-picker-sheet__content {
  margin: 0;
  overflow: visible;
  border-radius: tokens.$radius-sheet tokens.$radius-sheet 0 0;
  background: rgb(var(--v-theme-background));
  box-shadow: tokens.$shadow-sheet;
}

.animal-picker-sheet__panel {
  padding: 0 20px 24px;
}

// Zone de tap de 44 px de haut ; la pilule visible (36 × 4) reste à 12 px du bord.
.animal-picker-sheet__handle {
  position: relative;
  z-index: 1;
  display: block;
  width: 96px;
  height: 44px;
  margin: 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;
}

.animal-picker-sheet__handle::before {
  position: absolute;
  top: 12px;
  left: 50%;
  width: 36px;
  height: 4px;
  border-radius: 999px;
  background: tokens.$color-sheet-handle;
  content: '';
  transform: translateX(-50%);
}

.animal-picker-sheet__title {
  margin: -10px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 20px;
  font-weight: 700;
  line-height: 1.2;
}

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
