import { z } from 'zod'

import { MAX_FREQUENCY_VALUE } from '@/shared/domain/treatment-frequency'
import { nextDay, shiftDate } from '@/shared/domain/treatment-schedule-dues'
import { derivedId } from '@/shared/utils/derived-id'

type Row = Record<string, unknown>
type Frequency = { value: number; unit: 'day' | 'week' | 'month' }

/** Prise d'un export v1 ou v2 : une date réelle, et la prochaine échéance que l'app annonçait. */
export type PastDose = Row & {
  id: string
  givenOn: string
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

export type DoseLine = Row & {
  id: string
  periodId: string
  dueOn: string
  dueTime: string | null
  status: string
  nextDueDate: string
  createdAt: string
  updatedAt: string
}

const frequencySchema = z.object({
  value: z.number().int().positive().max(MAX_FREQUENCY_VALUE),
  unit: z.enum(['day', 'week', 'month']),
})

/** `null` : une fréquence que l'import refusera de toute façon, aucun rythme à reconstruire. */
export function frequencyOf(value: unknown): Frequency | null {
  const parsed = frequencySchema.safeParse(value)
  return parsed.success ? parsed.data : null
}

export function shiftLine(source: PastDose | DoseLine, due: DoseLine, anchor: string): DoseLine {
  return {
    ...source,
    id: derivedId(source.id, 'shift'),
    periodId: due.periodId,
    dueOn: due.dueOn,
    dueTime: due.dueTime,
    givenOn: null,
    status: 'shift',
    nextDueDate: anchor,
  }
}

// En mois, le 31 mars plus un mois retombe aussi sur le 30 avril : on avance jusqu'à ne plus y retomber.
export function anchorBefore(day: string, frequency: Frequency): string {
  let before = shiftDate(day, frequency, -1)
  while (shiftDate(nextDay(before), frequency, 1) <= day) before = nextDay(before)
  return before
}

function firstStepAfter(origin: string, frequency: Frequency, day: string): number {
  let step = 1
  while (shiftDate(origin, frequency, step) <= day) step += 1
  return step
}

/**
 * v1 et v2 : chaque prise refixait la suite. Chacune vise l'échéance que la précédente laissait,
 * garde sa date réelle, et une ligne de décalage ancre la suite quand l'ancien rythme diffère.
 * `lost` : une seconde prise du même jour, qui viserait la même échéance.
 */
export function chainedDoses(
  period: { id: string; firstDueOn: string },
  frequency: Frequency,
  doses: PastDose[],
): { lines: DoseLine[]; lost: number } {
  const lines: DoseLine[] = []
  let origin = period.firstDueOn
  let step = 0
  let previous: DoseLine | null = null
  let lost = 0
  for (const dose of doses) {
    if (dose.givenOn === previous?.givenOn) {
      lost += 1
      continue
    }
    const expected = shiftDate(origin, frequency, step)
    // Donnée en avance, avec une échéance suivante d'avant celle attendue : elle vise un jour à elle.
    const ownDay =
      previous === null || dose.givenOn > previous.dueOn ? dose.givenOn : nextDay(previous.dueOn)
    const isOwnDue = dose.nextDueDate <= expected && ownDay < dose.nextDueDate
    const due: DoseLine = {
      ...dose,
      periodId: period.id,
      dueOn: isOwnDue ? ownDay : expected,
      dueTime: null,
      status: 'given',
    }
    lines.push(due)
    previous = due
    if (!isOwnDue && shiftDate(origin, frequency, step + 1) === dose.nextDueDate) {
      step += 1
      continue
    }
    origin = anchorFor(dose, due.dueOn, frequency)
    step = firstStepAfter(origin, frequency, due.dueOn)
    lines.push(shiftLine(dose, due, origin))
  }
  return { lines, lost }
}

const MAX_STEPS_BACK = 12

/** L'ancre dont la première échéance après la prise est celle que l'app annonçait. */
function anchorFor(dose: PastDose, dueOn: string, frequency: Frequency): string {
  const fromGiven = shiftDate(dose.givenOn, frequency, 1)
  const target = [dose.nextDueDate, fromGiven].find((day) => day > dueOn)
  if (target === undefined) return dueOn
  const candidates = [
    ...(fromGiven === target ? [dose.givenOn] : []),
    anchorBefore(target, frequency),
    ...Array.from({ length: MAX_STEPS_BACK }, (_, back) =>
      shiftDate(target, frequency, -(back + 1)),
    ),
  ]
  const fits = (anchor: string) =>
    shiftDate(anchor, frequency, firstStepAfter(anchor, frequency, dueOn)) === target
  return candidates.find(fits) ?? candidates[0]!
}
