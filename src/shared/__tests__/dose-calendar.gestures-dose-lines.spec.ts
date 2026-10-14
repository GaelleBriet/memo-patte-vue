// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { doseLines } from '../domain/dose-calendar/gestures/dose-lines'
import { DAY, line, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)
const ids = (lines: { id: string }[]) => lines.map(({ id }) => id)

describe('TR-25 : les lignes que la fiche montre comme une seule dose', () => {
  it('dose du 16 donnée sur un appareil, oubliée sur l’autre : la prise en vigueur emporte l’oubli', () => {
    const missed = line('p1', 'missed', '2026-10-16')
    const given = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [missed, given], today: '2026-10-20' }
    expect(ids(doseLines(input, given))).toEqual([missed.id])
  })

  it('la ligne grisée « · sans effet » n’emporte rien', () => {
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    expect(doseLines(input, older)).toEqual([])
  })

  it('le report et le décalage de la même journée ne sont pas des lignes de la dose', () => {
    const given = line('p1', 'given', '2026-10-16')
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const input = { settings: [p1], lines: [given, shift], today: '2026-10-20' }
    expect(doseLines(input, given)).toEqual([])
  })

  it('#822 : la même dose notée avant l’arrêt et après « Reprendre » le même jour n’est pas la même ligne', () => {
    const stopped = setting('d1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('d2', '2026-04-02', DAY, ['20:00'])
    const before = line('d1', 'given', '2026-04-02', '20:00')
    const again = line('d2', 'given', '2026-04-02', '20:00')
    const input = { settings: [stopped, resumed], lines: [before, again], today: '2026-04-02' }
    expect(doseLines(input, again)).toEqual([])
  })
})
