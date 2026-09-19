<script setup lang="ts">
import { useI18n } from 'vue-i18n'

import { heightBottomNav, paddingBottomNav } from '@/core/theme/layout-tokens'

const { t } = useI18n()

const tabs = [
  { route: 'home', icon: 'ms:home', label: 'nav.home' },
  { route: 'animals', icon: 'ms:pets', label: 'nav.animals' },
] as const

// Onglets plus zone de gestes : Vuetify fait `Number(props.height)` pour décaler
// `VMain`, un `calc()` donnerait `NaN`, d'où les tokens en nombre.
const barHeight = heightBottomNav + paddingBottomNav
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
  border-top: 1px solid tokens.$color-divider;
  padding-bottom: tokens.$padding-bottom-nav;
}

// Vuetify plafonne un onglet à 168 px : à deux onglets, il resterait un bord mort
// de chaque côté de la barre, que la maquette n'a pas.
.bottom-navigation :deep(.v-btn) {
  flex: 1 1 0;
  max-width: none;
  font-size: 12px;
  letter-spacing: normal;
}

// Pas de voile Vuetify sur un onglet (sélection, survol, focus) : la maquette n'en
// montre aucun. Le ripple reste le retour au tap, l'anneau `:focus-visible` celui du clavier.
.bottom-navigation :deep(.v-btn__overlay) {
  display: none;
}

.bottom-navigation :deep(.v-btn:not(.v-btn--selected)) {
  color: tokens.$color-text-secondary;
  font-weight: 500;
}

.bottom-navigation :deep(.v-btn--selected) {
  font-weight: 700;
}
</style>
