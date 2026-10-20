import { describe, expect, it } from 'vitest'

import { doseChange } from '../logic/treatment-dose-change'
import { treatmentReadingOf } from '../logic/treatment-reading-adapter'
import { dose, period, treatment } from './treatment-fixtures'

const WRITTEN = '2026-03-09T08:00:00.000Z'
const written = { createdAt: WRITTEN, updatedAt: WRITTEN }

// Milo, chaque lundi à 8 h et 20 h ; la dose du 16 à 20 h est donnée le 9 ; le 11 passage à 9 h
// avec « Prochaine dose » le 23 ; aujourd'hui le 12 mars.
function milo() {
  const week = { value: 1, unit: 'week' as const }
  return treatment(
    [
      period({
        startsOn: '2026-03-02',
        firstDueOn: '2026-03-02',
        frequency: week,
        times: ['08:00', '20:00'],
        ...written,
      }),
      period({
        id: 'p-2',
        startsOn: '2026-03-11',
        firstDueOn: '2026-03-23',
        frequency: week,
        times: ['09:00'],
        createdAt: '2026-03-11T08:00:00.000Z',
        updatedAt: '2026-03-11T08:00:00.000Z',
      }),
    ],
    [
      dose('2026-03-02', '2026-03-02', { ...written, dueTime: '08:00' }),
      dose('2026-03-02', '2026-03-02', { ...written, dueTime: '20:00' }),
      dose('2026-03-09', '2026-03-09', { ...written, dueTime: '08:00' }),
      dose('2026-03-09', '2026-03-09', { ...written, dueTime: '20:00' }),
      dose('2026-03-16', '2026-03-16', { ...written, dueTime: '20:00', givenOn: '2026-03-09' }),
    ],
  )
}

const redate = (givenOn: string, shiftsFollowing: boolean) => () => {
  const book = milo()
  doseChange(
    book,
    treatmentReadingOf(book, '2026-03-12')!,
    { kind: 'redate', lineId: '2026-03-16 20:00', givenOn, shiftsFollowing },
    () => 'n',
  )
}

describe('« Changer la date » d’une prise donnée d’avance (#921)', () => {
  it.each([true, false])(
    'le moteur accepte la correction à toute date passée à moins d’un intervalle de l’échéance (décaler la suite : %s)',
    (shiftsFollowing) => {
      for (const givenOn of ['2026-03-10', '2026-03-11', '2026-03-12']) {
        expect(redate(givenOn, shiftsFollowing)).not.toThrow()
      }
    },
  )

  it.each([true, false])(
    'TR-24 bis, #1004 : un intervalle ou plus avant l’échéance du 16, la correction est refusée (décaler la suite : %s)',
    (shiftsFollowing) => {
      for (const givenOn of ['2026-03-01', '2026-03-05', '2026-03-08']) {
        expect(redate(givenOn, shiftsFollowing)).toThrow('too-early')
      }
    },
  )
})
