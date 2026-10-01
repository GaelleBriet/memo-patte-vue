import { addDays, format, parseISO } from 'date-fns'

import { addFrequency } from './treatment-frequency'
import type { NewTreatmentDose, TreatmentDose } from '../schema/treatment-dose.schema'
import type { Treatment } from '../schema/treatment.schema'

type DosedTreatment = Pick<Treatment, 'id' | 'animalId' | 'periodId' | 'frequency' | 'nextDueDate'>

type DoseDay = Pick<TreatmentDose, 'givenOn' | 'dueOn'>

/** Jour d'une prise : sa date réelle, son échéance tant qu'elle n'a pas été donnée. */
export function doseDay(dose: DoseDay): string {
  return dose.givenOn ?? dose.dueOn
}

function shiftDay(day: string, days: number): string {
  return format(addDays(parseISO(day), days), 'yyyy-MM-dd')
}

/**
 * Échéance visée par une prise datée de `givenOn` : `wanted`, décalée au besoin pour que la prise
 * garde, face à la dernière des autres, le rang que lui donne sa date.
 */
export function rankedDueOn(wanted: string, givenOn: string, last: DoseDay | null): string {
  if (last === null) return wanted
  if (givenOn > doseDay(last)) return wanted > last.dueOn ? wanted : shiftDay(last.dueOn, 1)
  return wanted < last.dueOn ? wanted : shiftDay(last.dueOn, -1)
}

/** Prise donnée : plus récente que la dernière (`last`), elle vise l'échéance en cours ; sinon, son propre jour. */
export function doseGivenOn(
  treatment: DosedTreatment,
  givenOn: string,
  { id, at, last }: { id: string; at: string; last: DoseDay | null },
): NewTreatmentDose {
  const becomesLast = last === null || givenOn > doseDay(last)
  const wanted = becomesLast ? treatment.nextDueDate : givenOn
  return {
    id,
    periodId: treatment.periodId,
    treatmentId: treatment.id,
    animalId: treatment.animalId,
    dueOn: rankedDueOn(wanted, givenOn, last),
    dueTime: null,
    givenOn,
    status: 'given',
    nextDueDate: addFrequency(givenOn, treatment.frequency),
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  }
}

/** Une prise plus ancienne que la dernière ne devient pas la tête : l'échéance ne bouge pas. */
export function nextDueAfterDose(
  treatment: Pick<Treatment, 'frequency' | 'lastDoseDate' | 'nextDueDate'>,
  givenOn: string,
): string {
  return givenOn > treatment.lastDoseDate
    ? addFrequency(givenOn, treatment.frequency)
    : treatment.nextDueDate
}
