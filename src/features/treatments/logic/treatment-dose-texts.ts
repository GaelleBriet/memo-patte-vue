import type { DoseActionTexts, TextTools } from './treatment-gestures'
import type { NoteGesture } from './treatment-dose-change'
import { withRevealed } from './treatment-revealed-dues'
import { formatClockTime, formatDaySeries, formatFullDate } from '@/shared/utils/format'

export function noteTexts(
  { t, name, animal, today, day, dueDay, already, severalTimes }: TextTools,
  gesture: NoteGesture,
): DoseActionTexts {
  const named = { name, animal }
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

export function logTexts(
  { t, name, already }: TextTools,
  gestures: readonly NoteGesture[],
): DoseActionTexts {
  const missed = gestures.filter(({ status }) => status === 'missed').length
  const given = gestures.length - missed
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
