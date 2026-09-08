<script lang="ts">
/**
 * Ce qu'une chip a besoin de savoir d'un animal. Sous-ensemble structurel du
 * type `Animal` : un `Animal[]` s'y passe tel quel, sans que `shared/` dépende
 * de la feature `animals`.
 */
export interface AnimalChipItem {
  id: string
  name: string
  /**
   * URL affichable de la photo. Le type `Animal` porte un `photoPath` (nom de
   * fichier sous `files/photos/`) : c'est à l'écran appelant de le résoudre en
   * URL (ticket #101). Tant qu'il n'y en a pas, l'avatar affiche un dégradé.
   */
  photoUrl?: string | null
}

/**
 * Comportement de la sélection :
 * - `filter` (accueil) : la chip active peut être re-cliquée pour revenir à
 *   « tous les animaux » — la sélection retombe alors à `null` ;
 * - `switch` (Carnet) : la sélection change l'animal consulté, il y en a
 *   toujours un d'actif.
 */
export type AnimalChipSelectorMode = 'filter' | 'switch'
</script>

<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { animalAvatarGradientCss } from './animal-avatar-gradient'

withDefaults(
  defineProps<{
    animals: readonly AnimalChipItem[]
    mode?: AnimalChipSelectorMode
  }>(),
  { mode: 'filter' },
)

defineEmits<{
  /** Clic sur la chip « + ». */
  add: []
}>()

const selectedId = defineModel<string | null>('selectedId', { default: null })

const { t } = useI18n()

function onSelect(value: unknown) {
  selectedId.value = typeof value === 'string' ? value : null
}
</script>

<template>
  <div class="animal-chip-selector">
    <v-chip-group
      class="animal-chip-selector__group"
      :model-value="selectedId ?? undefined"
      :mandatory="mode === 'switch'"
      :aria-label="t('animals.chipSelector.label')"
      variant="flat"
      base-color="surface"
      color="primary"
      selected-class="animal-chip--selected"
      @update:model-value="onSelect"
    >
      <v-chip v-for="animal in animals" :key="animal.id" class="animal-chip" :value="animal.id">
        <template #prepend>
          <span
            class="animal-chip__avatar"
            :style="{ backgroundImage: animalAvatarGradientCss(animal.id) }"
          >
            <img
              v-if="animal.photoUrl"
              :src="animal.photoUrl"
              :alt="t('animals.chipSelector.photoAlt', { name: animal.name })"
            />
          </span>
        </template>
        <span class="animal-chip__name">{{ animal.name }}</span>
      </v-chip>
    </v-chip-group>

    <v-btn
      class="animal-chip-selector__add"
      icon="ms:add"
      variant="flat"
      color="surface"
      :aria-label="t('animals.chipSelector.add')"
      @click="$emit('add')"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.animal-chip-selector {
  // À cheval sur le header pétrole et le contenu clair : la rangée est posée
  // juste après le header et remonte de la moitié de sa hauteur (maquettes v2,
  // §2 de l'accueil et du Carnet).
  position: relative;
  z-index: 1;
  margin-top: tokens.$offset-chips;
  display: flex;
  align-items: center;
  gap: 10px;
  padding-inline: 20px;
}

// Le conteneur interne de VSlideGroup défile déjà horizontalement sans barre
// visible. Il ne doit pas s'étirer, pour que la chip « + » reste collée à la
// dernière chip animal quand la rangée n'est pas pleine.
.animal-chip-selector__group {
  flex: 0 1 auto;
  min-width: 0;
}

// Cercle à bordure pointillée (maquettes v2, §2), à la même hauteur que les chips.
.animal-chip-selector__add {
  flex: 0 0 auto;
  width: tokens.$height-chip;
  height: tokens.$height-chip;
  border: 2px dashed rgba(var(--v-theme-primary), 0.32);
  color: rgb(var(--v-theme-primary));
}

.animal-chip {
  height: tokens.$height-chip;
  padding-inline: 5px 16px;
  border: 1px solid tokens.$color-card-border;
  font-family: tokens.$font-family-body;
  font-size: 14px;
  font-weight: 700;
}

.animal-chip--selected {
  border-color: transparent;
  // Anneau clair de 2 px : la chip pétrole reste détachée du header pétrole.
  box-shadow: 0 0 0 2px rgb(var(--v-theme-background));
}

.animal-chip__avatar {
  display: block;
  overflow: hidden;
  flex: 0 0 auto;
  width: tokens.$size-chip-avatar;
  height: tokens.$size-chip-avatar;
  border-radius: 50%;
  background-size: cover;

  img {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.animal-chip__name {
  white-space: nowrap;
}
</style>
