<script lang="ts">
export type { FinishedTreatmentRow, TreatmentsSummary } from '../logic/treatment-carnet'
</script>

<script setup lang="ts">
import { computed, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  carnetViewCache,
  carnetTreatments,
  type FinishedTreatmentRow,
  type TreatmentsSummary,
} from '../logic/treatment-carnet'
import { useTreatmentsStore } from '../store/treatments.store'
import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { useAnimalSectionLoad } from '@/shared/composables/use-animal-section-load'

const views = carnetViewCache()

const props = withDefaults(
  defineProps<{
    animalId: string
    /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
    today: string
    /** Faux pour un animal qu'on ne suit plus : rien à renseigner (TR-37), rien à ajouter (AN-9). */
    followed?: boolean
  }>(),
  { followed: true },
)

const emit = defineEmits<{
  summary: [summary: TreatmentsSummary]
  finished: [rows: FinishedTreatmentRow[]]
}>()

const { t } = useI18n()
const router = useRouter()
const store = useTreatmentsStore()

const { isCurrent, hasError } = useAnimalSectionLoad(() => props.animalId, store)

const carnet = computed(() =>
  carnetTreatments(t, isCurrent.value ? store.treatments : [], props.today, views, {
    followed: props.followed,
  }),
)
const rows = computed(() => carnet.value.ongoing)

watch(
  () => carnet.value.summary,
  (value) => emit('summary', value),
  { immediate: true },
)

watch(
  () => carnet.value.finished,
  (value) => emit('finished', value),
  { immediate: true },
)

function openDetail(id: string): void {
  void router.push({ name: 'treatment-detail', params: { id } })
}

function addTreatment(): void {
  void router.push({ name: 'treatment-new', params: { animalId: props.animalId } })
}
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
      <ListRowIcon :icon="row.icon" />
      <span class="treatment-row__text">
        <span class="treatment-row__name">{{ row.name }}</span>
        <span v-if="row.detail" class="treatment-row__detail">{{ row.detail }}</span>
        <span v-if="row.unlogged" class="treatment-row__unlogged">{{ row.unlogged }}</span>
      </span>
      <span class="treatment-row__end">
        <DueStatusChip
          v-if="row.badge"
          class="treatment-row__badge"
          :status="row.badge.status"
          :label="row.badge.label"
          :icon="row.badge.status === 'overdue' ? 'ms:error' : null"
        />
        <v-icon class="treatment-row__chevron" icon="ms:chevron_right" size="22" />
      </span>
    </button>

    <p v-if="hasError" class="section-card__empty treatments-section__error">
      {{ t('treatments.section.error') }}
    </p>
    <p v-else-if="rows.length === 0" class="section-card__empty treatments-section__empty">
      {{ t('treatments.section.empty') }}
    </p>

    <button
      v-if="followed"
      type="button"
      class="section-card__add treatments-section__add"
      @click="addTreatment"
    >
      <v-icon icon="ms:add" size="20" />
      <span>{{ t('treatments.section.add') }}</span>
    </button>
  </SectionCard>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

// Sous 380 px, un nom d'un seul mot long et son badge ne tiennent pas côte à côte :
// le badge passe dessous plutôt que le mot soit coupé en deux.
.treatment-row {
  flex-wrap: wrap;
}

.treatment-row {
  padding-inline-end: 12px;
}

.treatment-row__end {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-inline-start: auto;
}

.treatment-row__badge {
  margin-inline-start: auto;
}

.treatment-row__chevron {
  flex: 0 0 auto;
  margin-inline-start: auto;
  color: tokens.$color-settings-chevron;
}

.treatment-row__text {
  flex: 1 1 0;
  max-width: calc(100% - #{tokens.$size-row-icon} - #{tokens.$gap-list-row});
}

.treatment-row__name {
  display: block;
  margin: 0;
  overflow-wrap: break-word;
  font-size: 15.5px;
  font-weight: 700;
}

.treatment-row__detail,
.treatment-row__unlogged {
  display: block;
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 12.5px;
}
</style>
