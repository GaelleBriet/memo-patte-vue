<script lang="ts">
import type { ReminderCounts } from '@/shared/domain/reminders'

export type TreatmentsSummary = ReminderCounts & {
  /** Traitements en cours, avec ou sans rappel. */
  ongoing: number
}
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { finishedTreatmentRows } from '../logic/treatment-history'
import { isOngoing } from '../logic/treatment-status'
import { useTreatmentsStore } from '../store/treatments.store'
import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { useAnimalScopedLoad } from '@/shared/composables/use-animal-scoped-load'
import { buildReminders, type Reminder, type ReminderStatus } from '@/shared/domain/reminders'

const props = defineProps<{
  animalId: string
  /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
  today: string
}>()

const emit = defineEmits<{
  summary: [summary: TreatmentsSummary]
}>()

const { t } = useI18n()
const router = useRouter()
const store = useTreatmentsStore()

// Au changement d'animal, ou après un échec, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const treatments = computed(() => (isCurrent.value ? store.treatments.filter(isOngoing) : []))

const { loadedFor } = useAnimalScopedLoad(
  () => props.animalId,
  (id) => store.loadForAnimal(id),
)

const isCurrent = computed(
  () =>
    loadedFor.value === props.animalId && store.animalId === props.animalId && store.error === null,
)
const hasError = computed(
  () =>
    loadedFor.value === props.animalId && store.animalId === props.animalId && store.error !== null,
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

const finishedRows = computed(() =>
  isCurrent.value ? finishedTreatmentRows(t, store.treatments, store.doseCounts) : [],
)
const showsFinished = ref(false)

watch(
  () => props.animalId,
  () => {
    showsFinished.value = false
  },
)

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

function openDetail(id: string): void {
  void router.push({ name: 'treatment-detail', params: { id } })
}

function addTreatment(): void {
  void router.push({ name: 'treatment-new', params: { animalId: props.animalId } })
}

watch(summary, (value) => emit('summary', value), { immediate: true })
</script>

<template>
  <SectionCard class="treatments-section" :title="t('treatments.section.title')">
    <button
      v-for="row in rows"
      :key="row.id"
      type="button"
      class="section-card__row treatment-row"
      @click="openDetail(row.id)"
    >
      <span class="treatment-row__text">
        <span class="treatment-row__name">{{ row.name }}</span>
        <span class="treatment-row__type">{{ row.type }}</span>
        <span
          v-if="row.nextDose"
          class="treatment-row__next-dose"
          :class="`treatment-row__next-dose--${row.urgency}`"
        >
          {{ row.nextDose }}
        </span>
      </span>
      <span class="treatment-row__end">
        <DueStatusChip class="treatment-row__frequency" status="none" :label="row.frequency" />
        <v-icon class="treatment-row__chevron" icon="ms:chevron_right" size="22" />
      </span>
    </button>

    <p v-if="hasError" class="section-card__empty treatments-section__error">
      {{ t('treatments.section.error') }}
    </p>
    <p v-else-if="rows.length === 0" class="section-card__empty treatments-section__empty">
      {{ t('treatments.section.empty') }}
    </p>

    <button type="button" class="section-card__add treatments-section__add" @click="addTreatment">
      <v-icon icon="ms:add" size="20" />
      <span>{{ t('treatments.section.add') }}</span>
    </button>
  </SectionCard>

  <section v-if="finishedRows.length > 0" class="finished-treatments">
    <h2 class="finished-treatments__heading">
      <button
        type="button"
        class="finished-treatments__toggle"
        :aria-expanded="showsFinished"
        @click="showsFinished = !showsFinished"
      >
        <span class="finished-treatments__title">{{ t('treatments.finished.title') }}</span>
        <span class="finished-treatments__counter">{{ finishedRows.length }}</span>
        <v-icon
          class="finished-treatments__chevron"
          :icon="showsFinished ? 'ms:keyboard_arrow_up' : 'ms:keyboard_arrow_down'"
          size="24"
        />
      </button>
    </h2>
    <div v-if="showsFinished" class="section-card__card">
      <button
        v-for="row in finishedRows"
        :key="row.id"
        type="button"
        class="section-card__row finished-treatment-row"
        @click="openDetail(row.id)"
      >
        <span class="finished-treatment-row__text">
          <span class="finished-treatment-row__name">{{ row.name }}</span>
          <span class="finished-treatment-row__detail">{{ row.detail }}</span>
        </span>
        <v-icon class="finished-treatment-row__chevron" icon="ms:chevron_right" size="22" />
      </button>
    </div>
  </section>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

// Sous 380 px, un nom d'un seul mot long et son badge ne tiennent pas côte à côte :
// le badge passe dessous plutôt que le mot soit coupé en deux.
.treatment-row {
  flex-wrap: wrap;
}

.treatment-row,
.finished-treatment-row {
  padding-inline-end: 12px;
}

.treatment-row__end {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.treatment-row__frequency {
  margin-inline-start: auto;
}

.treatment-row__chevron,
.finished-treatment-row__chevron {
  flex: 0 0 auto;
  margin-inline-start: auto;
  color: tokens.$color-settings-chevron;
}

.treatment-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.treatment-row__name {
  display: block;
  margin: 0;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.treatment-row__type {
  display: block;
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}

.treatment-row__next-dose {
  display: block;
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

.finished-treatments {
  padding-inline: tokens.$padding-section-inline;
}

.finished-treatments__heading {
  margin: 0 0 12px;
}

.finished-treatments__toggle {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  min-height: tokens.$size-tap-target;
  padding: 0;
  border: 0;
  background: transparent;
  color: tokens.$color-text-secondary;
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}

.finished-treatments__title {
  flex: 1 1 auto;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
}

.finished-treatments__counter {
  color: tokens.$color-text-meta;
  font-size: 13px;
  font-weight: 500;
}

.finished-treatments__chevron {
  color: rgb(var(--v-theme-primary));
}

.finished-treatment-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.finished-treatment-row__name {
  display: block;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.finished-treatment-row__detail {
  display: block;
  margin-top: 2px;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
