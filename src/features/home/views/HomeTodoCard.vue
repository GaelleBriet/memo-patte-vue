<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import type { ReminderRow } from '../logic/home-summary'

const props = defineProps<{
  rows: ReminderRow[]
  counter: string | null
  banner: string | null
  nextReminder: string | null
  upToDate: string
}>()

const emit = defineEmits<{
  open: [row: ReminderRow]
  add: []
}>()

const { t } = useI18n()

const dueRows = computed(() => props.rows.filter((row) => row.group === 'due'))
const toLogRows = computed(() => props.rows.filter((row) => row.group === 'to-log'))
</script>

<template>
  <SectionCard class="home-todo" :title="t('home.todo.title')" :counter="counter">
    <template #intro>
      <div v-if="banner" class="home-overdue-banner" role="status">
        <v-icon icon="ms:error" size="20" />
        <span>{{ banner }}</span>
      </div>

      <div v-if="rows.length === 0" class="home-up-to-date">
        <div class="home-up-to-date__row">
          <span class="home-up-to-date__dot">
            <v-icon icon="ms:check" size="24" />
          </span>
          <div>
            <p class="home-up-to-date__title">{{ t('home.upToDate.title') }}</p>
            <p v-if="nextReminder" class="home-up-to-date__next">{{ nextReminder }}</p>
            <p v-else class="home-up-to-date__text">{{ upToDate }}</p>
          </div>
        </div>
        <button type="button" class="home-up-to-date__add" @click="emit('add')">
          <v-icon icon="ms:add" size="20" />
          <span>{{ t('home.upToDate.add') }}</span>
        </button>
      </div>
    </template>

    <template v-if="rows.length > 0" #default>
      <template v-for="(group, index) in [dueRows, toLogRows]" :key="index">
        <h3 v-if="index === 1 && group.length > 0" class="home-todo__group">
          {{ t('home.todo.toLog') }}
        </h3>
        <button
          v-for="row in group"
          :key="row.key"
          type="button"
          class="section-card__row reminder-row"
          :class="`reminder-row--${row.tone}`"
          :aria-label="row.ariaLabel"
          @click="emit('open', row)"
        >
          <v-icon class="reminder-row__icon" :icon="row.icon" size="24" />
          <span class="reminder-row__text">
            <span class="reminder-row__title">{{ row.title }}</span>
            <span class="reminder-row__subtitle">{{ row.subtitle }}</span>
            <span v-if="row.unlogged" class="reminder-row__unlogged">
              <v-icon icon="ms:pending_actions" size="15" />
              <span>{{ row.unlogged }}</span>
            </span>
          </span>
          <span class="reminder-row__end">
            <DueStatusChip
              class="reminder-row__badge"
              :status="row.badge.status"
              :label="row.badge.text"
              :icon="row.badge.icon"
            />
            <v-icon class="reminder-row__chevron" icon="ms:chevron_right" size="22" />
          </span>
        </button>
      </template>
    </template>
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.home-overdue-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: 14px;
  background: rgb(var(--v-theme-overdue-container));
  color: rgb(var(--v-theme-on-overdue-container));
  font-size: 13.5px;
  font-weight: 700;
}

.home-todo__group {
  margin: 0;
  padding: 14px 20px 6px;
  border-top: 1px solid tokens.$color-divider;
  background: tokens.$color-to-log-group-surface;
  color: tokens.$color-text-secondary;
  font-size: 11.5px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.home-todo__group:first-child {
  border-top: 0;
}

.reminder-row {
  // Sous 380 px, un titre d'un seul mot long et un badge d'échéance ne tiennent
  // pas côte à côte : le badge passe dessous plutôt que le mot soit coupé en deux.
  flex-wrap: wrap;
  gap: 14px;
  width: 100%;
  padding-inline-end: 12px;
  border: 0;
  background: transparent;
  color: inherit;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  @media (hover: hover) {
    &:hover {
      background: rgba(var(--v-theme-primary), 0.04);
    }
  }

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.reminder-row + .reminder-row {
  border-top: 1px solid tokens.$color-divider;
}

.reminder-row__end {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.reminder-row__badge {
  margin-inline-start: auto;
}

.reminder-row__chevron {
  flex: 0 0 auto;
  color: tokens.$color-settings-chevron;
}

.reminder-row--overdue::before {
  background: rgb(var(--v-theme-overdue));
}

.reminder-row--today::before {
  background: rgb(var(--v-theme-today));
}

.reminder-row--tomorrow::before,
.reminder-row--later::before {
  background: rgb(var(--v-theme-soon));
}

.reminder-row--planned::before,
.reminder-row--to-log::before {
  background: tokens.$color-unlogged-border;
}

.reminder-row--unreadable::before {
  background: tokens.$color-badge-frequency-border;
}

.reminder-row__icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.reminder-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.reminder-row__title {
  display: block;
  margin: 0;
  // `anywhere` ramenait la largeur minimale du titre à zéro : la colonne cédait au
  // badge et coupait « Antiparasitaire » en deux dès 360 px.
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.reminder-row__subtitle {
  display: block;
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.reminder-row__unlogged {
  // Sans largeur propre, la ligne ne pousse pas le badge sous le titre : elle se replie dans la colonne.
  display: flex;
  width: 0;
  min-width: 100%;
  align-items: center;
  gap: 4px;
  margin-top: 3px;
  color: rgb(var(--v-theme-primary));
  font-size: 12.5px;
  font-weight: 600;
}

.home-up-to-date__row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.home-up-to-date__dot {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: tokens.$size-status-dot;
  height: tokens.$size-status-dot;
  border-radius: 50%;
  background: rgb(var(--v-theme-up-to-date));
  color: rgb(var(--v-theme-on-up-to-date));
}

.home-up-to-date__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 18px;
  font-weight: 700;
}

.home-up-to-date__text,
.home-up-to-date__next {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.home-up-to-date__add {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  @include tap.tap-target;

  @media (hover: hover) {
    &:hover {
      color: rgb(var(--v-theme-primary-darken-1));
    }
  }

  &:focus-visible {
    color: rgb(var(--v-theme-primary-darken-1));
  }
}
</style>
