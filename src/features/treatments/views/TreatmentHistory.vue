<script setup lang="ts">
import { computed, ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type {
  DoseLineAction,
  DoseRow,
  HistoryPeriod,
  TreatmentHistory,
} from '../logic/treatment-history'
import HistoryRow from '@/shared/components/HistoryRow.vue'
import type { OverflowMenuItem } from '@/shared/components/OverflowMenu.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import type { MoveBounds } from '@/shared/domain/treatment-schedule'

defineProps<{ history: TreatmentHistory }>()

const emit = defineEmits<{
  select: [row: DoseRow, action: DoseLineAction, bounds: MoveBounds | null]
}>()

const { t } = useI18n()

const menu = computed<Record<DoseLineAction, Omit<OverflowMenuItem, 'id'>>>(() => ({
  'change-date': { label: t('history.changeDate'), icon: 'ms:edit_calendar' },
  'mark-missed': { label: t('treatments.history.menu.markMissed'), icon: 'ms:event_busy' },
  'mark-given': { label: t('treatments.history.menu.markGiven'), icon: 'ms:event_available' },
  remove: { label: t('treatments.detail.remove'), icon: 'ms:delete', danger: true },
  'remove-move': {
    label: t('treatments.history.menu.removeMove'),
    icon: 'ms:delete',
    danger: true,
  },
}))

function itemsOf(actions: DoseLineAction[]): OverflowMenuItem[] {
  return actions.map((id) => ({ ...menu.value[id], id }))
}

const openPeriods = ref<string[]>([])
const openGroups = ref<string[]>([])

function toggled(list: string[], id: string): string[] {
  return list.includes(id) ? list.filter((open) => open !== id) : [...list, id]
}

function shownLines(period: HistoryPeriod) {
  return openPeriods.value.includes(period.id)
    ? period.lines
    : period.lines.slice(0, period.visibleLines)
}

function select(row: DoseRow, action: string, bounds: MoveBounds | null = null): void {
  emit('select', row, action as DoseLineAction, bounds)
}
</script>

<template>
  <SectionCard
    class="treatment-history"
    :title="t('treatments.detail.doses')"
    :counter="history.counter"
  >
    <template v-for="period in history.periods" :key="period.id">
      <div v-if="period.head" class="treatment-history__item treatment-history__head">
        <v-icon icon="ms:date_range" size="22" />
        <div>
          <p class="treatment-history__head-title">{{ period.head.title }}</p>
          <p class="treatment-history__head-settings">{{ period.head.settings }}</p>
        </div>
      </div>

      <p v-if="period.emptyText" class="treatment-history__item treatment-history__empty">
        {{ period.emptyText }}
      </p>

      <template v-for="line in shownLines(period)" :key="line.dose.id">
        <HistoryRow
          v-if="line.kind === 'given'"
          class="treatment-history__item"
          :date="line.title"
          :badge="line.isLast ? t('treatments.detail.last') : null"
          :detail="line.detail"
          :options-label="line.optionsLabel"
          :items="itemsOf(line.actions)"
          @select="select(line, $event)"
        />
        <HistoryRow
          v-else-if="line.kind === 'move'"
          class="treatment-history__item treatment-history__move"
          muted
          icon="ms:event_repeat"
          :date="line.title"
          :options-label="line.optionsLabel"
          :items="itemsOf(line.actions)"
          @select="select(line, $event, line.bounds)"
        />
        <HistoryRow
          v-else-if="line.rows.length === 1"
          class="treatment-history__item treatment-history__missed"
          muted
          :date="line.title"
          :options-label="line.optionsLabel"
          :items="itemsOf(line.actions)"
          @select="select(line, $event)"
        />
        <template v-else>
          <button
            type="button"
            class="treatment-history__item treatment-history__group"
            :aria-expanded="openGroups.includes(line.dose.id)"
            @click="openGroups = toggled(openGroups, line.dose.id)"
          >
            <span>{{ line.title }}</span>
            <v-icon
              :icon="
                openGroups.includes(line.dose.id)
                  ? 'ms:keyboard_arrow_up'
                  : 'ms:keyboard_arrow_down'
              "
              size="22"
            />
          </button>
          <template v-if="openGroups.includes(line.dose.id)">
            <HistoryRow
              v-for="row in line.rows"
              :key="row.dose.id"
              class="treatment-history__item treatment-history__missed"
              muted
              :date="row.title"
              :options-label="row.optionsLabel"
              :items="itemsOf(row.actions)"
              @select="select(row, $event)"
            />
          </template>
        </template>
      </template>

      <button
        v-if="period.toggle"
        type="button"
        class="treatment-history__item treatment-history__toggle"
        :aria-expanded="openPeriods.includes(period.id)"
        @click="openPeriods = toggled(openPeriods, period.id)"
      >
        <span>{{ openPeriods.includes(period.id) ? period.toggle.hide : period.toggle.show }}</span>
        <v-icon
          :icon="
            openPeriods.includes(period.id) ? 'ms:keyboard_arrow_up' : 'ms:keyboard_arrow_down'
          "
          size="22"
        />
      </button>
    </template>
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-history__head {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  background: tokens.$color-history-period-surface;

  .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-history__head-title {
  margin: 0;
  font-size: 15px;
  font-weight: 700;
}

.treatment-history__head-settings {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13.5px;
}

.treatment-history__empty {
  display: flex;
  align-items: center;
  min-height: tokens.$height-add-row;
  margin: 0;
  padding: 0 20px;
  color: tokens.$color-text-secondary;
  font-size: 14.5px;
}

.treatment-history__group,
.treatment-history__toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
  min-height: tokens.$height-weight-row;
  padding: 0 20px;
  border: 0;
  background: transparent;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    background: rgba(var(--v-theme-primary), 0.06);
  }
}

.treatment-history__group {
  padding-inline-end: 19px;
  color: tokens.$color-text-secondary;
  font-size: 15.5px;
  font-weight: 500;

  .v-icon {
    color: tokens.$color-text-secondary;
  }
}

.treatment-history__toggle {
  min-height: tokens.$height-add-row;
  color: rgb(var(--v-theme-primary));
  font-size: 15px;
  font-weight: 700;
}

.treatment-history__item + .treatment-history__item {
  border-top: 1px solid tokens.$color-divider;
}
</style>
