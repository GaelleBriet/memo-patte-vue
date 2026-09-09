<script lang="ts">
import type { ReminderCounts } from '@/shared/reminders'

export type VaccinationsSummary = ReminderCounts
</script>

<script setup lang="ts">
import { format, parseISO } from 'date-fns'
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { vaccinationStatus, type VaccinationStatus } from './vaccination-status'
import { useVaccinationsStore } from './vaccinations.store'
import SectionCard from '@/shared/SectionCard.vue'
import { buildReminders } from '@/shared/reminders'

const props = defineProps<{
  animalId: string
  /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
  today: string
}>()

const emit = defineEmits<{
  summary: [summary: VaccinationsSummary]
}>()

const { t } = useI18n()
const router = useRouter()
const store = useVaccinationsStore()

const BADGE_ICONS: Record<VaccinationStatus, string | null> = {
  overdue: 'ms:error',
  'up-to-date': 'ms:check',
  none: null,
}

const BADGE_LABELS: Record<VaccinationStatus, string> = {
  overdue: 'vaccinations.section.status.overdue',
  'up-to-date': 'vaccinations.section.status.upToDate',
  none: 'vaccinations.section.status.none',
}

// Pendant un chargement, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const vaccinations = computed(() =>
  store.animalId === props.animalId && !store.isLoading ? store.vaccinations : [],
)

const rows = computed(() =>
  vaccinations.value.map((vaccination) => {
    const status = vaccinationStatus(vaccination.dueDate, props.today)
    return {
      id: vaccination.id,
      name: vaccination.name,
      status,
      icon: BADGE_ICONS[status],
      badge: t(BADGE_LABELS[status]),
      detail: detailOf(status, vaccination.dueDate),
    }
  }),
)

const summary = computed<VaccinationsSummary>(() => {
  const { total, overdue } = buildReminders(
    vaccinations.value.map((vaccination) => ({
      kind: 'vaccination',
      id: vaccination.id,
      animalId: vaccination.animalId,
      label: vaccination.name,
      dueDate: vaccination.dueDate,
    })),
    { today: props.today },
  )
  return { total, overdue }
})

function detailOf(status: VaccinationStatus, dueDate: string | null): string {
  if (status === 'overdue') return t('vaccinations.section.detail.overdue')
  if (status === 'none' || dueDate === null) return t('vaccinations.section.detail.none')
  return t('vaccinations.section.detail.validUntil', {
    month: format(parseISO(dueDate), 'MM/yyyy'),
  })
}

function addVaccination(): void {
  void router.push({ name: 'vaccination-new', params: { animalId: props.animalId } })
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
  <SectionCard class="vaccinations-section" :title="t('vaccinations.section.title')">
    <div
      v-for="row in rows"
      :key="row.id"
      class="section-card__row vaccination-row"
      :class="{
        'section-card__row--overdue': row.status === 'overdue',
        'vaccination-row--overdue': row.status === 'overdue',
      }"
    >
      <div class="vaccination-row__text">
        <p class="vaccination-row__name">{{ row.name }}</p>
        <p class="vaccination-row__detail">{{ row.detail }}</p>
      </div>
      <span class="vaccination-row__badge" :class="`vaccination-row__badge--${row.status}`">
        <v-icon v-if="row.icon" :icon="row.icon" size="16" />
        <span>{{ row.badge }}</span>
      </span>
    </div>

    <p v-if="rows.length === 0" class="section-card__empty vaccinations-section__empty">
      {{ t('vaccinations.section.empty') }}
    </p>

    <button
      type="button"
      class="section-card__add vaccinations-section__add"
      @click="addVaccination"
    >
      <v-icon icon="ms:add" size="20" />
      <span>{{ t('vaccinations.section.add') }}</span>
    </button>
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.vaccination-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.vaccination-row__name {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
}

.vaccination-row__detail {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}

.vaccination-row__badge {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 4px;
  padding: 6px 12px;
  border-radius: 999px;
  font-size: 12.5px;
  font-weight: 700;
  white-space: nowrap;
}

.vaccination-row__badge--overdue {
  background: tokens.$color-badge-overdue-bg;
  color: tokens.$color-badge-overdue-text;
}

.vaccination-row__badge--up-to-date {
  background: tokens.$color-badge-up-to-date-bg;
  color: tokens.$color-badge-up-to-date-text;
}

.vaccination-row__badge--none {
  border: 1px solid tokens.$color-badge-frequency-border;
  background: tokens.$color-badge-frequency-bg;
  color: tokens.$color-badge-frequency-text;
  font-weight: 600;
}
</style>
