// @vitest-environment node
import { addDays, format, parseISO } from 'date-fns'
import { describe, expect, it } from 'vitest'

import { dose, period, treatment } from './treatment-fixtures'
import { doseChange } from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { choiceGestures } from '../logic/treatment-choose-days'

const TODAY = '2026-09-28'

function daysBefore(day: string, count: number): string {
  return format(addDays(parseISO(day), -count), 'yyyy-MM-dd')
}

/** Une prise notée au début, la dose du jour notée, rien entre les deux. */
function gap(days: number, times: string[]) {
  const start = daysBefore(TODAY, days)
  const [first = null] = times
  return treatment(
    [period({ startsOn: start, firstDueOn: start, times })],
    [
      dose(start, times.length > 1 ? start : daysBefore(TODAY, days - 1), { dueTime: first }),
      dose(TODAY, times.length > 1 ? TODAY : daysBefore(TODAY, -1), { dueTime: first }),
    ],
  )
}

// Meilleur de trois essais : écarte le bruit de la machine, garde visible une régression.
function fastest<T>(run: () => T): { result: T; elapsed: number } {
  let best = { result: run(), elapsed: Infinity }
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const start = performance.now()
    const result = run()
    const elapsed = performance.now() - start
    if (elapsed < best.elapsed) best = { result, elapsed }
  }
  return best
}

function allGiven(history: ReturnType<typeof gap>) {
  let id = 0
  const reading = treatmentReadingOf(history, TODAY)
  return doseChange(
    history,
    reading,
    { kind: 'log', gestures: choiceGestures({ given: reading.view.unloggedDoses, missed: [] }) },
    () => String((id += 1)),
  ).writes
}

describe('« Toutes données » entre une prise ancienne et la dose du jour', () => {
  it.each([
    ['un an à une prise par jour', 365, [], 364, 200],
    ['un an à deux prises par jour', 365, ['08:00', '20:00'], 729, 200],
    ['trois ans à deux prises par jour', 1095, ['08:00', '20:00'], 2189, 600],
  ])('%s', (_, days, times, count, bound) => {
    const { result: writes, elapsed } = fastest(() => allGiven(gap(days, times)))

    expect(writes).toHaveLength(count)
    expect(elapsed).toBeLessThan(bound)
  })

  it('lignes sans effet sur chaque dose à renseigner (fichier forgé) : le calendrier n’est pas recalculé à chaque dose', () => {
    const start = daysBefore(TODAY, 729)
    const neutral = Array.from({ length: 729 }, (_, index) => {
      const day = daysBefore(TODAY, 729 - index)
      return dose(day, day, { id: `neutre-${day}`, status: 'postponed', givenOn: null })
    })
    const forged = treatment([period({ startsOn: start, firstDueOn: start, times: [] })], neutral)

    const { result: writes, elapsed } = fastest(() => allGiven(forged))

    expect(writes).toHaveLength(729)
    expect(elapsed).toBeLessThan(300)
  })
})
