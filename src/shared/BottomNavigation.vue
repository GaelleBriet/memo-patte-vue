<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

/**
 * Onglets de la coquille de navigation (maquette v2, section 6).
 * Seuls les onglets qui mènent à un écran existent : ni Documents ni Finances,
 * même désactivés (décision du 2026-08-15, `docs/product/decisions-log.md`).
 */
const tabs = [
  { route: 'home', icon: 'ms:home', label: 'nav.home' },
  { route: 'animals', icon: 'ms:pets', label: 'nav.animals' },
] as const

/**
 * Hauteur totale de la barre : la rangée d'onglets de 56 px (défaut Vuetify)
 * plus la zone de gestes Android de 22 px (`$padding-bottom-nav` de
 * `src/styles/_tokens.scss`, appliquée en padding ci-dessous). Tout est en
 * `box-sizing: border-box` : le filet supérieur d'1 px est compris dans ces
 * 78 px, la rangée visible fait donc 55 px. Le layout de `VApp` décale `VMain`
 * de cette hauteur : rien ne passe sous la barre.
 */
const barHeight = 56 + 22
</script>

<template>
  <v-bottom-navigation
    class="bottom-navigation"
    tag="nav"
    :aria-label="t('nav.ariaLabel')"
    :height="barHeight"
    :elevation="0"
    bg-color="surface"
    color="primary"
    grow
  >
    <v-btn v-for="tab in tabs" :key="tab.route" :to="{ name: tab.route }" :value="tab.route">
      <v-icon :icon="tab.icon" />
      <span>{{ t(tab.label) }}</span>
    </v-btn>
  </v-bottom-navigation>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.bottom-navigation {
  // Barre pleine largeur posée sur le bas de l'écran : fond crème (`surface`),
  // filet supérieur, et la zone de gestes Android réservée sous les onglets.
  border-top: 1px solid tokens.$color-divider;
  padding-bottom: tokens.$padding-bottom-nav;
}

.bottom-navigation :deep(.v-btn) {
  letter-spacing: normal;
}

// Onglet inactif : gris chaud, libellé en 500. L'onglet actif prend le pétrole
// (`color`). Les deux règles s'excluent, elles ne dépendent pas de leur ordre.
.bottom-navigation :deep(.v-btn:not(.v-btn--selected)) {
  color: tokens.$color-text-secondary;
  font-weight: 500;
}

.bottom-navigation :deep(.v-btn--selected) {
  font-weight: 700;
}
</style>
