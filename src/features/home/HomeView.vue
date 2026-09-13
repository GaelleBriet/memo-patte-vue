<script setup lang="ts">
import { format } from 'date-fns'
import { computed, onMounted } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRouter } from 'vue-router'

import illustration from '@/assets/icon-foreground.png'
import { useAnimalsStore } from '@/features/animals/animals.store'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/AnimalChipSelector.vue'
import { buildReminders } from '@/shared/reminders'
import { useHomeStore } from './home.store'
import { overdueBanner, reminderRows, scopeCounter, upToDateText } from './home-summary'

const { t } = useI18n()
const router = useRouter()
const animals = useAnimalsStore()
const home = useHomeStore()

const today = format(new Date(), 'yyyy-MM-dd')

const hasError = computed(() => animals.error !== null || home.error !== null)
const isReady = computed(() => animals.hasLoaded && home.hasLoaded && !hasError.value)
const isLoading = computed(() => !isReady.value && !hasError.value)
const isWelcome = computed(() => isReady.value && animals.animals.length === 0)

const chips = computed<AnimalChipItem[]>(() =>
  animals.animals.map((item) => ({ id: item.id, name: item.name })),
)

const selectedName = computed(() => animals.selectedAnimal?.name ?? null)

const summary = computed(() =>
  buildReminders(home.sources, { today, animalId: animals.selectedAnimalId ?? undefined }),
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
      <img
        class="home-welcome__illustration"
        :src="illustration"
        :alt="t('home.welcome.illustration')"
      />
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

      <section class="home-todo">
        <div class="home-todo__heading">
          <h2 class="home-todo__title">{{ t('home.todo.title') }}</h2>
          <span v-if="counter" class="home-todo__counter">{{ counter }}</span>
        </div>

        <div v-if="banner" class="home-overdue-banner" role="status">
          <v-icon icon="ms:error" size="20" />
          <span>{{ banner }}</span>
        </div>

        <div v-if="rows.length > 0" class="home-reminders">
          <div
            v-for="row in rows"
            :key="row.id"
            class="reminder-row"
            :class="`reminder-row--${row.status}`"
          >
            <v-icon class="reminder-row__icon" :icon="row.icon" size="24" />
            <div class="reminder-row__text">
              <p class="reminder-row__title">{{ row.title }}</p>
              <p v-if="row.animalName" class="reminder-row__animal">{{ row.animalName }}</p>
            </div>
            <span class="reminder-row__badge">
              <v-icon v-if="row.badge.icon" :icon="row.badge.icon" size="16" />
              <span>{{ row.badge.text }}</span>
            </span>
          </div>
        </div>

        <div v-else class="home-up-to-date">
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
      </section>
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
  min-height: 100%;
  padding-bottom: 24px;
  background: rgb(var(--v-theme-background));
}

// Header

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

// À faire

.home-todo {
  padding-inline: 20px;
  margin-top: 26px;
}

.home-todo__heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 12px;
  margin-bottom: 12px;
}

.home-todo__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
}

.home-todo__counter {
  color: tokens.$color-text-meta;
  font-size: 13px;
  font-weight: 500;
  white-space: nowrap;
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

// Carte de rappels : une seule surface, une ligne par rappel

.home-reminders {
  overflow: hidden;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-card;
  background: rgb(var(--v-theme-surface));
}

.reminder-row {
  display: flex;
  position: relative;
  align-items: center;
  gap: 14px;
  min-height: tokens.$height-list-row;
  padding: 14px 20px;
}

.reminder-row + .reminder-row {
  border-top: 1px solid tokens.$color-divider;
}

.reminder-row::before {
  position: absolute;
  inset-block: 0;
  inset-inline-start: 0;
  width: tokens.$width-urgency-bar;
  content: '';
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

.reminder-row__badge {
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

.reminder-row--overdue .reminder-row__badge {
  background: rgb(var(--v-theme-overdue-container));
  color: rgb(var(--v-theme-on-overdue-container));
}

.reminder-row--today .reminder-row__badge {
  background: rgb(var(--v-theme-today-container));
  color: rgb(var(--v-theme-on-today-container));
}

.reminder-row--tomorrow .reminder-row__badge,
.reminder-row--later .reminder-row__badge {
  background: rgb(var(--v-theme-soon-container));
  color: rgb(var(--v-theme-on-soon-container));
}

// Tout est à jour

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

// Chargement et erreur

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

// Premier lancement : écran plein, sans header, la bottom nav reste visible

.home-welcome {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 18px;
  min-height: calc(100dvh - #{tokens.$height-bottom-nav + tokens.$padding-bottom-nav});
  padding: 32px 28px;
  text-align: center;
}

.home-welcome__illustration {
  width: 150px;
  height: 150px;
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
