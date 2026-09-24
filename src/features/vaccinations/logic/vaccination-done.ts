import { addYears, format, parseISO } from 'date-fns'

import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'

export type NextReminderChoice =
  | { kind: 'oneYear' }
  | { kind: 'threeYears' }
  | { kind: 'otherDate'; date: string }
  | { kind: 'none' }

export type NextReminderKind = NextReminderChoice['kind']

export const NEXT_REMINDER_KINDS: readonly NextReminderKind[] = [
  'oneYear',
  'threeYears',
  'otherDate',
  'none',
]

function yearsAfter(date: string, years: number): string {
  return format(addYears(parseISO(date), years), 'yyyy-MM-dd')
}

export function nextReminderDate(injectedOn: string, choice: NextReminderChoice): string | null {
  switch (choice.kind) {
    case 'oneYear':
      return yearsAfter(injectedOn, 1)
    case 'threeYears':
      return yearsAfter(injectedOn, 3)
    case 'otherDate':
      return choice.date
    case 'none':
      return null
  }
}

export function injectionOn(
  vaccination: Pick<Vaccination, 'id' | 'animalId'>,
  { injectedOn, nextDueDate }: Pick<VaccinationInjection, 'injectedOn' | 'nextDueDate'>,
  { id, at }: { id: string; at: string },
): VaccinationInjection {
  return {
    id,
    vaccinationId: vaccination.id,
    animalId: vaccination.animalId,
    injectedOn,
    nextDueDate,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}
