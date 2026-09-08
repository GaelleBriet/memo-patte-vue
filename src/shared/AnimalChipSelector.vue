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
 * - `switch` (Carnet) : la sélection change l'animal consulté. La désélection
 *   est impossible, mais c'est à l'écran de fournir un animal actif : le
 *   composant n'en choisit jamais un à sa place, il ne connaît pas le métier.
 *   Avec `selectedId: null`, aucune chip n'est active.
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

// Écart entre chips : 10 px, mesuré sur la maquette v2 de l'accueil (≈ 17 px
// image au ratio 1,74), identique entre deux chips animal et avant la chip
// « + ». Ce n'est pas le 8 px par défaut de VChipGroup, qui est neutralisé plus
// bas. Local au composant : c'est le seul endroit qui l'utilise.
$gap-chips: 10px;

// Racine sans marge propre. Elle établit un contexte de formatage de bloc
// (`flow-root`) pour que le décalage négatif de la rangée reste à l'intérieur :
// sinon, quand le composant est le premier enfant de son conteneur, ce décalage
// fusionnerait avec la marge haute du conteneur (margin collapsing) et
// remonterait tout le parent au lieu de chevaucher le header.
//
// Empilement rendu explicite : le composant se pose devant un header non
// positionné ou en `z-index` auto / 0. `isolation: isolate` garantit en plus
// qu'il se peint d'un bloc — aucun descendant (survol Vuetify, anneau de
// sélection) ne peut s'en échapper. Un header qui remonterait son propre
// `z-index` reste l'affaire de l'écran, pas du composant.
.animal-chip-selector {
  display: flow-root;
  position: relative;
  z-index: 1;
  isolation: isolate;
}

// À cheval sur le header pétrole et le contenu clair : la rangée est posée juste
// après le header et remonte de la moitié de sa hauteur (maquettes v2, §2 de
// l'accueil et du Carnet).
.animal-chip-selector__row {
  margin-top: tokens.$offset-chips;
  display: flex;
  align-items: center;
  gap: $gap-chips;
  padding-inline: 20px;
}

// Le conteneur interne de VSlideGroup défile déjà horizontalement sans barre
// visible (`scrollbar-width: none`). Il ne doit pas s'étirer, pour que la chip
// « + » reste collée à la dernière chip animal quand la rangée n'est pas pleine.
//
// VChipGroup ajoute par défaut `padding: 4px 0` et, sur chaque chip,
// `margin: 4px 8px 4px 0` : la rangée ferait 58 px de haut au lieu de 42, et le
// débord sous le header (`$offset-chips`, calculé sur 42 px) serait faux. On les
// neutralise et on repasse par un `gap` uniforme, mesuré sur la maquette.
// Ces règles ne sont pas layerisées, elles l'emportent donc sur
// `@layer vuetify-components` quelle que soit leur spécificité.
.animal-chip-selector__group {
  flex: 0 1 auto;
  min-width: 0;
  padding-block: 0;

  :deep(.v-slide-group__content) {
    gap: $gap-chips;
  }
}

// Cercle à bordure pointillée (maquettes v2, §2), à la même hauteur que les
// chips. Trait relevé sur la maquette : 1 px, ≈ 22 % de pétrole sur la surface.
.animal-chip-selector__add {
  flex: 0 0 auto;
  width: tokens.$height-chip;
  height: tokens.$height-chip;
  border: 1px dashed rgba(var(--v-theme-primary), 0.22);
  color: rgb(var(--v-theme-primary));
}

.animal-chip {
  height: tokens.$height-chip;
  // Neutralise `margin: 4px 8px 4px 0` que VChipGroup pose sur chaque chip.
  margin: 0;
  padding-inline: 5px 16px;
  border: 1px solid tokens.$color-card-border;
  font-family: tokens.$font-family-body;
  font-size: 14px;
  font-weight: 700;
}

// Remplacer `selected-class` écarte aussi la règle Vuetify qui pose un voile
// `--v-activated-opacity` sur `.v-chip--selected` : c'est ce qui rend le fond
// exactement `primary` (#01383E), comme la maquette. À garder en tête si la
// classe de sélection change un jour.
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
