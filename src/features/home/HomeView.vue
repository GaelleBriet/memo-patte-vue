<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import { useForegroundRefresh } from '@/core/app-lifecycle/use-foreground-refresh'
import { openNotificationSettings } from '@/core/notifications/permission'
import { useNotificationPermission } from '@/core/notifications/use-notification-permission'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import illustration from '@/assets/brand-illustration.png'
import { useAnimalsStore } from '@/features/animals/animals.store'
import WeightSheet from '@/features/weight/WeightSheet.vue'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/AnimalChipSelector.vue'
import DueStatusChip from '@/shared/DueStatusChip.vue'
import SectionCard from '@/shared/SectionCard.vue'
import { buildReminders } from '@/shared/reminders'
import AnimalPickerSheet from './AnimalPickerSheet.vue'
import { useHomeStore } from './home.store'
import { overdueBanner, reminderRows, scopeCounter, upToDateText } from './home-summary'
import { quickActionAnimalId } from './quick-actions'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const home = useHomeStore()

const { today } = useForegroundRefresh(load)
const { status: notificationPermission } = useNotificationPermission()
const areRemindersOff = computed(() => notificationPermission.value === 'disabled')

const hasError = computed(() => animals.error !== null || home.error !== null)
const isReady = computed(() => animals.hasLoaded && home.hasLoaded && !hasError.value)
const isLoading = computed(() => !isReady.value && !hasError.value)
const isWelcome = computed(() => isReady.value && animals.animals.length === 0)

const photoUrl = usePhotoUrls(() => animals.animals.map((item) => item.photoPath))
const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((item) => ({
    id: item.id,
    name: item.name,
    photoUrl: photoUrl(item.photoPath),
  })),
)

const selectedName = computed(() => animals.selectedAnimal?.name ?? null)

const summary = computed(() =>
  buildReminders(home.sources, {
    today: today.value,
    animalId: animals.selectedAnimalId ?? undefined,
  }),
)

const rows = computed(() =>
  reminderRows(t, summary.value.reminders, {
    animalNames: new Map(animals.animals.map((animal) => [animal.id, animal.name])),
    showAnimal: selectedName.value === null,
  }),
)

const counter = computed(() =>
  scopeCounter(t, { total: summary.value.total, animalName: selectedName.value }),
)
const banner = computed(() => overdueBanner(t, summary.value.overdue))
const upToDate = computed(() =>
  upToDateText(t, {
    animalName: selectedName.value,
    allNames: animals.animals.map((animal) => animal.name),
  }),
)

function load(): void {
  void Promise.all([animals.load(), home.load()])
}

// Le Carnet laisse un animal sélectionné dans le store partagé : l'accueil s'ouvre toujours sur tous.
onMounted(() => {
  animals.select(null)
  load()
})

type FormRoute = 'treatment-new' | 'vaccination-new'

const pendingForm = ref<FormRoute | null>(null)
const isPickerOpen = ref(false)
const isWeightSheetOpen = ref(false)

function openForm(name: FormRoute): void {
  const animalId = quickActionAnimalId({
    selectedId: animals.selectedAnimalId,
    animalIds: animals.animals.map((animal) => animal.id),
  })
  if (animalId !== null) {
    void router.push({ name, params: { animalId } })
    return
  }
  pendingForm.value = name
  isPickerOpen.value = true
}

function onAnimalPicked(animalId: string): void {
  if (pendingForm.value === null) return
  void router.push({ name: pendingForm.value, params: { animalId } })
  pendingForm.value = null
}

function createAnimal(): void {
  void router.push({ name: 'animal-new' })
}

function openCarnet(): void {
  const animalId = animals.selectedAnimalId ?? animals.animals[0]?.id
  if (!animalId) return
  animals.select(animalId)
  void router.push({ name: 'animals' })
}
</script>

<template>
  <div class="home">
    <div v-if="isWelcome" class="home-welcome">
      <img class="home-welcome__illustration" :src="illustration" alt="" />
      <h1 class="home-welcome__title">{{ t('home.welcome.title') }}</h1>
      <p class="home-welcome__text">{{ t('home.welcome.text') }}</p>
      <v-btn
        class="home-welcome__create"
        variant="flat"
        color="primary"
        prepend-icon="ms:add"
        @click="createAnimal"
      >
        {{ t('home.welcome.create') }}
      </v-btn>
    </div>

    <template v-else-if="isReady">
      <header class="home-header">
        <h1 class="home-header__title">{{ t('home.title') }}</h1>
        <p class="home-header__subtitle">{{ t('home.header.household') }}</p>
      </header>

      <AnimalChipSelector
        v-model:selected-id="animals.selectedAnimalId"
        :animals="chips"
        mode="filter"
        @add="createAnimal"
      />

      <div v-if="areRemindersOff" class="home-reminders-off">
        <v-icon class="home-reminders-off__icon" icon="ms:notifications_off" size="19" />
        <div class="home-reminders-off__text">
          <p class="home-reminders-off__title">{{ t('notifications.disabled.title') }}</p>
          <button type="button" class="home-reminders-off__link" @click="openNotificationSettings">
            <span>{{ t('notifications.disabled.openSettings') }}</span>
            <v-icon icon="ms:chevron_right" size="16" />
          </button>
        </div>
      </div>

      <SectionCard class="home-todo" :title="t('home.todo.title')" :counter="counter">
        <template #intro>
          <div v-if="banner" class="home-overdue-banner" role="status">
            <v-icon icon="ms:error" size="20" />
            <span>{{ banner }}</span>
          </div>

          <div v-if="rows.length === 0" class="home-up-to-date">
            <div class="home-up-to-date__row">
              <span class="home-up-to-date__dot">
                <v-icon icon="ms:check" size="24" />
              </span>
              <div>
                <p class="home-up-to-date__title">{{ t('home.upToDate.title') }}</p>
                <p class="home-up-to-date__text">{{ upToDate }}</p>
              </div>
            </div>
            <button type="button" class="home-up-to-date__add" @click="openCarnet">
              <v-icon icon="ms:add" size="20" />
              <span>{{ t('home.upToDate.add') }}</span>
            </button>
          </div>
        </template>

        <template v-if="rows.length > 0" #default>
          <div
            v-for="row in rows"
            :key="row.id"
            class="section-card__row reminder-row"
            :class="`reminder-row--${row.status}`"
          >
            <v-icon class="reminder-row__icon" :icon="row.icon" size="24" />
            <div class="reminder-row__text">
              <p class="reminder-row__title">{{ row.title }}</p>
              <p v-if="row.animalName" class="reminder-row__animal">{{ row.animalName }}</p>
            </div>
            <DueStatusChip
              class="reminder-row__badge"
              :status="row.status"
              :label="row.badge.text"
              :icon="row.badge.icon"
            />
          </div>
        </template>
      </SectionCard>

      <section class="home-quick-actions">
        <h2 class="home-quick-actions__title">{{ t('home.quickActions.title') }}</h2>
        <div class="home-quick-actions__grid">
          <button type="button" class="home-quick-tile" @click="openForm('treatment-new')">
            <v-icon class="home-quick-tile__icon" icon="ms:medication" size="24" />
            <span class="home-quick-tile__label">{{ t('home.quickActions.treatment') }}</span>
          </button>
          <button type="button" class="home-quick-tile" @click="openForm('vaccination-new')">
            <v-icon class="home-quick-tile__icon" icon="ms:vaccines" size="24" />
            <span class="home-quick-tile__label">{{ t('home.quickActions.vaccination') }}</span>
          </button>
          <button type="button" class="home-quick-tile" @click="isWeightSheetOpen = true">
            <v-icon class="home-quick-tile__icon" icon="ms:monitor_weight" size="24" />
            <span class="home-quick-tile__label">{{ t('home.quickActions.weight') }}</span>
          </button>
        </div>
      </section>

      <AnimalPickerSheet v-model="isPickerOpen" :animals="chips" @pick="onAnimalPicked" />
      <WeightSheet v-model="isWeightSheetOpen" :animal-id="animals.selectedAnimalId" />
    </template>

    <div v-else-if="isLoading" class="home-loading" role="status" :aria-label="t('home.loading')">
      <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
    </div>

    <div v-else class="home-error" role="alert">
      <v-icon class="home-error__icon" icon="ms:error" size="48" />
      <h1 class="home-error__title">{{ t('home.error.title') }}</h1>
      <p class="home-error__text">{{ t('home.error.text') }}</p>
      <v-btn class="home-error__retry" variant="flat" color="primary" @click="load">
        {{ t('home.error.retry') }}
      </v-btn>
    </div>
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;

.home {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 24px;
  background: rgb(var(--v-theme-background));
}

.home-header {
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: tokens.$height-header;
  padding: 0 20px 36px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-background));
}

.home-header__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 26px;
  font-weight: 700;
  line-height: 1.15;
}

.home-header__subtitle {
  margin: 2px 0 0;
  color: tokens.$color-on-primary-subtitle;
  font-size: 13.5px;
  font-weight: 500;
}

.home-todo {
  margin-top: 26px;
}

.home-reminders-off {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 18px 20px 0;
  padding: 9px 16px;
  border: 1px solid tokens.$color-reminders-off-border;
  border-radius: 14px;
  background: tokens.$color-reminders-off-surface;
}

.home-reminders-off__icon {
  flex: 0 0 auto;
  color: tokens.$color-text-secondary;
}

.home-reminders-off__title {
  margin: 0;
  color: tokens.$color-reminders-off-text;
  font-size: 13px;
  font-weight: 700;
}

.home-reminders-off__link {
  display: inline-flex;
  align-items: center;
  gap: 2px;
  margin-top: 3px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 12.5px;
  font-weight: 700;
  cursor: pointer;

  // Toute la surface du bandeau répond au tap, pas seulement la ligne de lien.
  &::after {
    position: absolute;
    inset: 0;
    border-radius: inherit;
    content: '';
  }

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-primary-darken-1));
  }
}

.home-reminders-off + .home-todo {
  margin-top: 22px;
}

.home-overdue-banner {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 14px;
  padding: 11px 14px;
  border-radius: 14px;
  background: rgb(var(--v-theme-overdue-container));
  color: rgb(var(--v-theme-on-overdue-container));
  font-size: 13.5px;
  font-weight: 700;
}

.reminder-row {
  gap: 14px;
}

.reminder-row--overdue::before {
  background: rgb(var(--v-theme-overdue));
}

.reminder-row--today::before {
  background: rgb(var(--v-theme-today));
}

.reminder-row--tomorrow::before,
.reminder-row--later::before {
  background: rgb(var(--v-theme-soon));
}

.reminder-row__icon {
  flex: 0 0 auto;
  color: rgb(var(--v-theme-primary));
}

.reminder-row__text {
  flex: 1 1 auto;
  min-width: 0;
}

.reminder-row__title {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
}

.reminder-row__animal {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 13px;
}

.home-up-to-date__row {
  display: flex;
  align-items: center;
  gap: 16px;
}

.home-up-to-date__dot {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  width: tokens.$size-status-dot;
  height: tokens.$size-status-dot;
  border-radius: 50%;
  background: rgb(var(--v-theme-up-to-date));
  color: rgb(var(--v-theme-on-up-to-date));
}

.home-up-to-date__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 18px;
  font-weight: 700;
}

.home-up-to-date__text {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.home-up-to-date__add {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin-top: 22px;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    color: rgb(var(--v-theme-primary-darken-1));
  }
}

.home-quick-actions {
  padding-inline: 20px;
  margin-top: 36px;
}

.home-quick-actions__title {
  margin: 0 0 12px;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 600;
}

.home-quick-actions__grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.home-quick-tile {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
  min-height: tokens.$height-quick-tile;
  padding: 12px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));
  color: rgb(var(--v-theme-on-surface));
  font-family: inherit;
  text-align: start;
  cursor: pointer;

  &:focus-visible {
    outline: 2px solid rgb(var(--v-theme-primary));
    outline-offset: 2px;
  }
}

.home-quick-tile__icon {
  color: rgb(var(--v-theme-primary));
}

.home-quick-tile__label {
  font-size: 13px;
  font-weight: 500;
  line-height: 1.25;
}

.home-loading {
  display: flex;
  justify-content: center;
  padding-top: 64px;
}

.home-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 18px;
  padding: 96px 24px 0;
  text-align: center;
}

.home-error__icon {
  color: rgb(var(--v-theme-primary));
}

.home-error__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
}

.home-error__text {
  margin: -6px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.home-error__retry {
  height: 52px;
  padding-inline: 28px;
  border-radius: 999px;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}

.home-welcome {
  display: flex;
  flex: 1 0 auto;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  padding: 32px 28px;
  text-align: center;
}

.home-welcome__illustration {
  width: 150px;
  height: auto;
  margin-bottom: 8px;
}

.home-welcome__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 27px;
  font-weight: 700;
  line-height: 1.2;
}

.home-welcome__text {
  max-width: 300px;
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15.5px;
  line-height: 1.45;
}

.home-welcome__create {
  width: 100%;
  height: 56px;
  margin-top: 16px;
  border-radius: tokens.$radius-tile;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
}
</style>
