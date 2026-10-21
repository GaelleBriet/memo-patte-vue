import { nextDay } from './calendar-day'
import type { Setting, TreatmentView } from './dose-calendar'

export function nextDueAfterShift(
  view: Pick<TreatmentView, 'currentSetting' | 'upcoming'>,
  period: Pick<Setting, 'id' | 'stoppedOn'>,
  dose: { dueOn: string; targetOn: string | null },
): string | null {
  const current = period.id === view.currentSetting?.id && period.stoppedOn === null
  if (!current) return null
  return view.upcoming({ from: nextDay(dose.targetOn ?? dose.dueOn), limit: 1 })[0]?.dueOn ?? null
}
