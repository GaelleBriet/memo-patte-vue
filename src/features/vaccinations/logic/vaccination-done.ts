import { addMonths, addYears, parseISO } from 'date-fns'

import { toDay } from '@/shared/domain/calendar-day'

import type { VaccinationInjection } from '../schema/vaccination-injection.schema'
import type { Vaccination } from '../schema/vaccination.schema'

export type NextReminderChoice =
  | { kind: 'oneMonth' }
  | { kind: 'oneYear' }
  | { kind: 'threeYears' }
  | { kind: 'otherDate'; date: string }
  | { kind: 'none' }

export type NextReminderKind = NextReminderChoice['kind']

export const NEXT_REMINDER_KINDS: readonly NextReminderKind[] = [
  'oneMonth',
  'oneYear',
  'threeYears',
  'otherDate',
  'none',
]

export function nextReminderDate(injectedOn: string, choice: NextReminderChoice): string | null {
  switch (choice.kind) {
    case 'oneMonth':
      return toDay(addMonths(parseISO(injectedOn), 1))
    case 'oneYear':
      return toDay(addYears(parseISO(injectedOn), 1))
    case 'threeYears':
      return toDay(addYears(parseISO(injectedOn), 3))
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
