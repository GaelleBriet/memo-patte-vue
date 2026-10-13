// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { applied, removalRefusal, removeLine, treatmentView } from '../domain/dose-calendar'
import { DAY, line, setting, WEEK } from './dose-calendar.v2.aides'

const TWO_WEEKS = { value: 2, unit: 'week' as const }
const SIX_WEEKS = { value: 6, unit: 'week' as const }

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

  it('#780, Q25 : toutes les 2 semaines à 20 h, dose du 13 avr. reportée au 14, puis toutes les 6 semaines à 6, 12, 18, 23 h dès le 14 : le report a servi, il ne se supprime plus', () => {
    const metacam = setting('m1', '2026-03-30', TWO_WEEKS, ['20:00'])
    const report = line('m1', 'postponed', '2026-04-13', '20:00', '2026-04-14')
    const sixWeeks = setting('m2', '2026-04-14', SIX_WEEKS, ['06:00', '12:00', '18:00', '23:00'], {
      startsOn: '2026-04-02',
    })
    const input = {
      settings: [metacam, sixWeeks],
      lines: [line('m1', 'given', '2026-03-30', '20:00'), report],
      today: '2026-04-02',
    }
    expect(removalRefusal(input, report.id)).toEqual({ reason: 'not-movable' })
    expect(removeLine(input, report.id)).toEqual({ refusal: { reason: 'not-movable' } })
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

describe('TR-25 : « Supprimer » une dose supprime toutes ses lignes (décision du 2026-10-12)', () => {
  const twice = (dueOn: string) => [line('p1', 'given', dueOn), line('p1', 'given', dueOn)]

  it('dose du 16 oct. de Milo notée sur chaque appareil, « Supprimer » : plus aucune ligne pour cette dose', () => {
    const [older, newer] = twice('2026-10-16')
    const input = { settings: [p1], lines: [older!, newer!], today: '2026-10-20' }
    const result = removeLine(input, newer!.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: newer!.id },
      { action: 'delete', id: older!.id },
    ])
  })

  it('une dose donnée et la même notée oubliée sur l’autre appareil : les deux lignes partent', () => {
    const missed = line('p1', 'missed', '2026-10-16')
    const given = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [missed, given], today: '2026-10-20' }
    const result = removeLine(input, given.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: given.id },
      { action: 'delete', id: missed.id },
    ])
  })

  it('la ligne grisée « · sans effet » se supprime seule, la prise en vigueur reste', () => {
    const [older, newer] = twice('2026-10-16')
    const input = { settings: [p1], lines: [older!, newer!], today: '2026-10-20' }
    const result = removeLine(input, older!.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: older!.id },
    ])
  })

  it('dose du 16 notée sous l’ancien réglage et sous celui ouvert le 16 (deux appareils) : « Supprimer » la prise en vigueur emporte l’autre, la dose n’est plus donnée', () => {
    const p2 = setting('p2', '2026-10-16', WEEK)
    const old = line('p1', 'given', '2026-10-16')
    const other = line('p2', 'given', '2026-10-16')
    const input = { settings: [p1, p2], lines: [old, other], today: '2026-10-20' }
    const result = removeLine(input, old.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: old.id },
      { action: 'delete', id: other.id },
    ])
    if ('refusal' in result) return
    const after = treatmentView(applied(input, result.changes))
    expect(after.history.some(({ effect }) => effect.kind === 'covers')).toBe(false)
  })

  it('#822, entre deux périodes (décision du 2026-10-13 au soir) : tous les jours, dose du 6 donnée d’avance le 5, arrêt le 5, « Reprendre » le 5 avec première dose le 6, dose du 6 notée de nouveau : « Supprimer » ne retire que la ligne touchée', () => {
    const stopped = setting('d1', '2026-10-01', DAY, [], { stoppedOn: '2026-10-05' })
    const resumed = setting('d2', '2026-10-06', DAY, [], { startsOn: '2026-10-05' })
    const ahead = { ...line('d1', 'given', '2026-10-06'), givenOn: '2026-10-05' }
    const again = line('d2', 'given', '2026-10-06')
    const input = { settings: [stopped, resumed], lines: [ahead, again], today: '2026-10-06' }
    const result = removeLine(input, again.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: again.id },
    ])
  })

  it('#822 : tous les jours à 20 h, dose du 2 avr. donnée, arrêt le 2, reprise le 2 dès le 2, la même dose notée de nouveau : « Supprimer » la prise de la reprise garde celle d’avant l’arrêt, qui couvre la dose', () => {
    const stopped = setting('p1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('p2', '2026-04-02', DAY, ['20:00'])
    const before = line('p1', 'given', '2026-04-02', '20:00')
    const again = line('p2', 'given', '2026-04-02', '20:00')
    const input = { settings: [stopped, resumed], lines: [before, again], today: '2026-04-02' }
    const result = removeLine(input, again.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: again.id },
    ])
    if ('refusal' in result) return
    const after = treatmentView(applied(input, result.changes))
    expect(after.history.map(({ line, effect }) => [line.id, effect])).toEqual([
      [before.id, { kind: 'covers', key: '2026-04-02 20:00' }],
    ])
  })

  it('le report et le décalage de la même journée ne sont pas des lignes de la dose', () => {
    const given = line('p1', 'given', '2026-10-16')
    const shift = line('p1', 'shift', '2026-10-16', null, '2026-10-19')
    const input = { settings: [p1], lines: [given, shift], today: '2026-10-20' }
    const result = removeLine(input, given.id)
    expect('refusal' in result ? result : result.changes).toEqual([
      { action: 'delete', id: given.id },
    ])
  })
})
