<script setup lang="ts">
import { ref } from 'vue'

withDefaults(
  defineProps<{
    title: string
    backLabel: string
    subtitle?: string | null
    subtitleTone?: 'hint' | 'secondary'
    compact?: boolean
  }>(),
  { subtitle: null, subtitleTone: 'hint', compact: false },
)

const emit = defineEmits<{
  back: []
}>()

defineSlots<{
  default(): unknown
  actions?(): unknown
}>()

const isScrolled = ref(false)

function onScroll(event: Event): void {
  isScrolled.value = (event.target as HTMLElement).scrollTop > 2
}
</script>

<template>
  <div class="pushed-screen">
    <div class="pushed-screen__scroll" @scroll="onScroll">
      <header
        class="pushed-screen__topbar"
        :class="{ 'pushed-screen__topbar--scrolled': isScrolled }"
      >
        <v-btn
          class="pushed-screen__back"
          icon="ms:arrow_back"
          variant="text"
          color="primary"
          :aria-label="backLabel"
          @click="emit('back')"
        />
        <div
          class="pushed-screen__heading"
          :class="{
            'pushed-screen__heading--with-subtitle': Boolean(subtitle),
            'pushed-screen__heading--compact': compact,
          }"
        >
          <h1 class="pushed-screen__title">{{ title }}</h1>
          <p
            v-if="subtitle"
            class="pushed-screen__subtitle"
            :class="{ 'pushed-screen__subtitle--secondary': subtitleTone === 'secondary' }"
          >
            {{ subtitle }}
          </p>
        </div>
      </header>

      <slot />
    </div>

    <footer v-if="$slots.actions" class="pushed-screen__actions">
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
}

.pushed-screen__topbar {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  background: rgb(var(--v-theme-background));
  border-bottom: 1px solid transparent;
}

.pushed-screen__topbar--scrolled {
  border-bottom-color: tokens.$color-actions-border;
  box-shadow: 0 1px 3px rgb(30 25 20 / 6%);
}

.pushed-screen__back {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
}

.pushed-screen__heading {
  min-width: 0;
}

.pushed-screen__title {
  overflow: hidden;
  font-family: tokens.$font-family-heading;
  font-size: 22px;
  font-weight: 700;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.pushed-screen__heading--with-subtitle .pushed-screen__title {
  line-height: 1.2;
}

.pushed-screen__heading--compact .pushed-screen__title,
.pushed-screen__heading--compact .pushed-screen__subtitle {
  margin: 0;
}

.pushed-screen__subtitle {
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
