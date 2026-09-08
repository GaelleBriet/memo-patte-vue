<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()

const tabs = [
  { route: 'home', icon: 'ms:home', label: 'nav.home' },
  { route: 'animals', icon: 'ms:pets', label: 'nav.animals' },
] as const

// 56 px d'onglets plus les 22 px de `$padding-bottom-nav` : Vuetify fait
// `Number(props.height)` pour décaler `VMain`, un `calc()` donnerait `NaN`.
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
  border-top: 1px solid tokens.$color-divider;
  padding-bottom: tokens.$padding-bottom-nav;
}

.bottom-navigation :deep(.v-btn) {
  letter-spacing: normal;
}

.bottom-navigation :deep(.v-btn:not(.v-btn--selected)) {
  color: tokens.$color-text-secondary;
  font-weight: 500;
}

.bottom-navigation :deep(.v-btn--selected) {
  font-weight: 700;
}
</style>
