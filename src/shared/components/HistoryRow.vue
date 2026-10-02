<script setup lang="ts">
import OverflowMenu, { type OverflowMenuItem } from './OverflowMenu.vue'

withDefaults(
  defineProps<{
    date: string
    detail?: string | null
    badge?: string | null
    /** Date en poids normal : une prise précédente, sous la dernière mise en avant. */
    regular?: boolean
    /** Ligne discrète, en gris : une prise oubliée, un report. */
    muted?: boolean
    /** Icône avant le texte d'une ligne discrète. */
    icon?: string | null
    /** Nom du menu ⋮ de la ligne, date en toutes lettres. */
    optionsLabel: string
    /** Vide : la ligne n'a pas de menu. */
    items: readonly OverflowMenuItem[]
  }>(),
  { detail: null, badge: null, regular: false, muted: false, icon: null },
)

const emit = defineEmits<{
  select: [id: string]
}>()
</script>

<template>
  <div class="history-row">
    <v-icon v-if="icon" class="history-row__icon" :icon="icon" size="22" />
    <div class="history-row__text">
      <p class="history-row__line">
        <span
          class="history-row__date"
          :class="{ 'history-row__date--regular': regular, 'history-row__date--muted': muted }"
          >{{ date }}</span
        >
        <span v-if="badge" class="history-row__badge">{{ badge }}</span>
      </p>
      <p v-if="detail" class="history-row__detail">{{ detail }}</p>
    </div>
    <OverflowMenu
      v-if="items.length > 0"
      :label="optionsLabel"
      :items="items"
      @select="emit('select', $event)"
    />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.history-row {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: tokens.$height-weight-row;
  padding: 0 6px 0 20px;
}

.history-row:has([aria-expanded='true']) {
  background: tokens.$color-history-row-active;
}

.history-row + .history-row {
  border-top: 1px solid tokens.$color-divider;
}

.history-row__text {
  flex: 1 1 auto;
  min-width: 0;
  padding-block: 16px;
}

.history-row__line {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 4px 10px;
  margin: 0;
}

.history-row__date {
  font-size: 15.5px;
  font-weight: 700;
  line-height: 24px;
}

.history-row__date--regular {
  font-weight: 500;
}

.history-row__date--muted {
  color: tokens.$color-text-secondary;
  font-weight: 500;
}

.history-row__icon {
  flex: 0 0 auto;
  margin-inline-end: 4px;
  color: tokens.$color-text-secondary;
}

.history-row__badge {
  padding: 2px 10px;
  border-radius: tokens.$radius-pill;
  background: tokens.$color-last-dose-surface;
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 700;
}

.history-row__detail {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
  line-height: 20px;
}
</style>
