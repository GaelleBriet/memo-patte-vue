<script lang="ts">
import type { ReminderCounts } from '@/shared/domain/reminders'

export type VaccinationsSummary = ReminderCounts
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  carnetVaccinationRow,
  carnetVaccinationsSummary,
  type CarnetVaccinationBadgeStatus,
} from '../logic/vaccination-carnet'
import { byDueDate } from '../logic/vaccination-status'
import { useVaccinationsStore } from '../store/vaccinations.store'
import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { useAnimalSectionLoad } from '@/shared/composables/use-animal-section-load'

const BADGE_ICONS: Partial<Record<CarnetVaccinationBadgeStatus, string>> = {
  overdue: 'ms:error',
  today: 'ms:today',
  'up-to-date': 'ms:check',
}

const props = withDefaults(
  defineProps<{
    animalId: string
    /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
    today: string
    /** Faux pour un animal qu'on ne suit plus : ni badge, ni rappel, ni ajout (VA-16, AN-9). */
    followed?: boolean
  }>(),
  { followed: true },
)

const emit = defineEmits<{
  summary: [summary: VaccinationsSummary]
}>()

const { t } = useI18n()
const router = useRouter()
const store = useVaccinationsStore()

const { isCurrent, hasError } = useAnimalSectionLoad(() => props.animalId, store)

// Au changement d'animal, ou après un échec, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const vaccinations = computed(() => (isCurrent.value ? store.vaccinations : []))

const rows = computed(() =>
  [...vaccinations.value].sort(byDueDate).map((vaccination) => ({
    id: vaccination.id,
    name: vaccination.name,
    ...carnetVaccinationRow(t, vaccination, props.today, { followed: props.followed }),
  })),
)

const summary = computed<VaccinationsSummary>(() =>
  carnetVaccinationsSummary(vaccinations.value, props.today, { followed: props.followed }),
)

watch(summary, (value) => emit('summary', value), { immediate: true })

function openDetail(id: string): void {
  void router.push({ name: 'vaccination-detail', params: { id } })
}

function addVaccination(): void {
  void router.push({ name: 'vaccination-new', params: { animalId: props.animalId } })
}
</script>

<template>
  <SectionCard class="vaccinations-section" :title="t('vaccinations.section.title')">
    <button
      v-for="row in rows"
      :key="row.id"
      type="button"
      class="section-card__row vaccination-row"
      @click="openDetail(row.id)"
    >
      <ListRowIcon :icon="row.icon" :muted="!followed" />
      <span class="vaccination-row__text">
        <span class="vaccination-row__name" :class="{ 'vaccination-row__name--muted': !followed }">
          {{ row.name }}
        </span>
        <span class="vaccination-row__detail">{{ row.detail }}</span>
      </span>
      <span class="vaccination-row__end">
        <DueStatusChip
          v-if="row.badge"
          class="vaccination-row__badge"
          :status="row.badge.status"
          :label="row.badge.label"
          :icon="BADGE_ICONS[row.badge.status]"
        />
        <v-icon class="vaccination-row__chevron" icon="ms:chevron_right" size="22" />
      </span>
    </button>

    <p v-if="hasError" class="section-card__empty vaccinations-section__error">
      {{ t('vaccinations.section.error') }}
    </p>
    <p v-else-if="rows.length === 0" class="section-card__empty vaccinations-section__empty">
      {{ t('vaccinations.section.empty') }}
    </p>

    <button
      v-if="followed"
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
  padding-inline-end: 12px;
}

.vaccination-row__end {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.vaccination-row__badge {
  margin-inline-start: auto;
}

.vaccination-row__chevron {
  flex: 0 0 auto;
  color: tokens.$color-settings-chevron;
}

.vaccination-row__text {
  flex: 1 1 0;
  max-width: calc(100% - #{tokens.$size-row-icon} - #{tokens.$gap-list-row});
}

.vaccination-row__name {
  display: block;
  margin: 0;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.vaccination-row__name--muted {
  color: tokens.$color-text-secondary;
}

.vaccination-row__detail {
  display: block;
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
