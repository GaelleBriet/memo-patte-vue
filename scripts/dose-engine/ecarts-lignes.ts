import { treatmentView, viewInputOf } from '@/shared/domain/dose-calendar'
import type { TreatmentDoseInput } from '@/shared/domain/treatment-schedule'

import type { Book } from './carnet'
import type { Display } from './display'
import { currentEngine, readWith } from './engines'

// R7 : de jour d'arrivée en jour d'arrivée, des reports ramènent la dose au jour d'origine de `line`.
export function inLoop(book: Book, line: TreatmentDoseInput): boolean {
  const reports = book.doses.filter(({ status }) => status === 'postponed')
  const seen = new Set<string>()
  const days = [line.nextDueDate]
  while (days.length > 0) {
    const day = days.pop()!
    if (day === line.dueOn) return true
    if (seen.has(day)) continue
    seen.add(day)
    reports
      .filter(({ dueOn }) => dueOn === day)
      .forEach(({ nextDueDate }) => days.push(nextDueDate))
  }
  return false
}

const pendingOf = (display: Display) =>
  new Set([...display.unlogged, ...display.current, ...display.upcoming])

/**
 * R6 : les écarts que le moteur actuel n'a plus une fois retirés les décalages dont la journée
 * d'origine n'est plus une échéance pour le moteur v2 ; rend ceux qui restent.
 */
export function outsideShiftGaps(book: Book, second: Display, keys: string[]): string[] {
  const idle = new Set(
    treatmentView(viewInputOf(book))
      .history.filter(
        ({ line, effect }) =>
          line.status === 'shift' && effect.kind === 'idle' && effect.reason === 'overtaken',
      )
      .map(({ line }) => line.id),
  )
  if (idle.size === 0 || keys.length === 0) return keys
  const without = readWith(currentEngine, {
    ...book,
    doses: book.doses.filter(({ id }) => !idle.has(id)),
  })
  if ('error' in without) return keys
  const [a, b] = [pendingOf(without), pendingOf(second)]
  const sameCurrent = without.current.join() === second.current.join()
  return keys.filter((key) => (key === 'dose du moment' ? !sameCurrent : a.has(key) !== b.has(key)))
}
