import { computed, ref, type Ref } from 'vue'
import { useI18n } from 'vue-i18n'

import type { useTreatmentGestures } from './use-treatment-gestures'
import { choiceGestures, chooseDaysSubtitle, type DayChoice } from '../logic/treatment-choose-days'
import type { DoseAction, NoteGesture } from '../logic/treatment-dose-change'
import { doseActionTexts, hasSeveralTimes, type DueDay } from '../logic/treatment-gestures'
import { restoredSuiteFor } from '../logic/treatment-restored-suite'
import { stopPrompt } from '../logic/treatment-stop'
import { promptChoice, unloggedBanner, type PromptActionId } from '../logic/treatment-unlogged'
import type { TreatmentWithPeriods } from '../schema/treatment-with-periods.schema'
import { useAnimalsStore } from '@/features/animals/store/animals.store'
import type { TreatmentReading } from '@/shared/domain/treatment-reading'

type DoseFlowState = {
  treatment: Readonly<Ref<TreatmentWithPeriods | null>>
  reading: Readonly<Ref<TreatmentReading | null>>
  today: Readonly<Ref<string>>
}

export type DoseFlowExits = {
  /** Après une prise, un lot de doses ou un arrêt réussis. */
  settled?: () => void
}

/**
 * Prises, doses à renseigner et arrêt d'un traitement, communs à la fiche et à la feuille
 * « À faire » ; chaque écran dit par `exits` ce qui suit un geste.
 */
export function useTreatmentDoseFlow(
  { treatment, reading, today }: DoseFlowState,
  gestures: ReturnType<typeof useTreatmentGestures>,
  exits: DoseFlowExits = {},
) {
  const { t } = useI18n()
  const animals = useAnimalsStore()

  const choosing = ref<'log' | 'stop'>('log')
  const isChooseDaysOpen = ref(false)

  const animal = computed(() => (treatment.value ? animals.byId(treatment.value.animalId) : null))
  const named = computed(() => ({
    name: treatment.value?.name ?? '',
    animal: animal.value?.name ?? '',
  }))
  const unlogged = computed(() =>
    animals.hasLoaded && treatment.value && reading.value
      ? unloggedBanner(t, treatment.value, reading.value.view, today.value, {
          followed: (animal.value?.unfollowedOn ?? null) === null,
        })
      : null,
  )
  const stopping = computed(() =>
    treatment.value && reading.value
      ? stopPrompt(t, treatment.value, reading.value.view, today.value)
      : null,
  )
  const chosen = computed(() => (choosing.value === 'stop' ? stopping.value : unlogged.value))
  const chooseDaysSubtitleText = computed(() =>
    chooseDaysSubtitle(named.value.name, named.value.animal, chosen.value?.when ?? null),
  )

  async function apply(
    action: DoseAction,
    line: DueDay | null,
    settingId: string,
  ): Promise<boolean> {
    const current = treatment.value
    if (current === null) return false
    const texts = doseActionTexts(
      t,
      { ...named.value, today: today.value, severalTimes: hasSeveralTimes(current, settingId) },
      action,
      line,
      reading.value === null
        ? null
        : restoredSuiteFor({ treatment: current, reading: reading.value }, action),
    )
    const applied = await gestures.applyDose(current, action, texts)
    if (applied) exits.settled?.()
    return applied
  }

  function note(gesture: NoteGesture, heldBy?: string): Promise<boolean> {
    return apply({ kind: 'note', gesture, heldBy }, null, gesture.due.settingId)
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

  async function stop(): Promise<void> {
    const current = treatment.value
    if (gestures.isBusy.value || current === null) return
    if (await gestures.stop(current, t('treatments.sheet.errors.stop'))) exits.settled?.()
  }

  async function logThenStop(choice: DayChoice): Promise<void> {
    const current = treatment.value
    if (gestures.isBusy.value || current === null) return
    if ((await gestures.stopLogging(current, choiceGestures(choice))) === 'failed') return
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
    apply,
    note,
    stop,
    onUnloggedAction,
    onStopAction,
    confirmChosenDays,
  }
}
