import type { DoseAction, DoseChange } from './treatment-dose-writes'
import { moveText, type DoseLineAction } from './treatment-history'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import type { Due, MoveBounds, TreatmentDoseInput } from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatDayMonthOrYear,
  formatFullDate,
  formatLongDate,
  nonBreaking,
} from '@/shared/utils/format'

export type Translate = (key: string, named?: Record<string, unknown>, plural?: number) => string

export type GestureContext = {
  name: string
  animal: string
  today: string
  /** La période de l'échéance a plusieurs heures par jour : les textes disent l'heure. */
  severalTimes: boolean
}

export type DoseActionTexts = {
  done(applied: Pick<DoseChange, 'postponement'>): string
  /** Nom du bouton « Annuler » lu par le lecteur d'écran. */
  undo: string
  already(givenOn: string): string
}

type DueDay = Pick<Due, 'dueOn' | 'dueTime'>

export function hasSeveralTimes(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
  periodId: string,
): boolean {
  return (treatment.periods.find(({ id }) => id === periodId)?.times.length ?? 0) > 1
}

/** Textes du toast d'un geste sur une prise ou un report ; `line` : la ligne touchée, s'il y en a une. */
export function doseActionTexts(
  t: Translate,
  { name, animal, today, severalTimes }: GestureContext,
  action: DoseAction,
  line: DueDay | null,
): DoseActionTexts {
  const named = { name, animal }
  const day = (date: string) => formatDayMonthOrYear(date, today)
  const dueDay = ({ dueOn, dueTime }: DueDay) =>
    severalTimes && dueTime !== null
      ? t('currentDose.at', { date: day(dueOn), time: formatClockTime(dueTime) })
      : day(dueOn)
  const already = (givenOn: string) =>
    givenOn === today
      ? t('notifications.action.alreadyDoseToday', named)
      : t('notifications.action.alreadyDose', { ...named, date: day(givenOn) })

  switch (action.kind) {
    case 'note': {
      const { gesture } = action
      if (gesture.kind === 'missed') {
        return {
          done: () => t('treatments.history.toast.missed', { date: dueDay(gesture.due) }),
          undo: t('treatments.history.toast.undoMissed', {
            date: formatFullDate(gesture.due.dueOn),
          }),
          already,
        }
      }
      const time =
        severalTimes && gesture.due.dueTime !== null ? formatClockTime(gesture.due.dueTime) : null
      const date = gesture.givenOn === today ? null : day(gesture.givenOn)
      const done = () => {
        if (time === null) {
          return date === null
            ? t('treatments.sheet.toast.dose', named)
            : t('treatments.sheet.toast.doseOn', { ...named, date })
        }
        return date === null
          ? t('treatments.history.toast.doseAt', { ...named, time })
          : t('treatments.history.toast.doseAtOn', { ...named, time, date })
      }
      return { done, undo: t('treatments.sheet.toast.undoDose', named), already }
    }
    case 'remove': {
      const removed = line ?? { dueOn: today, dueTime: null }
      return {
        done: () => t('treatments.detail.toast.removed', { date: dueDay(removed) }),
        undo: t('treatments.detail.toast.undoRemove', { date: formatFullDate(removed.dueOn) }),
        already,
      }
    }
    case 'redate': {
      const date = day(action.givenOn)
      // Le point d'abréviation (« juil. ») sert aussi de point final à la phrase.
      const sentenceDate = nonBreaking(date.replace(/\.$/, ''))
      return {
        done: ({ postponement }) =>
          postponement === null
            ? t('treatments.detail.toast.moved', { date })
            : postponement.kept
              ? t('treatments.detail.toast.movedKept', {
                  date: sentenceDate,
                  nextDue: nonBreaking(day(postponement.nextDueDate)),
                })
              : t('treatments.detail.toast.movedLost', { date: sentenceDate }),
        undo: t('treatments.detail.toast.undoMove'),
        already,
      }
    }
    case 'move': {
      const origin = line?.dueOn ?? action.to
      if (action.to === origin) {
        return {
          done: () => t('treatments.history.toast.moveRemoved'),
          undo: t('treatments.history.toast.undoMoveRemoved'),
          already,
        }
      }
      const date = day(action.to)
      return {
        done: () =>
          action.to < origin
            ? t('treatments.history.toast.advancedTo', { date })
            : t('treatments.history.toast.postponedTo', { date }),
        undo: t('treatments.history.toast.undoMoveChange'),
        already,
      }
    }
    case 'remove-move':
      return {
        done: () => t('treatments.history.toast.moveRemoved'),
        undo: t('treatments.history.toast.undoMoveRemoved'),
        already,
      }
  }
}

type Line = Pick<
  TreatmentDoseInput,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** Geste d'un choix du menu ⋮ ; `null` pour « Changer la date », qui attend le jour choisi. */
export function lineAction(line: Line, choice: DoseLineAction): DoseAction | null {
  const due = { periodId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime }
  switch (choice) {
    case 'remove':
      return { kind: 'remove', doseId: line.id }
    case 'remove-move':
      return { kind: 'remove-move', doseId: line.id }
    case 'mark-missed':
      return { kind: 'note', gesture: { kind: 'missed', due } }
    case 'mark-given':
      return { kind: 'note', gesture: { kind: 'given', due, givenOn: line.dueOn } }
    case 'change-date':
      return null
  }
}

export type DateChange = {
  subtitle: string
  date: string
  min: string | null
  max: string | null
  action(date: string): DoseAction
}

/**
 * Ce que « Changer la date » propose pour une ligne : la date réelle d'une prise donnée, jusqu'à
 * aujourd'hui, ou la nouvelle date d'un report, entre les bornes du moteur d'échéances.
 */
export function dateChangeOf(
  t: Translate,
  line: Line,
  bounds: MoveBounds | null,
  { today, earliest }: { today: string; earliest: string | null },
): DateChange | null {
  if (line.status === 'postponed') {
    if (bounds === null) return null
    return {
      subtitle: moveText(t, line),
      date: line.nextDueDate,
      min: bounds.earliest,
      max: bounds.latest,
      action: (to) => ({ kind: 'move', doseId: line.id, to }),
    }
  }
  if (line.givenOn === null) return null
  return {
    subtitle: t('treatments.detail.changeDateSubtitle', { date: formatLongDate(line.givenOn) }),
    date: line.givenOn,
    min: earliest,
    max: today,
    action: (givenOn) => ({ kind: 'redate', doseId: line.id, givenOn }),
  }
}
