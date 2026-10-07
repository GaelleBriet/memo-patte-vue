<script setup lang="ts">
import { computed, onMounted, ref, useTemplateRef, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { promptNotificationsIfReminders } from '@/app/reminders-priming'
import { useForegroundRefresh } from '@/core/app-lifecycle/use-foreground-refresh'
import { usePhotoUrls } from '@/core/photos/use-photo-urls'
import illustration from '@/assets/brand-illustration.png'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import ImportSheet from '@/features/settings/views/ImportSheet.vue'
import TreatmentGivenWhenSheet from '@/features/treatments/views/TreatmentGivenWhenSheet.vue'
import TreatmentReminderSheet from '@/features/treatments/views/TreatmentReminderSheet.vue'
import VaccinationReminderSheet from '@/features/vaccinations/views/VaccinationReminderSheet.vue'
import WeightSheet from '@/features/weight/views/WeightSheet.vue'
import AnimalChipSelector, { type AnimalChipItem } from '@/shared/components/AnimalChipSelector.vue'
import UnfollowedAnimalsLink from '@/shared/components/UnfollowedAnimalsLink.vue'
import {
  detailRoute,
  parseReminderRequest,
  REMINDER_STEP_QUERY_PARAM,
  withoutReminderRequest,
  type NotifiedDue,
  type ReminderRequest,
  type ReminderStep,
  type TodoRequest,
} from '@/shared/domain/reminder-route'
import { unfollowedEntry } from '@/shared/domain/unfollowed-animals'
import AnimalPickerSheet from './AnimalPickerSheet.vue'
import HomeMessages from './HomeMessages.vue'
import HomeTodoCard from './HomeTodoCard.vue'
import { useHomeStore } from '../store/home.store'
import {
  nextReminderText,
  overdueBanner,
  reminderRows,
  rowToReopen,
  scopeCounter,
  upToDateText,
  type ReminderRow,
} from '../logic/home-summary'
import { currentAnimalId } from '../logic/current-animal'
import { todoItems } from '../logic/todo-items'
import { buildTodo } from '../logic/todo-window'

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()
const home = useHomeStore()

const { today } = useForegroundRefresh(load)

const hasError = computed(() => animals.error !== null || home.error !== null)
const isReady = computed(() => animals.hasLoaded && home.hasLoaded && !hasError.value)
const isLoading = computed(() => !isReady.value && !hasError.value)
const isWelcome = computed(() => isReady.value && animals.animals.length === 0)
const unfollowed = computed(() =>
  animals.followedAnimals.length === 0 ? unfollowedEntry(animals.unfollowedAnimals) : null,
)

const photoUrl = usePhotoUrls(() => animals.followedAnimals.map((item) => item.photoPath))
const chips = computed<AnimalChipItem[]>(() =>
  animals.followedAnimals.map((item) => ({
    id: item.id,
    name: item.name,
    photoUrl: photoUrl(item.photoPath),
  })),
)

const currentId = computed<string | null>({
  get: () =>
    currentAnimalId({
      selectedId: animals.selectedAnimalId,
      animalIds: animals.followedAnimals.map((animal) => animal.id),
    }),
  set: (id) => animals.select(id),
})

const currentName = computed(
  () => animals.followedAnimals.find((animal) => animal.id === currentId.value)?.name ?? null,
)

const followedIds = computed(() => new Set(animals.followedAnimals.map(({ id }) => id)))
const items = computed(() => todoItems(home.sources, today.value, followedIds.value))
const summary = computed(() => buildTodo(items.value, { animalId: currentId.value ?? undefined }))

const rowOptions = computed(() => ({
  animalNames: new Map(animals.followedAnimals.map((animal) => [animal.id, animal.name])),
  showAnimal: currentName.value === null,
}))

const rows = computed(() => reminderRows(t, summary.value.items, rowOptions.value))

const counter = computed(() =>
  scopeCounter(t, { total: summary.value.total, animalName: currentName.value }),
)
const banner = computed(() => overdueBanner(t, summary.value.overdue))
const upToDate = computed(() =>
  upToDateText(t, {
    animalName: currentName.value,
    allNames: animals.followedAnimals.map((animal) => animal.name),
  }),
)
const nextReminder = computed(() => nextReminderText(t, summary.value.next, rowOptions.value))

function load(): Promise<unknown> {
  return Promise.all([animals.load(), home.load()])
}

function takeReminderRequest(): ReminderRequest | null {
  const request = parseReminderRequest(route.query)
  if (request) void router.replace({ query: withoutReminderRequest(route.query) })
  return request
}

// Le Carnet laisse un animal sélectionné dans le store partagé : l'accueil ne le reprend pas.
onMounted(() => {
  animals.select(null)
  const fromNotification = route.query[REMINDER_STEP_QUERY_PARAM] !== undefined
  const request = takeReminderRequest()
  void load().then(() => {
    if (request) reopenReminder(request, { fromNotification })
  })
})

// Seule une notification pose l'étape : le rappel que « Modifier » laisse dans l'adresse attend le retour.
watch(
  () => route.query[REMINDER_STEP_QUERY_PARAM],
  (step) => {
    if (step === undefined) return
    const request = takeReminderRequest()
    if (!request) return
    animals.select(null)
    isTreatmentSheetOpen.value = false
    isVaccinationSheetOpen.value = false
    isGivenWhenOpen.value = false
    void load().then(() => reopenReminder(request, { fromNotification: true }))
  },
)

type FormRoute = 'treatment-new' | 'vaccination-new'

const pendingForm = ref<FormRoute | null>(null)
const isPickerOpen = ref(false)
const isWeightSheetOpen = ref(false)
const openedReminder = ref<TodoRequest | null>(null)
const openedStep = ref<ReminderStep>('actions')
const isTreatmentSheetOpen = ref(false)
const isVaccinationSheetOpen = ref(false)
const givenWhen = ref<{ id: string; due: NotifiedDue } | null>(null)
const isGivenWhenOpen = ref(false)

function openReminder(request: TodoRequest, step: ReminderStep = 'actions'): void {
  openedReminder.value = request
  openedStep.value = step
  if (request.kind === 'treatment') isTreatmentSheetOpen.value = true
  else isVaccinationSheetOpen.value = true
}

function openRow(row: ReminderRow): void {
  if (row.opens === 'detail') void router.push(detailRoute(row.request))
  else openReminder(row.request)
}

/** Hors de « À faire », une notification ouvre la fiche du soin : jamais sans réponse. */
function reopenReminder(
  request: ReminderRequest,
  { fromNotification }: { fromNotification: boolean },
): void {
  const { kind, id } = request
  if (request.step === 'given-when') {
    givenWhen.value = { id, due: request.due }
    isGivenWhenOpen.value = true
    return
  }
  const reminder = { kind, id }
  const row = rowToReopen(rows.value, request)
  if (row) {
    openReminder(row.request, request.step)
  } else if (fromNotification) {
    void router.push(detailRoute(reminder))
  }
}

function onGivenWhenUnavailable(): void {
  if (givenWhen.value === null) return
  reopenReminder(
    { kind: 'treatment', id: givenWhen.value.id, step: 'actions' },
    { fromNotification: true },
  )
}

function openForm(name: FormRoute): void {
  const animalId = currentId.value
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

const importSheet = useTemplateRef('importSheet')
const isImporting = ref(false)

async function onImported(): Promise<void> {
  await load()
  await promptNotificationsIfReminders(router, 'home')
}

function createAnimal(): void {
  void router.push({ name: 'animal-new' })
}

function openSettings(): void {
  void router.push({ name: 'settings' })
}

function openUnfollowed(): void {
  const target = unfollowed.value?.target
  if (target?.kind === 'list') {
    void router.push({ name: 'unfollowed-animals' })
  } else if (target) {
    animals.select(target.animalId)
    void router.push({ name: 'animals' })
  }
}

function openCarnet(): void {
  const animalId = currentId.value ?? animals.followedAnimals[0]?.id
  if (!animalId) return
  animals.select(animalId)
  void router.push({ name: 'animals' })
}
</script>

<template>
  <div class="home">
    <div v-if="isWelcome" class="home-welcome">
      <v-btn
        class="home-welcome__settings"
        icon="ms:settings"
        variant="text"
        :aria-label="t('settings.open')"
        @click="openSettings"
      />
      <img class="home-welcome__illustration" :src="illustration" alt="" />
      <h1 class="home-welcome__title">{{ t('home.welcome.title') }}</h1>
      <p class="home-welcome__text">{{ t('home.welcome.text') }}</p>
      <p class="home-welcome__local">{{ t('home.welcome.local') }}</p>
      <v-btn
        class="home-welcome__create"
        variant="flat"
        color="primary"
        prepend-icon="ms:add"
        @click="createAnimal"
      >
        {{ t('home.welcome.create') }}
      </v-btn>
      <button
        type="button"
        class="home-welcome__import"
        :disabled="isImporting"
        :aria-busy="isImporting"
        @click="importSheet?.pickFile()"
      >
        {{ t('home.welcome.import') }}
      </button>
    </div>

    <template v-else-if="isReady">
      <header class="home-header">
        <div class="home-header__line">
          <div class="home-header__text">
            <h1 class="home-header__title">{{ t('home.title') }}</h1>
            <p class="home-header__subtitle">{{ t('home.header.household') }}</p>
          </div>
          <v-btn
            class="home-header__settings"
            icon="ms:settings"
            variant="text"
            :aria-label="t('settings.open')"
            @click="openSettings"
          />
        </div>
      </header>

      <section v-if="unfollowed" class="home-unfollowed">
        <div class="home-unfollowed__icon">
          <v-icon icon="ms:pets" size="32" />
        </div>
        <h2 class="home-unfollowed__title">{{ t('home.unfollowed.title') }}</h2>
        <p class="home-unfollowed__text">{{ t('home.unfollowed.text', unfollowed.count) }}</p>
        <v-btn
          class="home-unfollowed__create"
          variant="flat"
          color="primary"
          prepend-icon="ms:add"
          @click="createAnimal"
        >
          {{ t('home.unfollowed.create') }}
        </v-btn>
        <UnfollowedAnimalsLink :count="unfollowed.count" @open="openUnfollowed" />
      </section>

      <template v-else>
        <AnimalChipSelector
          v-model:selected-id="currentId"
          :animals="chips"
          mode="filter"
          @add="createAnimal"
        />

        <HomeMessages place="aboveTodo" />

        <HomeTodoCard
          :rows="rows"
          :counter="counter"
          :banner="banner"
          :next-reminder="nextReminder"
          :up-to-date="upToDate"
          @open="openRow"
          @add="openCarnet"
        />

        <HomeMessages place="belowTodo" />

        <section class="home-quick-actions">
          <h2 class="home-quick-actions__title">{{ t('home.quickActions.title') }}</h2>
          <div class="home-quick-actions__grid">
            <button type="button" class="home-quick-tile" @click="openForm('treatment-new')">
              <v-icon class="home-quick-tile__icon" icon="ms:medication" size="22" />
              <span class="home-quick-tile__label">{{ t('home.quickActions.treatment') }}</span>
            </button>
            <button type="button" class="home-quick-tile" @click="openForm('vaccination-new')">
              <v-icon class="home-quick-tile__icon" icon="ms:vaccines" size="22" />
              <span class="home-quick-tile__label">{{ t('home.quickActions.vaccination') }}</span>
            </button>
            <button type="button" class="home-quick-tile" @click="isWeightSheetOpen = true">
              <v-icon class="home-quick-tile__icon" icon="ms:monitor_weight" size="22" />
              <span class="home-quick-tile__label">{{ t('home.quickActions.weight') }}</span>
            </button>
          </div>
        </section>

        <AnimalPickerSheet v-model="isPickerOpen" :animals="chips" @pick="onAnimalPicked" />
        <WeightSheet v-model="isWeightSheetOpen" :animal-id="currentId" />
      </template>
      <TreatmentReminderSheet
        v-model="isTreatmentSheetOpen"
        :treatment-id="openedReminder?.kind === 'treatment' ? openedReminder.id : null"
        :due="openedReminder?.kind === 'treatment' ? openedReminder.due : null"
        @changed="load"
      />
      <TreatmentGivenWhenSheet
        v-model="isGivenWhenOpen"
        :treatment-id="givenWhen?.id ?? null"
        :due="givenWhen?.due ?? null"
        @changed="load"
        @unavailable="onGivenWhenUnavailable"
      />
      <VaccinationReminderSheet
        v-model="isVaccinationSheetOpen"
        :vaccination-id="openedReminder?.kind === 'vaccination' ? openedReminder.id : null"
        :start-at="openedStep"
        @changed="load"
      />
    </template>

    <div v-else-if="isLoading" class="home-loading" role="status" :aria-label="t('home.loading')">
      <v-progress-circular indeterminate color="primary" :size="32" :width="3" />
    </div>

    <div v-else class="home-error" role="alert">
      <v-icon class="home-error__icon" icon="ms:error" size="48" />
      <h1 class="home-error__title">{{ t('home.error.title') }}</h1>
      <p class="home-error__text">{{ t('home.error.text') }}</p>
      <v-btn class="home-error__retry" variant="flat" color="primary" @click="load()">
        {{ t('home.error.retry') }}
      </v-btn>
    </div>

    <ImportSheet ref="importSheet" v-model:busy="isImporting" @imported="onImported" />
  </div>
</template>

<style scoped lang="scss">
@use '@/styles/tokens' as tokens;
@use '@/styles/tap-target' as tap;

.home {
  display: flex;
  flex-direction: column;
  min-height: 100%;
  padding-bottom: 24px;
  background: rgb(var(--v-theme-background));
}

.home-header {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: flex-end;
  height: tokens.$height-header;
  padding: 0 20px 36px;
  background: rgb(var(--v-theme-primary));
  color: rgb(var(--v-theme-background));
}

.home-header__line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.home-header__text {
  min-width: 0;
}

.home-header__settings {
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  // Rend les 12 px que la zone de tap ajoute autour du glyphe : l'icône s'aligne
  // sur le bord droit du contenu, pas sur celui de sa cible.
  margin-inline-end: -12px;
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

.home-reminders-off + .home-todo {
  margin-top: 22px;
}

.home-quick-actions {
  padding-inline: 20px;
  margin-top: 36px;
}

.home-quick-actions__title {
  margin: 0 0 12px;
  font-family: tokens.$font-family-heading;
  font-size: 21px;
  font-weight: 700;
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
  gap: 6px;
  min-height: tokens.$height-quick-tile;
  padding: 10px;
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
  line-height: 1.2;
}

.home-unfollowed {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 24px 18px 0;
}

.home-unfollowed__icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 64px;
  height: 64px;
  margin-top: 12px;
  border-radius: 50%;
  background: tokens.$color-notice-surface;
  color: rgb(var(--v-theme-primary));
}

.home-unfollowed__title {
  margin: 0;
  font-family: tokens.$font-family-heading;
  font-size: 24px;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.02em;
}

.home-unfollowed__text {
  margin: 0;
  color: tokens.$color-text-secondary;
  font-size: 15px;
  line-height: 1.5;
}

.home-unfollowed__create {
  height: 52px;
  border-radius: tokens.$radius-tile;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
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
  position: relative;
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

.home-welcome__local {
  max-width: 300px;
  margin: -8px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
  font-weight: 500;
  line-height: 1.45;
}

.home-welcome__settings {
  position: absolute;
  inset-block-start: 8px;
  inset-inline-end: 8px;
  width: 48px;
  height: 48px;
  color: rgb(var(--v-theme-primary));
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

.home-welcome__import {
  position: relative;
  padding: 0;
  border: 0;
  background: transparent;
  color: rgb(var(--v-theme-primary));
  font-family: inherit;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;

  @include tap.tap-target;

  @media (hover: hover) {
    &:hover {
      color: rgb(var(--v-theme-primary-darken-1));
    }
  }

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-primary-darken-1));
  }
}
</style>
