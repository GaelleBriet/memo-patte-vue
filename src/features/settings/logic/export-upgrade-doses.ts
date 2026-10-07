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

function shiftLine(source: PastDose | DoseLine, due: DoseLine, anchor: string): DoseLine {
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
function stepBefore(day: string, frequency: Frequency): string {
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
  let previous: string | null = null
  let lost = 0
  for (const dose of doses) {
    if (dose.givenOn === previous) {
      lost += 1
      continue
    }
    previous = dose.givenOn
    const due: DoseLine = {
      ...dose,
      periodId: period.id,
      dueOn: shiftDate(origin, frequency, step),
      dueTime: null,
      status: 'given',
    }
    lines.push(due)
    if (shiftDate(origin, frequency, step + 1) === dose.nextDueDate) {
      step += 1
      continue
    }
    const target = [dose.nextDueDate, shiftDate(dose.givenOn, frequency, 1)].find(
      (day) => day > due.dueOn,
    )
    origin =
      target === undefined
        ? due.dueOn
        : shiftDate(dose.givenOn, frequency, 1) === target
          ? dose.givenOn
          : stepBefore(target, frequency)
    step = firstStepAfter(origin, frequency, due.dueOn)
    lines.push(shiftLine(dose, due, origin))
  }
  return { lines, lost }
}

/**
 * v3 : un report refaisait partir la suite de sa nouvelle date, une prise notée un autre jour de sa
 * date réelle quand sa prochaine échéance en partait. En v4, seule une ligne de décalage le dit.
 */
export function shiftsOfV3(
  doses: DoseLine[],
  frequencies: Map<string, Frequency | null>,
): DoseLine[] {
  const shifts = new Map<string, DoseLine>()
  const latestMove = new Map<string, DoseLine>()
  for (const dose of doses) {
    if (dose.status !== 'postponed') continue
    const day = `${dose.periodId}|${dose.dueOn}`
    const known = latestMove.get(day)
    if (known === undefined || known.updatedAt < dose.updatedAt) latestMove.set(day, dose)
  }
  for (const move of latestMove.values()) {
    if (move.nextDueDate === move.dueOn) continue
    shifts.set(
      `${move.periodId}|${move.dueOn}|${move.dueTime}`,
      shiftLine(move, move, move.nextDueDate),
    )
  }
  for (const dose of doses) {
    const frequency = frequencies.get(dose.periodId)
    const givenOn = dose.givenOn
    if (dose.status !== 'given' || typeof givenOn !== 'string' || givenOn === dose.dueOn) continue
    if (!frequency || shiftDate(givenOn, frequency, 1) !== dose.nextDueDate) continue
    shifts.set(`${dose.periodId}|${dose.dueOn}|${dose.dueTime}`, shiftLine(dose, dose, givenOn))
  }
  return [...shifts.values()]
}
