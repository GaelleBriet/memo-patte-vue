import { afterEach, describe, expect, it } from 'vitest'

import { dose, missed, period, plain, treatment } from './treatment-fixtures'
import { treatmentHistory } from '../logic/treatment-history'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import type { NewTreatmentDose } from '../schema/treatment-dose.schema'
import { applyLocale } from '@/core/i18n'
import i18n from '@/core/i18n'

const t = i18n.global.t
const TODAY = '2026-03-25'

type Entry = [day: number, time: string, status: 'g' | 'm']

function folded(entries: Entry[], times: string[]) {
  const book = treatment(
    [
      period({
        frequency: { value: 1, unit: 'day' },
        times,
        startsOn: '2026-03-01',
        firstDueOn: '2026-03-01',
      }),
    ],
    entries.map(([day, time, status]): NewTreatmentDose => {
      const on = `2026-03-${String(day).padStart(2, '0')}`
      return (status === 'g' ? dose : missed)(on, on, { dueTime: time, id: `${on} ${time}` })
    }),
  )
  const [only] = plain(treatmentHistory(t, book, treatmentReadingOf(book, TODAY), TODAY)).periods
  return only!
}

const TWICE = ['08:00', '20:00']

afterEach(() => applyLocale('fr'))

describe('repli de l’historique : une date ne se coupe pas, un groupe d’oublis ne prolonge jamais la coupe', () => {
  it('montre trois lignes et un bouton pour trois prises par jour dont les oublis et les prises alternent', () => {
    const entries = Array.from({ length: 10 }, (_, index): Entry[] => [
      [index + 1, '08:00', 'm'],
      [index + 1, '14:00', 'g'],
      [index + 1, '20:00', 'm'],
    ]).flat()
    const only = folded(entries, ['08:00', '14:00', '20:00'])

    expect(only.visibleLines).toBe(3)
    expect(only.toggle?.show).toMatch(/^Voir les \d+ prises précédentes$/)
  })

  it('garde les deux prises du même jour à la coupe', () => {
    const only = folded(
      [
        [5, '08:00', 'g'],
        [5, '20:00', 'g'],
        [4, '08:00', 'g'],
        [4, '20:00', 'g'],
        [3, '08:00', 'g'],
        [3, '20:00', 'g'],
      ],
      TWICE,
    )

    expect(only.visibleLines).toBe(4)
    expect(only.toggle?.show).toBe('Voir les 2 prises précédentes')
  })

  it('s’arrête après un groupe d’oublis qui est la troisième ligne', () => {
    const only = folded(
      [
        [9, '20:00', 'g'],
        [9, '08:00', 'g'],
        [8, '20:00', 'm'],
        [8, '08:00', 'm'],
        [7, '20:00', 'm'],
        [7, '08:00', 'g'],
        [6, '20:00', 'g'],
      ],
      TWICE,
    )

    expect(only.lines[2]!.kind).toBe('missed')
    expect(only.visibleLines).toBe(3)
  })

  it('laisse replié un groupe d’oublis placé juste après la troisième date', () => {
    const only = folded(
      [
        [9, '20:00', 'g'],
        [9, '08:00', 'g'],
        [8, '20:00', 'g'],
        [8, '08:00', 'm'],
        [7, '20:00', 'm'],
        [7, '08:00', 'g'],
      ],
      TWICE,
    )

    expect(only.lines[3]!.kind).toBe('missed')
    expect(only.visibleLines).toBe(3)
  })

  it('garde deux groupes d’oublis séparés derrière la coupe', () => {
    const only = folded(
      [
        [9, '20:00', 'm'],
        [9, '08:00', 'm'],
        [8, '20:00', 'm'],
        [8, '08:00', 'g'],
        [7, '20:00', 'm'],
        [7, '08:00', 'm'],
        [6, '20:00', 'g'],
        [6, '08:00', 'g'],
      ],
      TWICE,
    )

    expect(only.visibleLines).toBe(3)
    expect(only.toggle).not.toBeNull()
  })

  it('ne replie rien sans ligne, ni avec une seule date', () => {
    expect(folded([], TWICE)).toMatchObject({ lines: [], visibleLines: 0, toggle: null })

    const single = folded(
      [
        [5, '08:00', 'g'],
        [5, '20:00', 'g'],
      ],
      TWICE,
    )
    expect(single).toMatchObject({ visibleLines: 2, toggle: null })
  })

  it('dit « la prise précédente » quand une seule est repliée', () => {
    const only = folded(
      [
        [4, '08:00', 'g'],
        [3, '08:00', 'g'],
        [2, '08:00', 'g'],
        [1, '08:00', 'g'],
      ],
      ['08:00'],
    )

    expect(only.toggle?.show).toBe('Voir la prise précédente')
  })

  it('dit « l’autre prise de cette période » pour la période en cours d’un traitement à deux périodes', () => {
    const book = treatment(
      [
        period({
          id: 'p-0',
          startsOn: '2026-02-01',
          firstDueOn: '2026-02-01',
          endsOn: '2026-02-10',
        }),
        period({ id: 'p-1', startsOn: '2026-03-01', firstDueOn: '2026-03-01' }),
      ],
      [4, 3, 2, 1].map((day) => {
        const on = `2026-03-0${day}`
        return dose(on, on, { id: on, periodId: 'p-1' })
      }),
    )
    const [current] = plain(
      treatmentHistory(t, book, treatmentReadingOf(book, TODAY), TODAY),
    ).periods

    expect(current!.toggle?.show).toBe('Voir l’autre prise de cette période')
  })
})
