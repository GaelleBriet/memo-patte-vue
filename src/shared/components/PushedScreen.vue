<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'

import { useFixedBottomBar } from '../composables/use-fixed-bottom-bar'

withDefaults(
  defineProps<{
    title: string
    backLabel: string
    subtitle?: string | null
    subtitleTone?: 'hint' | 'secondary'
  }>(),
  { subtitle: null, subtitleTone: 'hint' },
)

const emit = defineEmits<{
  back: []
}>()

defineSlots<{
  default(): unknown
  /** Au bout de la ligne du titre (menu ⋮). */
  end?(): unknown
  actions?(): unknown
}>()

const isScrolled = ref(false)
const topbar = ref<HTMLElement | null>(null)
const topbarHeight = ref(0)
let observer: ResizeObserver | null = null
const actions = shallowRef<HTMLElement | null>(null)

useFixedBottomBar(actions)

onMounted(() => {
  if (!topbar.value) return
  const element = topbar.value
  observer = new ResizeObserver(() => {
    topbarHeight.value = Math.ceil(element.getBoundingClientRect().height)
  })
  observer.observe(element)
})

onBeforeUnmount(() => {
  observer?.disconnect()
})

function onScroll(event: Event): void {
  isScrolled.value = (event.target as HTMLElement).scrollTop > 2
}
</script>

<template>
  <div class="pushed-screen">
    <div
      class="pushed-screen__scroll"
      :style="{ '--pushed-screen-topbar-height': `${topbarHeight}px` }"
      @scroll="onScroll"
    >
      <header
        ref="topbar"
        class="pushed-screen__topbar"
        :class="{
          'pushed-screen__topbar--scrolled': isScrolled,
          'pushed-screen__topbar--with-subtitle': Boolean(subtitle),
        }"
      >
        <div class="pushed-screen__line">
          <v-btn
            class="pushed-screen__back"
            icon="ms:arrow_back"
            variant="text"
            color="primary"
            :aria-label="backLabel"
            @click="emit('back')"
          />
          <h1 class="pushed-screen__title">{{ title }}</h1>
          <div v-if="$slots.end" class="pushed-screen__end">
            <slot name="end" />
          </div>
        </div>
        <p
          v-if="subtitle"
          class="pushed-screen__subtitle"
          :class="{ 'pushed-screen__subtitle--secondary': subtitleTone === 'secondary' }"
        >
          {{ subtitle }}
        </p>
      </header>

      <slot />
    </div>

    <footer v-if="$slots.actions" ref="actions" class="pushed-screen__actions">
      <slot name="actions" />
    </footer>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.pushed-screen {
  display: flex;
  flex-direction: column;
  // `height: 100%` ne se résout pas dans `v-main` ; `vh` sert de repli aux WebView antérieures à `dvh`.
  height: calc(100vh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  height: calc(100dvh - var(--v-layout-top, 0px) - var(--v-layout-bottom, 0px));
  overflow: hidden;
  background: rgb(var(--v-theme-background));
}

.pushed-screen__scroll {
  flex: 1 1 auto;
  overflow-y: auto;
  // Hauteur mesurée de la top bar collée : un champ focalisé s'arrête sous elle, pas dessous.
  scroll-padding-top: var(--pushed-screen-topbar-height, 0px);
}

$gap-back: 4px;
$padding-topbar-block: 6px;
$font-size-title: 22px;
$line-height-title-with-subtitle: 1.2;

.pushed-screen__topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  flex-direction: column;
  padding: $padding-topbar-block 12px;
  background: rgb(var(--v-theme-background));
  border-bottom: 1px solid transparent;
}

.pushed-screen__line {
  display: flex;
  align-items: center;
  gap: $gap-back;
  min-width: 0;
}

.pushed-screen__topbar--scrolled {
  border-bottom-color: tokens.$color-actions-border;
  box-shadow: 0 1px 3px rgb(30 25 20 / 6%);
}

$size-back: 48px;

.pushed-screen__back {
  flex: 0 0 auto;
  width: $size-back;
  height: $size-back;
}

// La flèche déborde de la ligne du titre au lieu de la hausser : le sous-titre se colle au titre.
.pushed-screen__topbar--with-subtitle {
  padding-top: $padding-topbar-block +
    ($size-back - $font-size-title * $line-height-title-with-subtitle) * 0.5;
}

.pushed-screen__topbar--with-subtitle .pushed-screen__back {
  margin-block: -$size-back * 0.5;
}

.pushed-screen__topbar--with-subtitle .pushed-screen__end {
  margin-block: -$size-back * 0.5;
}

.pushed-screen__end {
  display: flex;
  flex: 0 0 auto;
  margin-inline-start: auto;
}

// Le titre et le sous-titre sont sur deux lignes flex, dont les marges ne se
// fusionnent plus : l'écart se pose ici, comme sur les headers Accueil et Carnet.
.pushed-screen__title {
  margin-block: 0;
  min-width: 0;
  overflow: hidden;
  font-family: tokens.$font-family-heading;
  font-size: $font-size-title;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pushed-screen__topbar--with-subtitle .pushed-screen__title {
  line-height: $line-height-title-with-subtitle;
}

.pushed-screen__subtitle {
  // Aligné sous le titre, pas sous la flèche, comme sur la maquette du suivi de poids.
  margin: 0 0 0 $size-back + $gap-back;
  overflow: hidden;
  color: tokens.$color-hint;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pushed-screen__subtitle--secondary {
  color: tokens.$color-text-secondary;
  font-weight: 500;
}

.pushed-screen__actions {
  flex: 0 0 auto;
  background: tokens.$color-actions-surface;
  border-top: 1px solid tokens.$color-actions-border;
}
</style>
