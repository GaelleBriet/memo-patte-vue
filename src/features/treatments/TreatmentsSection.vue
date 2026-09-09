<script lang="ts">
import type { ReminderCounts } from '@/shared/reminders'

export type TreatmentsSummary = ReminderCounts & {
  /** Traitements en cours, avec ou sans rappel. */
  ongoing: number
}
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'

import { useTreatmentsStore } from './treatments.store'
import SectionCard from '@/shared/SectionCard.vue'
import { buildReminders, type Reminder, type ReminderStatus } from '@/shared/reminders'

const props = defineProps<{
  animalId: string
  /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
  today: string
}>()

const emit = defineEmits<{
  summary: [summary: TreatmentsSummary]
}>()

const { t } = useI18n()
const store = useTreatmentsStore()

// Pendant un chargement, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const treatments = computed(() =>
  store.animalId === props.animalId && !store.isLoading ? store.treatments : [],
)

const reminders = computed(() =>
  buildReminders(
    treatments.value.map((treatment) => ({
      kind: 'treatment',
      id: treatment.id,
      animalId: treatment.animalId,
      label: treatment.name,
      dueDate: treatment.nextDueDate,
    })),
    { today: props.today },
  ),
)

const rows = computed(() => {
  const byId = new Map(reminders.value.reminders.map((reminder) => [reminder.id, reminder]))
  return treatments.value.map((treatment) => {
    const reminder = byId.get(treatment.id)
    return {
      id: treatment.id,
      name: treatment.name,
      type: t(`treatments.type.${treatment.type}`),
      frequency: t(`treatments.frequency.${treatment.frequency.unit}`, treatment.frequency.value),
      urgency: urgencyOf(reminder),
      nextDose: nextDoseOf(reminder),
    }
  })
})

const summary = computed<TreatmentsSummary>(() => ({
  total: reminders.value.total,
  overdue: reminders.value.overdue,
  ongoing: treatments.value.length,
}))

// Demain et plus tard partagent la même couleur grise : seule l'urgence du jour et le retard ressortent.
function urgencyOf(reminder: Reminder | undefined): 'overdue' | 'today' | 'later' {
  const status: ReminderStatus = reminder?.status ?? 'later'
  return status === 'overdue' || status === 'today' ? status : 'later'
}

function nextDoseOf(reminder: Reminder | undefined): string | null {
  if (!reminder) return null
  switch (reminder.status) {
    case 'overdue':
      return t('treatments.section.nextDose.overdue', { n: -reminder.daysUntil })
    case 'today':
      return t('treatments.section.nextDose.today')
    case 'tomorrow':
      return t('treatments.section.nextDose.tomorrow')
    case 'later':
      return t('treatments.section.nextDose.later', { n: reminder.daysUntil })
  }
}

watch(
  () => props.animalId,
  (animalId) => {
    void store.loadForAnimal(animalId)
  },
  { immediate: true },
)

watch(summary, (value) => emit('summary', value), { immediate: true })
</script>

<template>
  <SectionCard class="treatments-section" :title="t('treatments.section.title')">
    <div v-for="row in rows" :key="row.id" class="section-card__row treatment-row">
      <div class="treatment-row__text">
        <p class="treatment-row__name">{{ row.name }}</p>
        <p class="treatment-row__type">{{ row.type }}</p>
        <p
          v-if="row.nextDose"
          class="treatment-row__next-dose"
          :class="`treatment-row__next-dose--${row.urgency}`"
        >
          {{ row.nextDose }}
        </p>
      </div>
      <span class="treatment-row__frequency">{{ row.frequency }}</span>
    </div>

    <p v-if="rows.length === 0" class="section-card__empty treatments-section__empty">
      {{ t('treatments.section.empty') }}
    </p>
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.treatment-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.treatment-row__name {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
}

.treatment-row__type {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}

.treatment-row__next-dose {
  margin: 4px 0 0;
  color: tokens.$color-text-meta;
  font-size: 12.5px;
  font-weight: 500;
}

.treatment-row__next-dose--today {
  color: rgb(var(--v-theme-on-today-container));
  font-weight: 700;
}

.treatment-row__next-dose--overdue {
  color: rgb(var(--v-theme-overdue));
  font-weight: 700;
}

.treatment-row__frequency {
  flex: 0 0 auto;
  padding: 6px 12px;
  border: 1px solid tokens.$color-badge-frequency-border;
  border-radius: 999px;
  background: tokens.$color-badge-frequency-bg;
  color: tokens.$color-badge-frequency-text;
  font-size: 12.5px;
  font-weight: 600;
  white-space: nowrap;
}
</style>
