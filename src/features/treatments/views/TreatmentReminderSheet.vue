<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { useRoute, useRouter } from 'vue-router'

import { useTreatmentGestures } from '../composables/use-treatment-gestures'
import { otherDaySummary, treatmentSheetTexts } from '../logic/treatment-sheet'
import type { Treatment } from '../schema/treatment.schema'
import { useTreatmentsStore } from '../store/treatments.store'
import { useToday } from '@/core/app-lifecycle/use-today'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import BottomSheet from '@/shared/components/BottomSheet.vue'
import ConfirmDialog from '@/shared/components/ConfirmDialog.vue'
import DateCalendar from '@/shared/components/DateCalendar.vue'
import ReminderActions from '@/shared/components/ReminderActions.vue'
import { REMINDER_QUERY_PARAM, reminderQueryValue } from '@/shared/domain/reminder-route'
import { reminderIcon } from '@/shared/domain/reminders'
import { showToast } from '@/shared/utils/toast'

const props = defineProps<{
  treatmentId: string | null
}>()

const emit = defineEmits<{
  /** Une prise, un arrêt ou leur annulation a changé le traitement. */
  changed: []
}>()

const open = defineModel<boolean>({ default: false })

const { t } = useI18n()
const router = useRouter()
const route = useRoute()
const animals = useAnimalsStore()
const treatments = useTreatmentsStore()
const { today, refresh: refreshToday } = useToday()

const treatment = ref<Treatment | null>(null)
const step = ref<'actions' | 'other-date'>('actions')
const givenOn = ref<string | null>(today.value)
const gestures = useTreatmentGestures(() => emit('changed'))
const isSubmitting = gestures.isBusy
const errorMessage = ref<string | null>(null)
const isStopDialogOpen = ref(false)

const isShown = computed({
  get: () => open.value && treatment.value !== null,
  set: (shown) => {
    if (!shown) open.value = false
  },
})

const animal = computed(() => (treatment.value ? animals.byId(treatment.value.animalId) : null))
const texts = computed(() =>
  treatment.value
    ? treatmentSheetTexts(t, treatment.value, {
        animal: animal.value?.name ?? '',
        today: today.value,
      })
    : null,
)
const summary = computed(() =>
  treatment.value
    ? otherDaySummary(t, treatment.value, givenOn.value ?? today.value, today.value)
    : null,
)
const title = computed(() =>
  step.value === 'actions' ? (treatment.value?.name ?? '') : t('treatments.sheet.otherDay.title'),
)
const subtitle = computed(() =>
  step.value === 'actions' ? texts.value?.subtitle : texts.value?.otherDaySubtitle,
)

watch(
  open,
  async (isOpen) => {
    if (!isOpen) return
    refreshToday()
    step.value = 'actions'
    givenOn.value = today.value
    errorMessage.value = null
    treatment.value = null
    if (!animals.hasLoaded) void animals.load()
    try {
      treatment.value = props.treatmentId ? await treatments.getById(props.treatmentId) : null
    } catch {
      treatment.value = null
    }
    if (treatment.value === null && open.value) {
      open.value = false
      showToast(t('treatments.form.errors.load'), { tone: 'error' })
    }
  },
  { immediate: true },
)

async function record(date: string): Promise<void> {
  const current = treatment.value
  if (isSubmitting.value || current === null) return
  errorMessage.value = null
  if (await gestures.recordDose(current, date)) open.value = false
  else errorMessage.value = t('treatments.sheet.errors.dose')
}

async function stop(): Promise<void> {
  const current = treatment.value
  if (isSubmitting.value || current === null) return
  errorMessage.value = null
  if (await gestures.stop(current)) open.value = false
  else errorMessage.value = t('treatments.sheet.errors.stop')
}

// L'écran d'accueil garde le rappel dans son adresse : le retour, bouton Android compris, rouvre la feuille.
async function edit(): Promise<void> {
  const current = treatment.value
  if (current === null) return
  const reminder = reminderQueryValue({ kind: 'treatment', id: current.id })
  open.value = false
  await router.replace({ query: { ...route.query, [REMINDER_QUERY_PARAM]: reminder } })
  await router.push({
    name: 'treatment-edit',
    params: { id: current.id },
    query: { from: String(route.name ?? ''), [REMINDER_QUERY_PARAM]: reminder },
  })
}
</script>

<template>
  <BottomSheet
    v-model="isShown"
    class="treatment-reminder-sheet"
    :title="title"
    :subtitle="subtitle"
    :close-label="t('reminderSheet.close')"
    :icon="treatment && step === 'actions' ? reminderIcon('treatment', treatment.type) : null"
    :back-label="step === 'other-date' ? t('treatments.sheet.otherDay.back') : null"
    :persistent="isSubmitting"
    @back="step = 'actions'"
  >
    <template v-if="treatment && texts">
      <ReminderActions
        v-if="step === 'actions'"
        :due-text="texts.due"
        :done-today-aria-label="texts.doneTodayLabel"
        :edit-hint="t('treatments.sheet.editHint')"
        :busy="isSubmitting"
        @done-today="record(today)"
        @other-date="step = 'other-date'"
        @edit="edit"
      >
        <template #footer>
          <button
            type="button"
            class="treatment-reminder-sheet__stop"
            :aria-label="texts.stopLabel"
            :disabled="isSubmitting"
            @click="isStopDialogOpen = true"
          >
            <v-icon icon="ms:do_not_disturb_on" size="22" />
            <span>{{ t('treatments.sheet.stop') }}</span>
          </button>
        </template>
      </ReminderActions>

      <div v-else-if="summary" class="treatment-reminder-sheet__other-date">
        <DateCalendar
          v-model="givenOn"
          class="treatment-reminder-sheet__calendar"
          :min="animal?.birthDate ?? null"
          :max="today"
        />
        <div class="treatment-reminder-sheet__summary" aria-live="polite">
          <v-icon icon="ms:event_available" size="24" />
          <div>
            <p class="treatment-reminder-sheet__dose-on">{{ summary.doseOn }}</p>
            <p class="treatment-reminder-sheet__next-dose">{{ summary.nextDose }}</p>
          </div>
        </div>
        <v-btn
          class="treatment-reminder-sheet__submit"
          variant="flat"
          color="primary"
          :disabled="isSubmitting"
          @click="record(givenOn ?? today)"
        >
          <v-progress-circular v-if="isSubmitting" indeterminate :size="18" :width="2" />
          <v-icon v-else icon="ms:check" size="22" />
          {{ summary.submit }}
        </v-btn>
      </div>

      <p v-if="errorMessage" class="treatment-reminder-sheet__error" role="alert">
        {{ errorMessage }}
      </p>
    </template>
  </BottomSheet>

  <ConfirmDialog
    v-if="texts"
    v-model="isStopDialogOpen"
    :title="texts.stopDialog.title"
    :text="t('treatments.sheet.stopDialog.text')"
    :cancel-label="t('treatments.sheet.stopDialog.cancel')"
    :confirm-label="t('treatments.sheet.stopDialog.confirm')"
    :cancel-aria-label="texts.stopDialog.cancelLabel"
    :confirm-aria-label="texts.stopDialog.confirmLabel"
    @confirm="stop"
  />
</template>

<style lang="scss">
@use '@/styles/tokens' as tokens;

// Non scopé : la feuille est téléportée hors du composant.
.treatment-reminder-sheet__stop {
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
  font-size: 15.5px;
  font-weight: 600;
  text-align: start;
  cursor: pointer;

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  &:focus-visible {
    outline: none;
    color: rgb(var(--v-theme-on-surface));
  }
}

.treatment-reminder-sheet__calendar {
  margin-top: 12px;
}

.treatment-reminder-sheet__summary {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-top: 8px;
  padding: 12px 16px;
  border: 1px solid tokens.$color-card-border;
  border-radius: tokens.$radius-tile;
  background: rgb(var(--v-theme-surface));

  > .v-icon {
    flex: 0 0 auto;
    color: rgb(var(--v-theme-primary));
  }
}

.treatment-reminder-sheet__dose-on {
  margin: 0;
  font-size: 15.5px;
  font-weight: 700;
}

.treatment-reminder-sheet__next-dose {
  margin: 2px 0 0;
  color: tokens.$color-text-secondary;
  font-size: 14px;
}

.treatment-reminder-sheet__submit {
  width: 100%;
  gap: 8px;
  height: 52px;
  margin-top: 14px;
  border-radius: tokens.$radius-pill;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: normal;
  text-transform: none;
}

.treatment-reminder-sheet__error {
  margin: 12px 0 0;
  color: rgb(var(--v-theme-error));
  font-size: 13px;
  font-weight: 500;
}
</style>
