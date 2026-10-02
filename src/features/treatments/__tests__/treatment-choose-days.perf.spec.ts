// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  chooseDaysLayout,
  dayLabel,
  missedAmong,
  monthToggle,
  submitTexts,
  tabMonths,
  tabTexts,
  toggleDay,
} from '../logic/treatment-choose-days'
import i18n from '@/core/i18n'
import { days } from '@/shared/__tests__/treatment-schedule-fixtures'
import type { Due } from '@/shared/domain/treatment-schedule'

const t = i18n.global.t
const TROIS_ANS: Due[] = days('2023-09-28', '2026-09-27').flatMap((dueOn) =>
  ['08:00', '20:00'].map((dueTime) => ({ periodId: 'p-1', dueOn, dueTime })),
)

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

describe('« Choisir les jours » sur trois ans à deux heures par jour', () => {
  it('prépare les onglets et les mois de l’onglet actif en moins de 200 ms', () => {
    const { result, elapsed } = fastest(() => {
      const layout = chooseDaysLayout(t, TROIS_ANS)
      return { layout, months: tabMonths(t, layout.tabs[0]!) }
    })

    expect(TROIS_ANS).toHaveLength(2192)
    expect(result.layout.tabs).toHaveLength(2)
    expect(result.months).toHaveLength(37)
    expect(elapsed).toBeLessThan(200)
  })

  it('un tap ne recalcule que le total, l’onglet, le mois et sa case, en moins de 200 ms', () => {
    const layout = chooseDaysLayout(t, TROIS_ANS)
    const [tab] = layout.tabs
    const months = tabMonths(t, tab!)
    const month = months[18]!
    const unchecked = new Set<string>()

    const { result, elapsed } = fastest(() => {
      toggleDay(unchecked, month.dues[3]!)
      return {
        submit: submitTexts(
          t,
          TROIS_ANS.length,
          unchecked.size,
          'du 28 sept. 2023 au 27 sept. 2026',
        ),
        tabs: layout.tabs.map((each) =>
          tabTexts(t, each, missedAmong(each.dues, unchecked), layout.hasTabs),
        ),
        toggle: monthToggle(t, month, missedAmong(month.dues, unchecked)),
        labels: month.cells.map((cell) =>
          cell.due === null ? '' : dayLabel(t, cell.date, !unchecked.has(cell.key)),
        ),
      }
    })

    expect(result.labels).toHaveLength(month.cells.length)
    expect(elapsed).toBeLessThan(200)
  })
})
