<script lang="ts">
export type { TreatmentsSummary } from '../logic/treatment-carnet'
</script>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import {
  carnetScheduleCache,
  carnetTreatments,
  type TreatmentsSummary,
} from '../logic/treatment-carnet'
import { useTreatmentsStore } from '../store/treatments.store'
import DueStatusChip from '@/shared/components/DueStatusChip.vue'
import ListRowIcon from '@/shared/components/ListRowIcon.vue'
import SectionCard from '@/shared/components/SectionCard.vue'
import { useAnimalScopedLoad } from '@/shared/composables/use-animal-scoped-load'

const props = withDefaults(
  defineProps<{
    animalId: string
    /** Date civile `yyyy-MM-dd`, calculée par l'écran. */
    today: string
    /** Faux pour un animal qu'on ne suit plus : rien à renseigner (TR-37). */
    followed?: boolean
  }>(),
  { followed: true },
)

const emit = defineEmits<{
  summary: [summary: TreatmentsSummary]
}>()

const { t } = useI18n()
const router = useRouter()
const store = useTreatmentsStore()

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

// Au changement d'animal, ou après un échec, le store porte déjà le nouvel animal mais encore l'ancienne liste.
const schedules = carnetScheduleCache()
const carnet = computed(() =>
  carnetTreatments(t, isCurrent.value ? store.treatments : [], props.today, schedules, {
    followed: props.followed,
  }),
)
const rows = computed(() => carnet.value.ongoing)
const finishedRows = computed(() => carnet.value.finished)
const showsFinished = ref(false)

watch(
  () => props.animalId,
  () => {
    showsFinished.value = false
  },
)

function openDetail(id: string): void {
  void router.push({ name: 'treatment-detail', params: { id } })
}

function addTreatment(): void {
  void router.push({ name: 'treatment-new', params: { animalId: props.animalId } })
}

watch(
  () => carnet.value.summary,
  (value) => emit('summary', value),
  { immediate: true },
)
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
        <ListRowIcon :icon="row.icon" muted />
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

.treatment-row__badge {
  margin-inline-start: auto;
}

.treatment-row__chevron,
.finished-treatment-row__chevron {
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
  color: tokens.$color-text-secondary;
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
