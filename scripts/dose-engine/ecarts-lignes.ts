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

const idleShifts = new WeakMap<Book, Set<string>>()

/** R6 : les décalages que le moteur v2 tient pour sans effet, leur journée d'origine n'étant plus une échéance. */
export function idleShiftIds(book: Book): Set<string> {
  const known = idleShifts.get(book)
  if (known !== undefined) return known
  const idle = new Set(
    treatmentView(viewInputOf(book))
      .history.filter(
        ({ line, effect }) =>
          line.status === 'shift' && effect.kind === 'idle' && effect.reason === 'overtaken',
      )
      .map(({ line }) => line.id),
  )
  idleShifts.set(book, idle)
  return idle
}

const pendingOf = (display: Display) =>
  new Set([...display.unlogged, ...display.current, ...display.upcoming])

/**
 * R6 : les écarts qui tiennent aux décalages dont la journée d'origine n'est plus une échéance pour le
 * moteur v2 (le moteur actuel, relu sans eux, lit autrement ou comme le moteur v2) ; rend les autres.
 */
export function outsideShiftGaps(
  book: Book,
  actual: Display,
  second: Display,
  keys: string[],
): string[] {
  const idle = idleShiftIds(book)
  if (idle.size === 0 || keys.length === 0) return keys
  const without = readWith(currentEngine, {
    ...book,
    doses: book.doses.filter(({ id }) => !idle.has(id)),
  })
  if ('error' in without) return keys
  const [a, b, before] = [pendingOf(without), pendingOf(second), pendingOf(actual)]
  const moment = without.current.join()
  const explained = (key: string) =>
    key === 'dose du moment'
      ? moment === second.current.join() || moment !== actual.current.join()
      : a.has(key) === b.has(key) || a.has(key) !== before.has(key)
  return keys.filter((key) => !explained(key))
}
