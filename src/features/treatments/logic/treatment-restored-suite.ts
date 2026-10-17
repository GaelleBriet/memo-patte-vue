import { type DoseAction } from './treatment-dose-change'
import { laterOf, type Carnet } from './treatment-shift-help'
import { nextDay } from '@/shared/domain/calendar-day'
import { applied, play, treatmentView } from '@/shared/domain/dose-calendar'

/** Ce que dit le toast de « Supprimer ce décalage » ; `null` pour tout autre geste. */
export function restoredSuiteFor(
  { treatment, reading }: Pick<Carnet, 'treatment' | 'reading'>,
  action: DoseAction,
): { nextOn: string | null; weekly: boolean } | null {
  if (action.kind !== 'remove') return null
  const line = treatment.doses.find(({ id }) => id === action.lineId)
  if (line?.status !== 'shift') return null
  const period = treatment.periods.find(({ id }) => id === line.periodId)
  if (period === undefined) return { nextOn: null, weekly: false }
  const result = play(reading.input, { kind: 'remove', lineId: line.id })
  if ('refusal' in result) return null
  const after = treatmentView(applied(reading.input, result.changes))
  // Les doses suivantes viennent après la dose déplacée elle-même.
  const report = treatment.doses.find(
    (dose) =>
      dose.status === 'postponed' && dose.periodId === line.periodId && dose.dueOn === line.dueOn,
  )
  const from = nextDay(laterOf(line.dueOn, report?.targetOn ?? line.dueOn))
  return {
    nextOn: after.upcoming({ from, limit: 1 })[0]?.dueOn ?? null,
    weekly: period.frequency.unit === 'week',
  }
}
