<script lang="ts">
export type OverflowMenuItem = {
  id: string
  label: string
  icon: string
  /** Action destructive, en couleur système d'erreur. */
  danger?: boolean
}
</script>

<script setup lang="ts">
import { nextTick, onScopeDispose, ref, useTemplateRef, watch } from 'vue'

import { onBackButton } from '@/core/app-lifecycle/back-button'

defineProps<{
  /** Nom du bouton ⋮ lu par le lecteur d'écran. */
  label: string
  items: readonly OverflowMenuItem[]
}>()

const emit = defineEmits<{
  select: [id: string]
}>()

const isOpen = ref(false)
const button = useTemplateRef<{ $el: HTMLElement }>('button')
const list = useTemplateRef<{ $el: HTMLElement }>('list')
let releaseBackButton: (() => void) | null = null

function releaseBack(): void {
  releaseBackButton?.()
  releaseBackButton = null
}

onScopeDispose(releaseBack)

function focusButton(): void {
  button.value?.$el.focus({ preventScroll: true })
}

function focusFirstItem(): void {
  list.value?.$el.querySelector<HTMLElement>('[role="menuitem"]')?.focus({ preventScroll: true })
}

// Le focus ne revient au bouton que s'il était resté dans le menu : un choix a déjà pu le déplacer.
watch(isOpen, async (open) => {
  releaseBack()
  if (open) {
    releaseBackButton = onBackButton(() => (isOpen.value = false))
    await nextTick()
    focusFirstItem()
    return
  }
  const active = document.activeElement
  if (active === null || active === document.body || list.value?.$el.contains(active)) {
    focusButton()
  }
})

function choose(id: string): void {
  isOpen.value = false
  focusButton()
  emit('select', id)
}
</script>

<template>
  <v-menu
    v-model="isOpen"
    location="bottom end"
    content-class="overflow-menu"
    @after-enter="focusFirstItem"
  >
    <template #activator="{ props: activator }">
      <v-btn
        v-bind="activator"
        ref="button"
        class="overflow-menu__button"
        icon="ms:more_vert"
        variant="text"
        :aria-label="label"
      />
    </template>
    <v-list ref="list" class="overflow-menu__list" role="menu">
      <v-list-item
        v-for="item in items"
        :key="item.id"
        class="overflow-menu__item"
        :class="{ 'overflow-menu__item--danger': item.danger }"
        role="menuitem"
        @click="choose(item.id)"
      >
        <template #prepend>
          <v-icon class="overflow-menu__icon" :icon="item.icon" size="22" />
        </template>
        <v-list-item-title class="overflow-menu__label">{{ item.label }}</v-list-item-title>
      </v-list-item>
    </v-list>
  </v-menu>
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : le menu est téléporté hors du composant.
.overflow-menu__button {
  width: tokens.$size-tap-target;
  height: tokens.$size-tap-target;
  color: tokens.$color-text-secondary;
}

// Le menu ouvert dit déjà l'état : le bouton ne garde pas de voile actif.
.overflow-menu__button[aria-expanded='true'] > .v-btn__overlay {
  opacity: 0;
}

.overflow-menu__list.v-list {
  min-width: 220px;
  padding-block: 6px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-notice;
  background: rgb(var(--v-theme-surface));
  box-shadow: tokens.$shadow-menu;
}

.overflow-menu__item.v-list-item {
  min-height: tokens.$size-tap-target;
  padding-inline: 16px 20px;
}

.overflow-menu__item .v-list-item__spacer {
  width: 14px;
}

.overflow-menu__icon {
  color: rgb(var(--v-theme-primary));
  opacity: 1;
}

.overflow-menu__label.v-list-item-title {
  font-size: 15.5px;
  font-weight: 600;
  line-height: 1.3;
  white-space: normal;
}

.overflow-menu__item--danger .overflow-menu__icon,
.overflow-menu__item--danger .overflow-menu__label {
  color: rgb(var(--v-theme-error));
}
</style>
