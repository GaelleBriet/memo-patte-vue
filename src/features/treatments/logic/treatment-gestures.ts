import type { DoseAction, DoseChange } from './treatment-dose-change'
import { moveText, type DoseLineAction } from './treatment-history'
import { revealedDuesText, type RevealedDues } from './treatment-revealed-dues'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import {
  isAdvanced,
  type Due,
  type MoveBounds,
  type TreatmentView,
} from '@/shared/domain/dose-calendar'
import { isSeveralTimesADay } from '@/shared/domain/treatment-periods'
import {
  formatClockTime,
  formatDayMonthOrYear,
  formatDaySeries,
  formatFullDate,
  formatLongDate,
  formatWeekday,
  withoutFinalDot,
} from '@/shared/utils/format'
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
      lostToEnd?: readonly string[]
      revealed?: RevealedDues | null
    },
  ): string
  /** Nom du bouton « Annuler » lu par le lecteur d'écran. */
  undo: string
  already(givenOn: string): string
}

export type DueDay = Pick<Due, 'dueOn' | 'dueTime'> & { status?: NewTreatmentDose['status'] }

export function hasSeveralTimes(
  treatment: Pick<TreatmentWithHistory, 'periods'>,
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

function withRevealed(
  t: Translate,
  done: string,
  revealed: RevealedDues | null | undefined,
): string {
  const text =
    revealed === undefined || revealed === null ? null : revealedDuesText(t, revealed, 'toast')
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
      if (gesture.status === 'missed') {
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
        const { finishes, lostToEnd = [] } = applied
        if (finishes) return t('treatments.detail.toast.lastDose', { name })
        if (lostToEnd.length > 0) {
          return t('treatments.shift.suiteCut', endNote(lostToEnd), lostToEnd.length)
        }
        return noted()
      }
      const done: DoseActionTexts['done'] = (applied) =>
        withRevealed(t, told(applied), applied.revealed)
      return { done, undo: t('treatments.sheet.toast.undoDose', named), already }
    }
    case 'log': {
      const missed = action.gestures.filter(({ status }) => status === 'missed').length
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
      if (removed.status === 'shift') {
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
      }
      if (removed.status === 'postponed') {
        return {
          done: ({ shiftKept }) =>
            shiftKept
              ? t('treatments.history.toast.moveRemovedShiftKept')
              : t('treatments.history.toast.moveRemoved'),
          undo: t('treatments.history.toast.undoMoveRemoved'),
          already,
        }
      }
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
      const moved: DoseActionTexts['done'] = ({ followed }) => {
        const [follow] = followed
        return follow === undefined || follow.to === null
          ? t('treatments.detail.toast.moved', { date })
          : t('treatments.detail.toast.movedFollowed', {
              date: sentenceDate,
              nextDue: withoutFinalDot(day(follow.to)),
            })
      }
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
          const date = day(moved.targetOn ?? moved.dueOn)
          return isAdvanced(moved)
            ? t('treatments.history.toast.advancedTo', { date })
            : t('treatments.history.toast.postponedTo', { date })
        },
        undo: t('treatments.history.toast.undoMoveChange'),
        already,
      }
  }
}

type Line = Pick<
  NewTreatmentDose,
  'id' | 'periodId' | 'dueOn' | 'dueTime' | 'givenOn' | 'status' | 'nextDueDate'
>

/** La dose que montre une ligne de report : à son jour d'arrivée. */
export function movedDueOf(line: Pick<Line, 'periodId' | 'dueTime' | 'nextDueDate'>): Due {
  return { settingId: line.periodId, dueOn: line.nextDueDate, dueTime: line.dueTime }
}

/** Geste d'un choix du menu ⋮ ; `null` pour « Changer la date », qui attend le jour choisi. */
export function lineAction(line: Line, choice: DoseLineAction, today: string): DoseAction | null {
  const due = { settingId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime }
  switch (choice) {
    case 'remove':
    case 'remove-move':
    case 'remove-shift':
      return { kind: 'remove', lineId: line.id }
    case 'mark-missed':
      return {
        kind: 'note',
        gesture: {
          kind: 'note',
          due,
          status: 'missed',
          givenOn: line.dueOn,
          shiftsFollowing: false,
        },
      }
    case 'mark-given':
      return {
        kind: 'note',
        gesture: {
          kind: 'note',
          due,
          status: 'given',
          givenOn: line.dueOn > today ? today : line.dueOn,
          shiftsFollowing: false,
        },
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
  /** Jours grisés : ceux où le moteur refuse déjà le déplacement. */
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
    view,
  }: { today: string; earliest: string | null; view: Pick<TreatmentView, 'extraBoundary'> },
): DateChange | null {
  if (line.status === 'postponed') {
    if (bounds === null) return null
    return {
      subtitle: moveText(t, line),
      date: line.nextDueDate,
      min: bounds.earliest,
      max: bounds.latest,
      excluded: bounds.excluded,
      action: (to, shiftsFollowing = true) => ({
        kind: 'move',
        due: movedDueOf(line),
        to,
        shiftsFollowing,
      }),
    }
  }
  if (line.givenOn === null) return null
  const date = formatLongDate(line.givenOn)
  // M1 : une prise donnée ne descend pas au jour où elle deviendrait une prise en plus.
  const boundary =
    line.status === 'given'
      ? view.extraBoundary({ settingId: line.periodId, dueOn: line.dueOn, dueTime: line.dueTime })
      : null
  return {
    subtitle:
      line.status === 'extra'
        ? t('treatments.detail.changeDateSubtitleExtra', { date })
        : t('treatments.detail.changeDateSubtitle', { date }),
    date: line.givenOn,
    min:
      [earliest, boundary]
        .filter((day) => day !== null)
        .sort()
        .at(-1) ?? null,
    max: today,
    excluded: [],
    action: (givenOn, shiftsFollowing = true) => ({
      kind: 'redate',
      lineId: line.id,
      givenOn,
      shiftsFollowing,
    }),
  }
}
