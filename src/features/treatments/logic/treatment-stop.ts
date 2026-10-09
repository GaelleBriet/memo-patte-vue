import { hasSeveralTimes } from './treatment-gestures'
import { unloggedWhen, type PromptAction } from './treatment-unlogged'
import type { TreatmentWithHistory } from '../schema/treatment-with-history.schema'
import type { Due, TreatmentSchedule } from '@/shared/domain/treatment-schedule'
import type { Translate } from '@/core/i18n/translate'

type StopSchedule = Pick<TreatmentSchedule, 'phase' | 'currentDoses' | 'unloggedDoses'>

export type StopPrompt = {
  title: string
  text: string
  /** La dose du jour, que l'arrêt retire ; `null` quand il n'y en a pas à noter. */
  todayNote: string | null
  /** Doses que l'arrêt laisserait à renseigner ; vide : confirmation simple. */
  dues: Due[]
  when: string
  /** Renseigner puis arrêter ; vide sans dose à renseigner. */
  actions: PromptAction[]
  stopOnly: { text: string; label: string }
  cancel: { text: string; label: string }
}

/** Doses non renseignées et dose en retard : ce qui resterait à renseigner après l'arrêt (TR-30). */
export function stopDues({ phase, currentDoses, unloggedDoses }: StopSchedule): Due[] {
  return phase === 'overdue' ? [...unloggedDoses, ...currentDoses] : unloggedDoses
}

function actionsOf(t: Translate, name: string, count: number, when: string): PromptAction[] {
  if (count === 0) return []
  if (count === 1) {
    return [
      {
        id: 'given',
        text: t('treatments.unlogged.given'),
        icon: 'ms:check',
        label: t('treatments.stop.givenLabel', { name, when }),
      },
      {
        id: 'missed',
        text: t('treatments.unlogged.missed'),
        icon: 'ms:close',
        label: t('treatments.stop.missedLabel', { name, when }),
      },
    ]
  }
  return [
    {
      id: 'all-given',
      text: t('treatments.unlogged.allGiven'),
      icon: 'ms:done_all',
      label: t('treatments.stop.allGivenLabel', { name, n: count, when }),
    },
    {
      id: 'choose-days',
      text: t('treatments.unlogged.chooseDays'),
      icon: 'ms:calendar_month',
      label: t('treatments.stop.chooseDaysLabel', { name }),
    },
  ]
}

export function stopPrompt(
  t: Translate,
  treatment: Pick<TreatmentWithHistory, 'name' | 'periods'>,
  schedule: StopSchedule,
  today: string,
): StopPrompt {
  const { name } = treatment
  const dues = stopDues(schedule)
  const [first] = dues
  const count = dues.length
  const when =
    first === undefined
      ? ''
      : unloggedWhen(t, dues, today, hasSeveralTimes(treatment, first.periodId))
  return {
    title: t('treatments.sheet.stopDialog.title', { name }),
    text:
      count === 0
        ? t('treatments.sheet.stopDialog.text', { name })
        : t('treatments.stop.unlogged', { n: count, when }, count),
    todayNote: schedule.phase === 'today' ? t('treatments.stop.todayNote') : null,
    dues,
    when,
    actions: actionsOf(t, name, count, when),
    stopOnly:
      count === 0
        ? {
            text: t('treatments.sheet.stopDialog.confirm'),
            label: t('treatments.sheet.stopDialog.confirmLabel', { name }),
          }
        : {
            text: t('treatments.stop.withoutLogging'),
            label: t('treatments.stop.withoutLoggingLabel', { name, n: count }, count),
          },
    cancel: {
      text: t('treatments.sheet.stopDialog.cancel'),
      label: t('treatments.sheet.stopDialog.cancelLabel', { name }),
    },
  }
}

const NO_DOSES: StopSchedule = { phase: 'upcoming', currentDoses: [], unloggedDoses: [] }

/** Sans calendrier lisible : la confirmation simple, sans dose à renseigner. */
export function plainStopPrompt(t: Translate, name: string): StopPrompt {
  return stopPrompt(t, { name, periods: [] }, NO_DOSES, '')
}

/** `finished` : plus rien à renseigner, le traitement est dans « Traitements terminés » (TR-31). */
export function stoppedText(t: Translate, name: string, finished: boolean): string {
  return finished
    ? t('treatments.sheet.toast.stoppedFinished', { name })
    : t('treatments.sheet.toast.stopped', { name })
}
