import { addDays, format, parseISO } from 'date-fns'

import type { DoseAction, DoseChange } from './treatment-dose-writes'
import { moveText, type DoseLineAction } from './treatment-history'
import { revealedDuesText, type RevealedDues } from './treatment-revealed-dues'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import {
  isAdvanced,
  type Due,
  type MoveBounds,
  type RedateLimits,
  type TreatmentDoseInput,
} from '@/shared/domain/treatment-schedule'
import {
  formatClockTime,
  formatDayMonthOrYear,
  formatDaySeries,
  formatFullDate,
  formatLongDate,
  formatWeekday,
  withoutFinalDot,
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
  /** `finishes` : le geste a fait passer le traitement dans « Traitements terminés » (TR-31). */
  done(
    applied: Pick<DoseChange, 'postponement' | 'moved' | 'shiftKept'> & {
      finishes?: boolean
      heldBy?: string | null
      lostToEnd?: readonly string[]
      keptToEnd?: readonly string[]
      revealed?: RevealedDues
    },
  ): string
  /** Nom du bouton « Annuler » lu par le lecteur d'écran. */
  undo: string
  already(givenOn: string): string
}

type DueDay = Pick<Due, 'dueOn' | 'dueTime'> & { status?: TreatmentDoseInput['status'] }

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

/** Après « Supprimer ce décalage », la prochaine dose et la fréquence de sa période. */
export type RestoredSuite = { nextOn: string | null; weekly: boolean }

function withRevealed(t: Translate, done: string, revealed: RevealedDues | undefined): string {
  const text = revealed === undefined ? null : revealedDuesText(t, revealed, 'toast')
  if (text === null) return done
  return t('treatments.shift.revealed.after', { done: withoutFinalDot(done), revealed: text })
}

export function doseActionTexts(
  t: Translate,
  { name, animal, today, severalTimes }: GestureContext,
  action: DoseAction,
  line: DueDay | null,
  restored: RestoredSuite | null = null,
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
      const noted = (): string => {
        if (time === null) {
          return date === null
            ? t('treatments.sheet.toast.dose', named)
            : t('treatments.sheet.toast.doseOn', { ...named, date })
        }
        return date === null
          ? t('treatments.history.toast.doseAt', { ...named, time })
          : t('treatments.history.toast.doseAtOn', { ...named, time, date })
      }
      const endNote = (days: readonly string[]) => ({
        done: noted(),
        dates: formatDaySeries(days),
      })
      const told: DoseActionTexts['done'] = (applied) => {
        const { finishes, heldBy = null, lostToEnd = [], keptToEnd = [] } = applied
        if (finishes) return t('treatments.detail.toast.lastDose', { name })
        if (lostToEnd.length > 0) {
          return t('treatments.shift.suiteCut', endNote(lostToEnd), lostToEnd.length)
        }
        if (keptToEnd.length > 0) {
          return t('treatments.shift.suiteKept', endNote(keptToEnd), keptToEnd.length)
        }
        if (heldBy === null) return noted()
        return t('treatments.shift.suiteHeld', {
          done: noted(),
          date: withoutFinalDot(day(heldBy)),
        })
      }
      const done: DoseActionTexts['done'] = (applied) =>
        withRevealed(t, told(applied), applied.revealed)
      return { done, undo: t('treatments.sheet.toast.undoDose', named), already }
    }
    case 'log': {
      const missed = action.gestures.filter(({ kind }) => kind === 'missed').length
      const given = action.gestures.length - missed
      const done: DoseActionTexts['done'] = ({ finishes }) => {
        if (missed === 0) {
          return finishes
            ? t('treatments.unlogged.toast.finished.given', { name, n: given }, given)
            : t('treatments.unlogged.toast.given', { name, n: given }, given)
        }
        if (given === 0) {
          return finishes
            ? t('treatments.unlogged.toast.finished.missed', { name, n: missed }, missed)
            : t('treatments.unlogged.toast.missed', { name, n: missed }, missed)
        }
        const counts = {
          name,
          given: t('treatments.unlogged.toast.givenCount', { n: given }, given),
          missed: t('treatments.unlogged.toast.missedCount', { n: missed }, missed),
        }
        return finishes
          ? t('treatments.unlogged.toast.finished.both', counts)
          : t('treatments.unlogged.toast.both', counts)
      }
      return { done, undo: t('treatments.unlogged.toast.undo', { name }), already }
    }
    case 'remove': {
      const removed = line ?? { dueOn: today, dueTime: null }
      if (removed.status === 'extra') {
        return {
          done: () => t('treatments.detail.toast.removedExtra', { date: day(removed.dueOn) }),
          undo: t('treatments.detail.toast.undoRemoveExtra', {
            date: formatFullDate(removed.dueOn),
          }),
          already,
        }
      }
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
      const sentenceDate = withoutFinalDot(date)
      const moved: DoseActionTexts['done'] = ({ postponement }) =>
        postponement === null
          ? t('treatments.detail.toast.moved', { date })
          : postponement.kept && postponement.followed === true
            ? t('treatments.detail.toast.movedFollowed', {
                date: sentenceDate,
                nextDue: withoutFinalDot(day(postponement.nextDueDate)),
              })
            : postponement.kept
              ? t('treatments.detail.toast.movedKept', {
                  date: sentenceDate,
                  nextDue: day(postponement.nextDueDate),
                })
              : t('treatments.detail.toast.movedLost', { date: sentenceDate })
      return {
        done: (applied) => withRevealed(t, moved(applied), applied.revealed),
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
    case 'remove-shift':
      return {
        done: () => {
          if (restored === null || restored.nextOn === null) {
            return t('treatments.history.toast.shiftRemoved')
          }
          return restored.weekly
            ? t('treatments.history.toast.shiftRemovedWeekday', {
                weekday: formatWeekday(restored.nextOn),
              })
            : t('treatments.history.toast.shiftRemovedOn', {
                date: withoutFinalDot(formatDayMonthOrYear(restored.nextOn, today)),
              })
        },
        undo: t('treatments.history.toast.undoShiftRemoved'),
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
    case 'remove-shift':
      return { kind: 'remove-shift', doseId: line.id }
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
  /** Jours grisés : ceux qui ont déjà une prise en plus. */
  excluded: string[]
  /** `shiftsFollowing` : la case « Décaler aussi les doses suivantes », cochée par défaut. */
  action(date: string, shiftsFollowing?: boolean): DoseAction
}

/** `null` : la ligne ne change pas de date (prise oubliée, report que le moteur ne déplace pas). */
export function dateChangeOf(
  t: Translate,
  line: Line,
  bounds: MoveBounds | null,
  {
    today,
    earliest,
    limits = null,
  }: { today: string; earliest: string | null; limits?: RedateLimits | null },
): DateChange | null {
  if (line.status === 'postponed') {
    if (bounds === null) return null
    return {
      subtitle: moveText(t, line),
      date: line.nextDueDate,
      min: bounds.earliest,
      max: bounds.latest,
      excluded: [],
      action: (to, shiftsFollowing = true) =>
        shiftsFollowing
          ? { kind: 'move', doseId: line.id, to }
          : { kind: 'move', doseId: line.id, to, shiftsFollowing },
    }
  }
  if (line.givenOn === null) return null
  const date = formatLongDate(line.givenOn)
  // M1 : une prise donnée ne descend pas au jour où elle deviendrait une prise en plus.
  const afterExtra =
    limits === null || limits.lastExtraDay === null
      ? null
      : format(addDays(parseISO(limits.lastExtraDay), 1), 'yyyy-MM-dd')
  return {
    subtitle:
      line.status === 'extra'
        ? t('treatments.detail.changeDateSubtitleExtra', { date })
        : t('treatments.detail.changeDateSubtitle', { date }),
    date: line.givenOn,
    min:
      [earliest, afterExtra]
        .filter((day) => day !== null)
        .sort()
        .at(-1) ?? null,
    max: today,
    excluded: limits?.takenDays ?? [],
    action: (givenOn, shiftsFollowing = true) =>
      shiftsFollowing
        ? { kind: 'redate', doseId: line.id, givenOn }
        : { kind: 'redate', doseId: line.id, givenOn, shiftsFollowing },
  }
}
