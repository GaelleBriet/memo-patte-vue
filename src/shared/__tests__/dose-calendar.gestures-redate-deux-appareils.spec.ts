// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  redateDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, keys, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof redateDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

const historyAfter = (input: TreatmentViewInput, result: GestureOutcome) =>
  treatmentView(applied(input, result.changes)).history.map(({ line, effect }) => [
    line.id,
    line.givenOn,
    effect.kind,
  ])

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('TR-25 : « Modifier » une prise corrige toutes les lignes de sa dose (décision du 2026-10-14)', () => {
  it('dose du 16 oct. de Milo notée sur chaque appareil, corrigée au 17 : une seule ligne, donnée le 17, aucune ligne grisée', () => {
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(
      redateDose(input, { lineId: newer.id, givenOn: '2026-10-17', shiftsFollowing: false }),
    )
    expect(result.changes).toEqual([
      {
        action: 'rewrite',
        id: newer.id,
        line: {
          settingId: 'p1',
          dueOn: '2026-10-16',
          dueTime: null,
          status: 'given',
          givenOn: '2026-10-17',
          targetOn: null,
        },
      },
      { action: 'delete', id: older.id },
    ])
    expect(historyAfter(input, result)).toEqual([[newer.id, '2026-10-17', 'covers']])
  })

  it('une dose donnée et la même notée oubliée sur l’autre appareil, corrigée au 17 : l’oubli part aussi', () => {
    const missed = line('p1', 'missed', '2026-10-16')
    const given = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [missed, given], today: '2026-10-20' }
    const result = accepted(
      redateDose(input, { lineId: given.id, givenOn: '2026-10-17', shiftsFollowing: false }),
    )
    expect(result.changes).toContainEqual({ action: 'delete', id: missed.id })
    expect(historyAfter(input, result)).toEqual([[given.id, '2026-10-17', 'covers']])
  })

  it('Q-C1 : dose du 16 notée sur chaque appareil, corrigée le 25 « donnée le 24 » : elle devient la dose du 23, le 16 est à renseigner', () => {
    const base = [line('p1', 'given', '2026-10-02'), line('p1', 'given', '2026-10-09')]
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [...base, older, newer], today: '2026-10-25' }
    const result = accepted(
      redateDose(input, { lineId: newer.id, givenOn: '2026-10-24', shiftsFollowing: false }),
    )
    expect(result.changes).toContainEqual({ action: 'delete', id: older.id })
    const read = treatmentView(applied(input, result.changes))
    expect(keys(read.unloggedDoses)).toEqual(['2026-10-16'])
  })

  it('la date inchangée : rien n’est écrit, la ligne de l’autre appareil reste', () => {
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(
      redateDose(input, { lineId: newer.id, givenOn: '2026-10-16', shiftsFollowing: false }),
    )
    expect(result.changes).toEqual([])
  })

  it('#822, entre deux périodes : tous les jours à 20 h, dose du 2 avr. donnée, arrêt le 2, reprise le 2 dès le 2, la même dose notée de nouveau ; la prise de la reprise corrigée au 3 garde celle d’avant l’arrêt', () => {
    const stopped = setting('a1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('a2', '2026-04-02', DAY, ['20:00'])
    const before = line('a1', 'given', '2026-04-02', '20:00')
    const again = line('a2', 'given', '2026-04-02', '20:00')
    const input = { settings: [stopped, resumed], lines: [before, again], today: '2026-04-04' }
    const result = accepted(
      redateDose(input, { lineId: again.id, givenOn: '2026-04-03', shiftsFollowing: false }),
    )
    expect(result.changes.map(({ action }) => action)).not.toContain('delete')
    expect(historyAfter(input, result)).toContainEqual([before.id, '2026-04-02', 'covers'])
  })
})
