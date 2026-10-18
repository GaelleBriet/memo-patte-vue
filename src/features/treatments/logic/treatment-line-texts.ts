import type { DoseActionTexts, DueDay, RestoredSuite, TextTools } from './treatment-gestures'
import { answeredOn } from './treatment-not-due-text'
import { withRevealed } from './treatment-revealed-dues'
import { isAdvanced } from '@/shared/domain/dose-calendar'
import {
  formatDayMonthOrYear,
  formatFullDate,
  formatWeekday,
  withoutFinalDot,
} from '@/shared/utils/format'

export function removeTexts(
  { t, day, dueDay, already, today }: TextTools,
  line: DueDay | null,
  restored: RestoredSuite | null,
): DoseActionTexts {
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
  if (removed.status === 'not-due' && removed.createdAt !== undefined) {
    const answered = day(answeredOn({ createdAt: removed.createdAt }))
    return {
      done: () => t('treatments.history.toast.notDueRemoved', { date: answered }),
      undo: t('treatments.history.toast.undoNotDueRemoved', { date: answered }),
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

export function redateTexts({ t, day, already }: TextTools, givenOn: string): DoseActionTexts {
  const date = day(givenOn)
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

export function moveTexts({ t, day, already }: TextTools): DoseActionTexts {
  return {
    done: ({ moved }) => {
      if (moved === null || moved === 'removed') return t('treatments.history.toast.moveRemoved')
      const date = day(moved.targetOn ?? moved.dueOn)
      return isAdvanced(moved)
        ? t('treatments.history.toast.advancedTo', { date })
        : t('treatments.history.toast.postponedTo', { date })
    },
    undo: t('treatments.history.toast.undoMoveChange'),
    already,
  }
}
