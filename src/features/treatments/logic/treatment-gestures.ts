import type { DoseAction, DoseChange } from './treatment-dose-writes'
import { moveText, type DoseLineAction } from './treatment-history'
import type { TreatmentWithHistory } from '../repository/treatments.repository'
import {
  isAdvanced,
  type Due,
  type MoveBounds,
  type TreatmentDoseInput,
} from '@/shared/domain/treatment-schedule'
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
  done(applied: Pick<DoseChange, 'postponement' | 'moved' | 'shiftKept'>): string
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
  const already = (givenOn: string) => alreadyNotedText(t, { name, animal, today }, givenOn)

  switch (action.kind) {
    case 'note': {
      const { gesture } = action
      if (gesture.kind === 'missed') {
        return {
          done: ({ shiftKept }) =>
            shiftKept
              ? t('treatments.history.toast.missedShiftKept', { date: dueDay(gesture.due) })
              : t('treatments.history.toast.missed', { date: dueDay(gesture.due) }),
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
    case 'log': {
      const missed = action.gestures.filter(({ kind }) => kind === 'missed').length
      const given = action.gestures.length - missed
      const done = () => {
        if (missed === 0) return t('treatments.unlogged.toast.given', { name, n: given }, given)
        if (given === 0) return t('treatments.unlogged.toast.missed', { name, n: missed }, missed)
        return t('treatments.unlogged.toast.both', {
          name,
          given: t('treatments.unlogged.toast.givenCount', { n: given }, given),
          missed: t('treatments.unlogged.toast.missedCount', { n: missed }, missed),
        })
      }
      return { done, undo: t('treatments.unlogged.toast.undo', { name }), already }
    }
    case 'remove': {
      const removed = line ?? { dueOn: today, dueTime: null }
      return {
        done: ({ shiftKept }) =>
          shiftKept
            ? t('treatments.detail.toast.removedShiftKept', { date: dueDay(removed) })
            : t('treatments.detail.toast.removed', { date: dueDay(removed) }),
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
    case 'move':
      return {
        done: ({ moved }) => {
          if (moved === null || moved === 'removed')
            return t('treatments.history.toast.moveRemoved')
          const date = day(moved.nextDueDate)
          return isAdvanced(moved)
            ? t('treatments.history.toast.advancedTo', { date })
            : t('treatments.history.toast.postponedTo', { date })
        },
        undo: t('treatments.history.toast.undoMoveChange'),
        already,
      }
    case 'remove-move':
      return {
        done: ({ shiftKept }) =>
          shiftKept
            ? t('treatments.history.toast.moveRemovedShiftKept')
            : t('treatments.history.toast.moveRemoved'),
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
export function lineAction(line: Line, choice: DoseLineAction, today: string): DoseAction | null {
  const due = { periodId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime }
  switch (choice) {
    case 'remove':
      return { kind: 'remove', doseId: line.id }
    case 'remove-move':
      return { kind: 'remove-move', doseId: line.id }
    case 'mark-missed':
      return { kind: 'note', gesture: { kind: 'missed', due } }
    case 'mark-given':
      return {
        kind: 'note',
        gesture: { kind: 'given', due, givenOn: line.dueOn > today ? today : line.dueOn },
      }
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

/** `null` : la ligne ne change pas de date (prise oubliée, report que le moteur ne déplace pas). */
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
