<script lang="ts">
import type { ReminderCounts } from '@/shared/domain/reminders'

export type VaccinationsSummary = ReminderCounts
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { byDueDate, vaccinationStatus, type VaccinationStatus } from './vaccination-status'
import { useVaccinationsStore } from './vaccinations.store'
import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { formatMonthYear } from '@/shared/utils/format'
import { useAnimalScopedLoad } from '@/shared/composables/use-animal-scoped-load'
import { buildReminders } from '@/shared/domain/reminders'

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

// Au changement d'animal, ou après un échec, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const vaccinations = computed(() => (isCurrent.value ? store.vaccinations : []))

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

const rows = computed(() =>
  [...vaccinations.value].sort(byDueDate).map((vaccination) => {
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
  return t('vaccinations.section.detail.validUntil', { month: formatMonthYear(dueDate) })
}

function addVaccination(): void {
  void router.push({ name: 'vaccination-new', params: { animalId: props.animalId } })
}

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
      <DueStatusChip
        class="vaccination-row__badge"
        :status="row.status"
        :label="row.badge"
        :icon="row.icon"
      />
    </div>

    <p v-if="hasError" class="section-card__empty vaccinations-section__error">
      {{ t('vaccinations.section.error') }}
    </p>
    <p v-else-if="rows.length === 0" class="section-card__empty vaccinations-section__empty">
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

// Sous 380 px, un nom d'un seul mot long et son badge ne tiennent pas côte à côte :
// le badge passe dessous plutôt que le mot soit coupé en deux.
.vaccination-row {
  flex-wrap: wrap;
}

.vaccination-row__badge {
  margin-inline-start: auto;
}

.vaccination-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.vaccination-row__name {
  margin: 0;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.vaccination-row__detail {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
