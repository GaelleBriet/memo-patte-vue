// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { removalRefusal, removeLine } from '../domain/dose-calendar'
import { line, setting, WEEK } from './dose-calendar.v2.aides'

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('« Supprimer » (R11, Q25, N8, G19)', () => {
  it('une prise se supprime toujours, la seule comprise (TR-26) ; son décalage reste (N6)', () => {
    const prise = line('p1', 'given', '2026-10-16')
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const input = { settings: [p1], lines: [prise, shift], today: '2026-10-20' }
    const result = removeLine(input, prise.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: prise.id },
    ])
  })

  it('Q25 : dose du 16 reportée au 19 et donnée le 19 : le report ne se supprime plus', () => {
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const input = {
      settings: [p1],
      lines: [report, line('p1', 'given', '2026-10-19')],
      today: '2026-10-20',
    }
    expect(removalRefusal(input, report.id)).toEqual({ reason: 'arrival-logged' })
  })

  it('N8 : un décalage suivi d’une prise plus loin ne se supprime pas ; la prise de la dose reportée elle-même ne compte pas', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const later = {
      settings: [p1],
      lines: [shift, line('p1', 'given', '2026-10-26')],
      today: '2026-10-27',
    }
    expect(removalRefusal(later, shift.id)).toEqual({ reason: 'later-dose' })
    const report = line('p1', 'postponed', '2026-10-16', null, '2026-10-19')
    const own = {
      settings: [p1],
      lines: [report, shift, line('p1', 'given', '2026-10-19')],
      today: '2026-10-20',
    }
    expect(removalRefusal(own, shift.id)).toBeNull()
  })

  it('G19 : décalage du 16 au 19, dose du 26 avancée seule au 23 : « Supprime d’abord le report du 23 oct. »', () => {
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const report = line('p1', 'postponed', '2026-10-26', null, '2026-10-23')
    const input = { settings: [p1], lines: [shift, report], today: '2026-10-20' }
    expect(removalRefusal(input, shift.id)).toEqual({
      reason: 'report-off-rhythm',
      on: '2026-10-23',
    })
  })

  it('R11 : une ligne sans effet se supprime toujours', () => {
    const back = line('p1', 'postponed', '2026-10-16', null, '2026-10-16')
    const input = {
      settings: [p1],
      lines: [back, line('p1', 'given', '2026-10-16')],
      today: '2026-10-20',
    }
    expect(removalRefusal(input, back.id)).toBeNull()
  })
})
