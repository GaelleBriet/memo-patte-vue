import { logTexts, noteTexts } from './treatment-dose-texts'
import type { DoseAction, DoseChange } from './treatment-dose-change'
import { moveTexts, redateTexts, removeTexts } from './treatment-line-texts'
import type { RevealedDues } from './treatment-revealed-dues'
import type { TreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentWithPeriods } from '../schema/treatment-with-history.schema'
import type { Due } from '@/shared/domain/dose-calendar'
import { isSeveralTimesADay } from '@/shared/domain/treatment-periods'
import { formatClockTime, formatDayMonthOrYear } from '@/shared/utils/format'
import type { Translate } from '@/core/i18n/translate'

export type GestureContext = {
  name: string
  animal: string
  today: string
  /** La période de l'échéance a plusieurs heures par jour : les textes disent l'heure. */
  severalTimes: boolean
}

export type DoseActionTexts = {
  /** `finishes` : le geste a fait passer le traitement dans « Traitements terminés » (TR-31). */
  done(
    applied: Pick<DoseChange, 'followed' | 'moved' | 'shiftKept'> & {
      finishes?: boolean
      heldBy?: string
      lostToEnd?: readonly string[]
      revealed?: RevealedDues | null
    },
  ): string
  /** Nom du bouton « Annuler » lu par le lecteur d'écran. */
  undo: string
  already(givenOn: string): string
}

export type DueDay = Pick<Due, 'dueOn' | 'dueTime'> & {
  status?: TreatmentDose['status']
  createdAt?: string
}

export function hasSeveralTimes(
  treatment: Pick<TreatmentWithPeriods, 'periods'>,
  periodId: string,
): boolean {
  const period = treatment.periods.find(({ id }) => id === periodId)
  return period !== undefined && isSeveralTimesADay(period)
}

/** « Prise de X déjà notée aujourd'hui pour Y », ou « du {date} » un autre jour. */
export function alreadyNotedText(
  t: Translate,
  { name, animal, today }: Pick<GestureContext, 'name' | 'animal' | 'today'>,
  givenOn: string,
): string {
  return givenOn === today
    ? t('notifications.action.alreadyDoseToday', { name, animal })
    : t('notifications.action.alreadyDose', {
        name,
        animal,
        date: formatDayMonthOrYear(givenOn, today),
      })
}

/** Après « Supprimer ce décalage », la prochaine dose et la fréquence de sa période. */
export type RestoredSuite = { nextOn: string | null; weekly: boolean }

/** Ce que chaque texte de geste emprunte à la fiche : les noms, les dates et la phrase « déjà notée ». */
export type TextTools = {
  t: Translate
  name: string
  animal: string
  today: string
  severalTimes: boolean
  day(date: string): string
  dueDay(due: DueDay): string
  already(givenOn: string): string
}

export function doseActionTexts(
  t: Translate,
  { name, animal, today, severalTimes }: GestureContext,
  action: DoseAction,
  line: DueDay | null,
  restored: RestoredSuite | null = null,
): DoseActionTexts {
  const day = (date: string) => formatDayMonthOrYear(date, today)
  const tools: TextTools = {
    t,
    name,
    animal,
    today,
    severalTimes,
    day,
    dueDay: ({ dueOn, dueTime }) =>
      severalTimes && dueTime !== null
        ? t('currentDose.at', { date: day(dueOn), time: formatClockTime(dueTime) })
        : day(dueOn),
    already: (givenOn) => alreadyNotedText(t, { name, animal, today }, givenOn),
  }
  switch (action.kind) {
    case 'note':
      return noteTexts(tools, action.gesture)
    case 'log':
      return logTexts(tools, action.gestures)
    case 'remove':
      return removeTexts(tools, line, restored)
    case 'redate':
      return redateTexts(tools, action.givenOn)
    case 'move':
      return moveTexts(tools)
  }
}
