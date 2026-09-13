<script lang="ts">
export interface AnimalChipItem {
  id: string
  name: string
  /** URL affichable : à l'écran appelant de résoudre le `photoPath` de l'animal. */
  photoUrl?: string | null
}

/**
 * `filter` : recliquer la chip active revient à « tous les animaux » (`null`).
 * `switch` : la désélection est impossible, mais l'écran reste seul à choisir
 * l'animal actif — le composant n'en sélectionne jamais un à sa place.
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
    /** Masque la chip « + » : un formulaire choisit parmi les animaux existants. */
    hideAdd?: boolean
    /** Rangée posée dans un contenu (feuille, formulaire) : ni débord sur un header, ni marge latérale. */
    inline?: boolean
  }>(),
  { mode: 'filter', hideAdd: false, inline: false },
)

defineEmits<{
  add: []
}>()

const selectedId = defineModel<string | null>('selectedId', { default: null })

const { t } = useI18n()

function onSelect(value: unknown) {
  selectedId.value = typeof value === 'string' ? value : null
}
</script>

<template>
  <div class="animal-chip-selector" :class="{ 'animal-chip-selector--inline': inline }">
    <div class="animal-chip-selector__row">
      <v-chip-group
        class="animal-chip-selector__group"
        :model-value="selectedId ?? undefined"
        :mandatory="mode === 'switch'"
        role="group"
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
        v-if="!hideAdd"
        class="animal-chip-selector__add"
        icon="ms:add"
        variant="flat"
        color="surface"
        :aria-label="t('animals.chipSelector.add')"
        @click="$emit('add')"
      />
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

$gap-chips: 10px;
$width-chip-border: 1px;
$padding-chip-start: 5px;
$padding-chip-end: 16px;

// Le `z-index` ne passe devant qu'un header non positionné : un header qui
// remonterait le sien reste l'affaire de l'écran.
.animal-chip-selector {
  display: flow-root;
  position: relative;
  z-index: 1;
  isolation: isolate;
}

.animal-chip-selector__row {
  margin-top: tokens.$offset-chips;
  display: flex;
  align-items: center;
  gap: $gap-chips;
  padding-inline: 20px;
}

.animal-chip-selector--inline .animal-chip-selector__row {
  margin-top: 0;
  padding-inline: 0;
}

.animal-chip-selector__group {
  flex: 0 1 auto;
  min-width: 0;
  padding-block: 0;

  :deep(.v-slide-group__content) {
    gap: $gap-chips;
  }
}

.animal-chip-selector__add {
  flex: 0 0 auto;
  width: tokens.$height-chip;
  height: tokens.$height-chip;
  border: 1px dashed rgba(var(--v-theme-primary), 0.22);
  color: rgb(var(--v-theme-primary));
}

// L'avatar est un contenu libre du slot `prepend`, que la marge de VChip ne vise pas.
.animal-chip {
  gap: tokens.$gap-chip-avatar;
  height: tokens.$height-chip;
  margin: 0;
  padding-inline: $padding-chip-start $padding-chip-end;
  border: $width-chip-border solid tokens.$color-card-border;
  font-family: tokens.$font-family-body;
  font-size: 14px;
  font-weight: 700;
}

// Revenir à `selected-class` par défaut réactiverait le voile
// `--v-activated-opacity` de Vuetify, et le fond ne serait plus `primary`.
// L'anneau reste dans la chip : dessiné dehors, il serait coupé par l'`overflow:
// hidden` de VSlideGroup ; en `outline`, il masquerait l'anneau de focus clavier ;
// en bordure de 1 px + ombre intérieure, un liseré sombre sépare les deux dans les
// arrondis. La bordure passe donc à 2 px et le padding rend le pixel gagné de
// chaque côté : la chip garde sa largeur, les voisines ne bougent pas.
.animal-chip--selected {
  $grow: tokens.$width-chip-ring - $width-chip-border;

  border-width: tokens.$width-chip-ring;
  border-color: tokens.$color-on-primary;
  padding-inline: ($padding-chip-start - $grow) ($padding-chip-end - $grow);
}

.animal-chip__avatar {
  display: block;
  overflow: hidden;
  flex: 0 0 auto;
  width: tokens.$size-chip-avatar;
  height: tokens.$size-chip-avatar;
  border-radius: 50%;
  // Le contour se peint par-dessus la photo, et son retrait laisse un liseré de
  // l'avatar au bord : c'est lui qui détache le filet clair de la chip crème.
  outline: tokens.$width-chip-avatar-ring solid tokens.$color-on-primary;
  outline-offset: -(tokens.$width-chip-avatar-ring + 0.5px);
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
