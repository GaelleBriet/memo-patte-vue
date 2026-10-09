import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { useTreatmentGestures } from './use-treatment-gestures'
import { choiceGestures, chooseDaysSubtitle, type DayChoice } from '../logic/treatment-choose-days'
import type { DoseAction } from '../logic/treatment-dose-writes'
import { doseActionTexts, hasSeveralTimes } from '../logic/treatment-gestures'
import { restoredSuiteFor } from '../logic/treatment-shift-box'
import { stopPrompt } from '../logic/treatment-stop'
import { promptChoice, unloggedBanner, type PromptActionId } from '../logic/treatment-unlogged'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import type { DoseGesture, Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'

type DoseFlowState = {
  treatment: Readonly<Ref<TreatmentWithHistory | null>>
  schedule: Readonly<Ref<TreatmentSchedule | null>>
  today: Readonly<Ref<string>>
}

export type DoseFlowExits = {
  /** Après une prise, un lot de doses ou un arrêt réussis. */
  settled?: () => void
  /** Échec d'un arrêt : en toast, ou en message dans `stopError`. */
  stopFailure: 'toast' | 'message'
}

/**
 * Prises, doses à renseigner et arrêt d'un traitement, communs à la fiche et à la feuille
 * « À faire » ; chaque écran dit par `exits` ce qui suit un geste.
 */
export function useTreatmentDoseFlow(
  { treatment, schedule, today }: DoseFlowState,
  gestures: ReturnType<typeof useTreatmentGestures>,
  exits: DoseFlowExits,
) {
  const { t } = useI18n()
  const animals = useAnimalsStore()

  const choosing = ref<'log' | 'stop'>('log')
  const isChooseDaysOpen = ref(false)
  const stopError = ref<string | null>(null)

  const animal = computed(() => (treatment.value ? animals.byId(treatment.value.animalId) : null))
  const named = computed(() => ({
    name: treatment.value?.name ?? '',
    animal: animal.value?.name ?? '',
  }))
  const unlogged = computed(() =>
    animals.hasLoaded && treatment.value && schedule.value
      ? unloggedBanner(t, treatment.value, schedule.value, today.value, {
          followed: (animal.value?.unfollowedOn ?? null) === null,
        })
      : null,
  )
  const stopping = computed(() =>
    treatment.value && schedule.value
      ? stopPrompt(t, treatment.value, schedule.value, today.value)
      : null,
  )
  const chosen = computed(() => (choosing.value === 'stop' ? stopping.value : unlogged.value))
  const chooseDaysSubtitleText = computed(() =>
    chooseDaysSubtitle(named.value.name, named.value.animal, chosen.value?.when ?? null),
  )

  async function apply(action: DoseAction, line: Due | null, periodId: string): Promise<boolean> {
    const current = treatment.value
    if (current === null) return false
    const texts = doseActionTexts(
      t,
      { ...named.value, today: today.value, severalTimes: hasSeveralTimes(current, periodId) },
      action,
      line,
      restoredSuiteFor(current, action, today.value),
    )
    const applied = await gestures.applyDose(current, action, texts)
    if (applied) exits.settled?.()
    return applied
  }

  function note(gesture: DoseGesture): Promise<boolean> {
    return apply({ kind: 'note', gesture }, null, gesture.due.periodId)
  }

  async function log(choice: DayChoice): Promise<void> {
    const current = treatment.value
    if (current === null) return
    const action: DoseAction = { kind: 'log', gestures: choiceGestures(choice) }
    const texts = doseActionTexts(
      t,
      { ...named.value, today: today.value, severalTimes: false },
      action,
      null,
    )
    if ((await gestures.logDoses(current, action, texts)) === 'failed') return
    isChooseDaysOpen.value = false
    exits.settled?.()
  }

  function stopFailed(): void {
    if (exits.stopFailure === 'message') stopError.value = t('treatments.sheet.errors.stop')
  }

  async function stop(): Promise<void> {
    const current = treatment.value
    if (gestures.isBusy.value || current === null) return
    stopError.value = null
    const failed = exits.stopFailure === 'toast' ? t('treatments.sheet.errors.stop') : undefined
    if (await gestures.stop(current, failed)) exits.settled?.()
    else stopFailed()
  }

  async function logThenStop(choice: DayChoice): Promise<void> {
    const current = treatment.value
    if (gestures.isBusy.value || current === null) return
    stopError.value = null
    if ((await gestures.stopLogging(current, choiceGestures(choice))) === 'failed') {
      stopFailed()
      return
    }
    isChooseDaysOpen.value = false
    exits.settled?.()
  }

  function chooseDays(purpose: 'log' | 'stop'): void {
    choosing.value = purpose
    isChooseDaysOpen.value = true
  }

  function onUnloggedAction(action: PromptActionId): void {
    if (!unlogged.value) return
    if (action === 'choose-days') chooseDays('log')
    else void log(promptChoice(action, unlogged.value.dues))
  }

  function onStopAction(action: PromptActionId): void {
    if (!stopping.value) return
    if (action === 'choose-days') chooseDays('stop')
    else void logThenStop(promptChoice(action, stopping.value.dues))
  }

  function confirmChosenDays(choice: DayChoice): void {
    void (choosing.value === 'stop' ? logThenStop(choice) : log(choice))
  }

  return {
    animal,
    named,
    unlogged,
    stopping,
    choosing,
    chosen,
    chooseDaysSubtitleText,
    isChooseDaysOpen,
    stopError,
    apply,
    note,
    stop,
    onUnloggedAction,
    onStopAction,
    confirmChosenDays,
  }
}
