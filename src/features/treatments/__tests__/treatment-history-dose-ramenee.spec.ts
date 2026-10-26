import { afterEach, describe, expect, it } from 'vitest'

import { period, plain, postponed, treatment } from './treatment-fixtures'
import { treatmentHistory } from '../logic/treatment-history'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

// Q55 : toutes les 6 semaines à 20 h dès le 21 septembre, la dose du 21 reportée au 28, puis
// « Modifier » avec la première dose le 19 : le 21 sort du calendrier ; la dose ramenée au 21 y revient.
const book = treatment(
  [
    period({
      id: 'p-1',
      startsOn: '2026-09-21',
      firstDueOn: '2026-09-21',
      frequency: { value: 6, unit: 'week' },
      times: ['20:00'],
    }),
    period({
      id: 'p-2',
      startsOn: '2026-09-19',
      firstDueOn: '2026-09-19',
      frequency: { value: 6, unit: 'week' },
      times: ['20:00'],
      createdAt: '2026-09-19T08:00:00.000Z',
      updatedAt: '2026-09-19T08:00:00.000Z',
    }),
  ],
  [
    postponed('2026-09-21', '2026-09-21', {
      periodId: 'p-1',
      dueTime: '20:00',
      updatedAt: '2026-09-19T09:00:00.000Z',
    }),
  ],
)

function moveRow() {
  const history = treatmentHistory(t, book, treatmentReadingOf(book, '2026-09-19'), '2026-09-19')
  return plain(history.periods.flatMap(({ lines }) => lines).find(({ kind }) => kind === 'move'))
}

afterEach(() => applyLocale('fr'))

describe('treatmentHistory — une dose ramenée sur son jour d’origine sorti du calendrier (Q55, #1282)', () => {
  it('la dose est au calendrier le 21 septembre', () => {
    const view = treatmentReadingOf(book, '2026-09-19').view

    expect(view.slots('2026-09-21', '2026-09-21').map(({ state }) => state)).toEqual(['pending'])
  })

  it('sa ligne prend le titre d’une dose ordinaire, sans « Reportée au »', () => {
    expect(moveRow()?.title).toBe('21 sept. 2026')
  })

  it('en anglais aussi', () => {
    applyLocale('en')

    expect(moveRow()?.title).toBe('Sep 21, 2026')
  })
})
