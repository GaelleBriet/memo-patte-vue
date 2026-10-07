<script setup lang="ts">
import { computed, defineAsyncComponent, onMounted, ref, watchEffect } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import AnimalOptionsSheet from './AnimalOptionsSheet.vue'
import AnimalPhotoSheet from './AnimalPhotoSheet.vue'
import AnimalPhotoViewer from './AnimalPhotoViewer.vue'
import { useAnimalsStore } from '../store/animals.store'
import { useAnimalFollowGestures } from '../composables/use-animal-follow-gestures'
import { useAnimalPhotoActions } from '../composables/use-animal-photo-actions'
import { useForegroundRefresh } from '@/core/app-lifecycle/use-foreground-refresh'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import PlusNudgeSection from '@/features/purchase/views/PlusNudgeSection.vue'
import type { PdfExportAnimal } from '@/features/settings/views/PdfExportSheet.vue'

const PdfExportSheet = defineAsyncComponent(
  () => import('@/features/settings/views/PdfExportSheet.vue'),
)
import TreatmentsSection, {
  type TreatmentsSummary,
} from '@/features/treatments/views/TreatmentsSection.vue'
import VaccinationsSection, {
  type VaccinationsSummary,
} from '@/features/vaccinations/views/VaccinationsSection.vue'
import WeightSection, { type WeightSectionSummary } from '@/features/weight/views/WeightSection.vue'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/components/AnimalChipSelector.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import { animalAgeText } from '@/shared/domain/animal-age'
import { animalAvatarGradientCss } from '@/shared/domain/animal-avatar-gradient'
import { weightDeltaText } from '@/shared/domain/weight-delta'
import { weightText } from '@/shared/domain/weight-display'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()

const { today } = useForegroundRefresh(() => void animals.load())

const vaccinationsSummary = ref<VaccinationsSummary>({ total: 0, overdue: 0 })
const treatmentsSummary = ref<TreatmentsSummary>({ total: 0, overdue: 0, ongoing: 0 })
const weightSummary = ref<WeightSectionSummary>(null)

const animal = computed(() => animals.selectedAnimal)
const isLoading = computed(() => !animals.hasLoaded && animals.error === null)
const hasError = computed(() => animals.error !== null)
const isEmpty = computed(
  () => animals.hasLoaded && animals.followedAnimals.length === 0 && animals.error === null,
)

const photoUrl = usePhotoUrls(() => animals.animals.map((item) => item.photoPath))

const chips = computed<AnimalChipItem[]>(() =>
  animals.followedAnimals.map((item) => ({
    id: item.id,
    name: item.name,
    photoUrl: photoUrl(item.photoPath),
  })),
)
const headerPhotoUrl = computed(() => photoUrl(animal.value?.photoPath ?? null))
const photoLabel = computed(() => {
  const name = animal.value?.name ?? ''
  return headerPhotoUrl.value
    ? t('animals.carnet.photo.avatarLabel', { name })
    : t('animals.carnet.photo.addLabel', { name })
})

const isPhotoSheetOpen = ref(false)
const isPhotoViewerOpen = ref(false)
const photoActions = useAnimalPhotoActions(animal)

const isOptionsSheetOpen = ref(false)
const isDeleteDialogOpen = ref(false)
const gestures = useAnimalFollowGestures()
const isFollowed = computed(() => animal.value?.unfollowedOn === null)

async function applyOption(gesture: (target: { id: string; name: string }) => Promise<boolean>) {
  const target = animal.value
  if (!target) return
  isOptionsSheetOpen.value = false
  await gesture(target)
}

function askDelete(): void {
  isOptionsSheetOpen.value = false
  isDeleteDialogOpen.value = true
}

const isPdfExportSheetOpen = ref(false)
const hasOpenedPdfExportSheet = ref(false)
const pdfExportAnimals = computed<PdfExportAnimal[]>(() =>
  animal.value ? [{ id: animal.value.id, name: animal.value.name }] : [],
)

function onExportPdf(): void {
  hasOpenedPdfExportSheet.value = true
  isPdfExportSheetOpen.value = true
}

function openPhotoSheet(event: Event): void {
  const avatar = event.currentTarget as HTMLElement
  avatar.focus({ preventScroll: true })
  photoActions.error.value = null
  isPhotoSheetOpen.value = true
}

function viewPhoto(): void {
  isPhotoSheetOpen.value = false
  isPhotoViewerOpen.value = true
}

async function applyPhoto(action: () => Promise<boolean>): Promise<void> {
  if (await action()) isPhotoSheetOpen.value = false
}

const subtitle = computed(() => {
  if (!animal.value) return null
  const { breed, birthDate, birthDateApproximate } = animal.value
  const age = animalAgeText(t, { birthDate, approximate: birthDateApproximate }, today.value)
  const parts = [breed, age]
  const text = parts.filter(Boolean).join(t('animals.carnet.subtitleSeparator'))
  return text || null
})

const weightStat = computed(() => {
  const summary = weightSummary.value
  if (!summary) {
    return { value: t('animals.carnet.stats.noValue'), sub: t('animals.carnet.stats.noWeight') }
  }
  const value = weightText(t, summary.latest.weightKg)
  if (summary.delta.kind === 'first') {
    return { value, sub: t('animals.carnet.stats.firstWeight') }
  }
  return { value, sub: weightDeltaText(t, summary.delta) }
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

// Il y a toujours un animal actif sur le Carnet : le premier animal suivi, faute de choix.
watchEffect(() => {
  const first = animals.followedAnimals[0]
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
          <button
            type="button"
            class="carnet-header__photo"
            aria-haspopup="dialog"
            :aria-label="photoLabel"
            @click="openPhotoSheet"
          >
            <span
              class="carnet-header__avatar"
              :style="{ backgroundImage: animalAvatarGradientCss(animal.id) }"
            >
              <img v-if="headerPhotoUrl" :src="headerPhotoUrl" alt="" />
            </span>
            <span class="carnet-header__photo-badge" aria-hidden="true">
              <v-icon icon="ms:photo_camera" />
            </span>
          </button>
          <div class="carnet-header__text">
            <h1 class="carnet-header__name">{{ animal.name }}</h1>
            <p v-if="subtitle" class="carnet-header__subtitle">{{ subtitle }}</p>
          </div>
          <v-btn
            class="carnet-header__export-pdf"
            icon="ms:picture_as_pdf"
            variant="text"
            :aria-label="t('animals.carnet.exportPdf')"
            @click="onExportPdf"
          />
          <v-btn
            class="carnet-header__edit"
            icon="ms:edit"
            variant="text"
            :aria-label="t('animals.carnet.edit')"
            @click="editAnimal"
          />
          <v-btn
            class="carnet-header__options"
            icon="ms:more_vert"
            variant="text"
            aria-haspopup="dialog"
            :aria-label="t('animals.carnet.options.open', { name: animal.name })"
            @click="isOptionsSheetOpen = true"
          />
        </div>
      </header>

      <AnimalOptionsSheet
        v-model="isOptionsSheetOpen"
        :name="animal.name"
        :subtitle="subtitle"
        :followed="isFollowed"
        :busy="gestures.isBusy.value"
        @unfollow="applyOption(gestures.unfollow)"
        @follow="applyOption(gestures.follow)"
        @delete="askDelete"
      />

      <ConfirmDialog
        v-model="isDeleteDialogOpen"
        :title="t('animals.carnet.deleteDialog.title', { name: animal.name })"
        :text="t('animals.carnet.deleteDialog.text', { name: animal.name })"
        :cancel-label="t('animals.carnet.deleteDialog.cancel')"
        :confirm-label="t('animals.carnet.deleteDialog.confirm')"
        @confirm="applyOption(gestures.remove)"
      />

      <PdfExportSheet
        v-if="hasOpenedPdfExportSheet"
        v-model="isPdfExportSheetOpen"
        :animals="pdfExportAnimals"
      />

      <AnimalPhotoSheet
        v-model="isPhotoSheetOpen"
        :name="animal.name"
        :breed="animal.breed"
        :has-photo="headerPhotoUrl !== null"
        :busy="photoActions.isBusy.value"
        :error="photoActions.error.value ? t(photoActions.error.value) : null"
        @view="viewPhoto"
        @change="applyPhoto(photoActions.changePhoto)"
        @remove="applyPhoto(photoActions.removePhoto)"
      />

      <AnimalPhotoViewer
        v-if="headerPhotoUrl"
        v-model="isPhotoViewerOpen"
        :src="headerPhotoUrl"
        :name="animal.name"
      />

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
        <PlusNudgeSection :animal-count="animals.animals.length" />
        <VaccinationsSection
          :animal-id="animal.id"
          :today="today"
          @summary="vaccinationsSummary = $event"
        />
        <TreatmentsSection
          :animal-id="animal.id"
          :today="today"
          :followed="isFollowed"
          @summary="treatmentsSummary = $event"
        />
        <WeightSection :animal-id="animal.id" :today="today" @summary="weightSummary = $event" />
      </div>
    </template>

    <template v-else-if="isLoading">
      <header class="carnet-header" aria-hidden="true" />
      <div class="carnet-loading" role="status" :aria-label="t('animals.carnet.loading')">
        <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
      </div>
    </template>

    <div v-else-if="hasError" class="carnet-error" role="alert">
      <v-icon class="carnet-error__icon" icon="ms:error" size="48" />
      <h1 class="carnet-error__title">{{ t('animals.carnet.error.title') }}</h1>
      <p class="carnet-error__text">{{ t('animals.carnet.error.text') }}</p>
      <v-btn class="carnet-error__retry" variant="flat" color="primary" @click="animals.load()">
        {{ t('animals.carnet.error.retry') }}
      </v-btn>
    </div>

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
.carnet-header__export-pdf,
.carnet-header__edit,
.carnet-header__options {
  width: 48px;
  height: 48px;
  color: rgb(var(--v-theme-background));
}

// Les trois icônes se touchent par leur zone de 48 px, pas par l'écart du nom.
.carnet-header__edit,
.carnet-header__options {
  margin-inline-start: -14px;
}

.carnet-header__identity {
  display: flex;
  align-items: center;
  gap: 14px;
  padding-inline: 8px;
}

.carnet-header__photo {
  position: relative;
  flex: 0 0 auto;
  padding: 0;
  border: 0;
  background: transparent;
  cursor: pointer;

  &:focus-visible {
    outline: none;
  }
}

.carnet-header__avatar {
  display: block;
  overflow: hidden;
  width: tokens.$size-header-avatar;
  height: tokens.$size-header-avatar;
  border: 2px solid tokens.$color-header-avatar-border;
  border-radius: 50%;
  background-size: cover;

  img {
    pointer-events: none;
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.carnet-header__photo-badge {
  position: absolute;
  right: -2px;
  bottom: -2px;
  display: flex;
  align-items: center;
  justify-content: center;
  width: tokens.$size-header-avatar-badge;
  height: tokens.$size-header-avatar-badge;
  border: 2px solid rgb(var(--v-theme-primary));
  border-radius: 50%;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-primary));

  .v-icon {
    font-size: tokens.$size-header-avatar-badge-icon;
  }
}

.carnet-header__text {
  flex: 1 1 auto;
  min-width: 0;
}

.carnet-header__name {
  overflow: hidden;
  // Place des jambages quand la police système est agrandie, sans décaler le sous-titre.
  margin: 0 0 -0.15em;
  padding-bottom: 0.15em;
  font-family: tokens.$font-family-heading;
  font-size: 25px;
  font-weight: 700;
  line-height: 1.15;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.carnet-header__subtitle {
  display: -webkit-box;
  overflow: hidden;
  margin: 2px 0 0;
  color: tokens.$color-on-primary-subtitle;
  font-size: 13.5px;
  font-weight: 500;
  line-height: 1.3;
  white-space: normal;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
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
  font-size: 12px;
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
  font-size: 12px;
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

.carnet-loading {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

.carnet-welcome,
.carnet-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 96px 24px 0;
  text-align: center;
}

.carnet-welcome__icon,
.carnet-error__icon {
  color: rgb(var(--v-theme-primary));
}

.carnet-welcome__title,
.carnet-error__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
}

.carnet-error__text {
  margin: -6px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.carnet-welcome__create,
.carnet-error__retry {
  height: 52px;
  padding-inline: 28px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
