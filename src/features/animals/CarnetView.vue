<script setup lang="ts">
import { format } from 'date-fns'
import { computed, onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useAnimalsStore } from './animals.store'
import TreatmentsSection, {
  type TreatmentsSummary,
} from '@/features/treatments/TreatmentsSection.vue'
import VaccinationsSection, {
  type VaccinationsSummary,
} from '@/features/vaccinations/VaccinationsSection.vue'
import WeightSection, { type WeightSectionSummary } from '@/features/weight/WeightSection.vue'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/AnimalChipSelector.vue'
import { animalAge } from '@/shared/animal-age'
import { animalAvatarGradientCss } from '@/shared/animal-avatar-gradient'
import { formatKg, formatKgDelta, formatMonth } from '@/shared/format'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const today = format(new Date(), 'yyyy-MM-dd')

const vaccinationsSummary = ref<VaccinationsSummary>({ total: 0, overdue: 0 })
const treatmentsSummary = ref<TreatmentsSummary>({ total: 0, overdue: 0, ongoing: 0 })
const weightSummary = ref<WeightSectionSummary>(null)

const animal = computed(() => animals.selectedAnimal)
const isEmpty = computed(() => animals.hasLoaded && animals.animals.length === 0)

const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((item) => ({ id: item.id, name: item.name })),
)

const subtitle = computed(() => {
  if (!animal.value) return null
  const age = animalAge(animal.value.birthDate, today)
  const parts = [animal.value.breed, age && t(`animals.age.${age.unit}`, age.value)]
  const text = parts.filter(Boolean).join(t('animals.carnet.subtitleSeparator'))
  return text || null
})

const weightStat = computed(() => {
  const summary = weightSummary.value
  if (!summary) {
    return { value: t('animals.carnet.stats.noValue'), sub: t('animals.carnet.stats.noWeight') }
  }
  const value = `${formatKg(summary.latest.weightKg)} ${t('weight.unit')}`
  if (summary.delta.kind === 'first') {
    return { value, sub: t('animals.carnet.stats.firstWeight') }
  }
  return {
    value,
    sub: t('weight.delta.vs', {
      delta: formatKgDelta(summary.delta.deltaKg),
      month: formatMonth(summary.delta.previousMeasuredOn),
    }),
  }
})

// Dès qu'il y a un retard, la colonne ne compte plus que les retards : un « 2 en retard »
// pour un seul retard sur deux rappels mentirait.
const remindersStat = computed(() => {
  const total = vaccinationsSummary.value.total + treatmentsSummary.value.total
  const overdue = vaccinationsSummary.value.overdue + treatmentsSummary.value.overdue
  if (overdue > 0) {
    return { value: String(overdue), sub: t('animals.carnet.stats.overdue'), isOverdue: true }
  }
  return { value: String(total), sub: t('animals.carnet.stats.upcoming'), isOverdue: false }
})

onMounted(() => {
  void animals.load()
})

// Il y a toujours un animal actif sur le Carnet : le premier de la liste, faute de choix.
watchEffect(() => {
  const first = animals.animals[0]
  if (animals.selectedAnimal === null && first) animals.select(first.id)
})

function goHome(): void {
  void router.push({ name: 'home' })
}

function editAnimal(): void {
  if (animal.value) void router.push({ name: 'animal-edit', params: { id: animal.value.id } })
}

function createAnimal(): void {
  void router.push({ name: 'animal-new' })
}
</script>

<template>
  <div class="carnet">
    <template v-if="animal">
      <header class="carnet-header">
        <v-btn
          class="carnet-header__back"
          icon="ms:arrow_back"
          variant="text"
          :aria-label="t('animals.carnet.back')"
          @click="goHome"
        />
        <div class="carnet-header__identity">
          <span
            class="carnet-header__avatar"
            :style="{ backgroundImage: animalAvatarGradientCss(animal.id) }"
          />
          <div class="carnet-header__text">
            <h1 class="carnet-header__name">{{ animal.name }}</h1>
            <p v-if="subtitle" class="carnet-header__subtitle">{{ subtitle }}</p>
          </div>
          <v-btn
            class="carnet-header__edit"
            icon="ms:edit"
            variant="text"
            :aria-label="t('animals.carnet.edit')"
            @click="editAnimal"
          />
        </div>
      </header>

      <AnimalChipSelector
        v-model:selected-id="animals.selectedAnimalId"
        :animals="chips"
        mode="switch"
        @add="createAnimal"
      />

      <dl class="carnet-stats">
        <div class="carnet-stat">
          <dt class="carnet-stat__label">{{ t('animals.carnet.stats.weight') }}</dt>
          <dd class="carnet-stat__value">{{ weightStat.value }}</dd>
          <dd class="carnet-stat__sub">{{ weightStat.sub }}</dd>
        </div>
        <div class="carnet-stat" :class="{ 'carnet-stat--overdue': remindersStat.isOverdue }">
          <dt class="carnet-stat__label">{{ t('animals.carnet.stats.reminders') }}</dt>
          <dd class="carnet-stat__value">{{ remindersStat.value }}</dd>
          <dd class="carnet-stat__sub">{{ remindersStat.sub }}</dd>
        </div>
        <div class="carnet-stat">
          <dt class="carnet-stat__label">{{ t('animals.carnet.stats.treatments') }}</dt>
          <dd class="carnet-stat__value">{{ treatmentsSummary.ongoing }}</dd>
          <dd class="carnet-stat__sub">{{ t('animals.carnet.stats.ongoing') }}</dd>
        </div>
      </dl>

      <div class="carnet__sections">
        <VaccinationsSection
          :animal-id="animal.id"
          :today="today"
          @summary="vaccinationsSummary = $event"
        />
        <TreatmentsSection
          :animal-id="animal.id"
          :today="today"
          @summary="treatmentsSummary = $event"
        />
        <WeightSection :animal-id="animal.id" @summary="weightSummary = $event" />
      </div>
    </template>

    <div v-else-if="isEmpty" class="carnet-welcome">
      <v-icon class="carnet-welcome__icon" icon="ms:pets" size="48" />
      <h1 class="carnet-welcome__title">{{ t('animals.carnet.welcome.title') }}</h1>
      <v-btn class="carnet-welcome__create" variant="flat" color="primary" @click="createAnimal">
        {{ t('animals.carnet.welcome.create') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.carnet {
  min-height: 100%;
  padding-bottom: 24px;
  background: rgb(var(--v-theme-background));
}

.carnet-header {
  display: flex;
  flex-direction: column;
  height: tokens.$height-header;
  padding: 4px 12px 0;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-background));
}

.carnet-header__back,
.carnet-header__edit {
  width: 48px;
  height: 48px;
  color: rgb(var(--v-theme-background));
}

.carnet-header__identity {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-inline: 8px;
}

.carnet-header__avatar {
  display: block;
  flex: 0 0 auto;
  width: tokens.$size-header-avatar;
  height: tokens.$size-header-avatar;
  border: 2px solid tokens.$color-header-avatar-border;
  border-radius: 50%;
  background-size: cover;
}

.carnet-header__text {
  flex: 1 1 auto;
  min-width: 0;
}

.carnet-header__name {
  overflow: hidden;
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 25px;
  font-weight: 700;
  line-height: 1.15;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.carnet-header__subtitle {
  overflow: hidden;
  margin: 2px 0 0;
  color: tokens.$color-on-primary-subtitle;
  font-size: 13.5px;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.carnet-stats {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  margin: 22px 20px 0;
}

.carnet-stat {
  padding-inline: 12px;
}

.carnet-stat:first-child {
  padding-inline-start: 0;
}

.carnet-stat + .carnet-stat {
  border-left: 1px solid tokens.$color-divider;
}

.carnet-stat__label {
  color: tokens.$color-text-meta;
  font-size: 11.5px;
  font-weight: 600;
}

.carnet-stat__value {
  margin: 6px 0 0;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
  line-height: 1.1;
}

.carnet-stat__sub {
  margin: 4px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 11.5px;
}

.carnet-stat--overdue .carnet-stat__value {
  color: rgb(var(--v-theme-overdue));
}

.carnet-stat--overdue .carnet-stat__sub {
  color: rgb(var(--v-theme-overdue));
  font-weight: 700;
}

.carnet__sections {
  display: flex;
  flex-direction: column;
  gap: 26px;
  margin-top: 26px;
}

.carnet-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 96px 24px 0;
  text-align: center;
}

.carnet-welcome__icon {
  color: rgb(var(--v-theme-primary));
}

.carnet-welcome__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
}

.carnet-welcome__create {
  height: 52px;
  padding-inline: 28px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
