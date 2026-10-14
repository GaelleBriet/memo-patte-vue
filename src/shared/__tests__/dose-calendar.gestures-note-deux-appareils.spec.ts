// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  applied,
  noteDose,
  treatmentView,
  type GestureOutcome,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import { DAY, line, setting, WEEK } from './dose-calendar.v2.aides'

const accepted = (result: ReturnType<typeof noteDose>) => {
  if ('refusal' in result) throw new Error(`refusé : ${result.refusal.reason}`)
  return result as GestureOutcome
}

const historyAfter = (input: TreatmentViewInput, result: GestureOutcome) =>
  treatmentView(applied(input, result.changes)).history.map(({ line, effect }) => [
    line.id,
    line.status,
    effect.kind,
  ])

const mark = (
  dueOn: string,
  status: 'given' | 'missed',
  settingId = 'p1',
  dueTime: string | null = null,
) => ({
  due: { settingId, dueOn, dueTime },
  status,
  givenOn: dueOn,
  shiftsFollowing: false,
})

// Vendredis d'octobre : 2, 9, 16, 23, 30.
const p1 = setting('p1', '2026-10-02', WEEK)

describe('#841, TR-25 : « Marquer comme oubliée » s’applique à ce que la fiche montre comme une ligne (décision du 2026-10-14)', () => {
  it('dose du 16 donnée sur deux appareils, marquée oubliée : « Oubliée » seule, sans « Donnée le 16 · sans effet »', () => {
    const older = line('p1', 'given', '2026-10-16')
    const newer = line('p1', 'given', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'missed')))
    expect(result.changes).toEqual([
      {
        action: 'rewrite',
        id: newer.id,
        line: {
          settingId: 'p1',
          dueOn: '2026-10-16',
          dueTime: null,
          status: 'missed',
          givenOn: null,
          targetOn: null,
        },
      },
      { action: 'delete', id: older.id },
    ])
    expect(historyAfter(input, result)).toEqual([[newer.id, 'missed', 'covers']])
  })

  it('TR-25 : dose du 16 oubliée sur deux appareils, marquée donnée : « Donnée » seule', () => {
    const older = line('p1', 'missed', '2026-10-16')
    const newer = line('p1', 'missed', '2026-10-16')
    const input = { settings: [p1], lines: [older, newer], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'given')))
    expect(result.changes).toContainEqual({ action: 'delete', id: older.id })
    expect(historyAfter(input, result)).toEqual([[newer.id, 'given', 'covers']])
  })

  it('une ligne grisée « · sans effet » d’une autre dose n’est pas touchée', () => {
    const shown = line('p1', 'given', '2026-10-16')
    const other = line('p1', 'given', '2026-10-09')
    const input = { settings: [p1], lines: [other, shown], today: '2026-10-20' }
    const result = accepted(noteDose(input, mark('2026-10-16', 'missed')))
    expect(result.changes.map(({ action }) => action)).toEqual(['rewrite'])
  })

  it('#822, entre deux périodes : tous les jours à 20 h, dose du 2 avr. donnée, arrêt le 2, reprise le 2 dès le 2, la même dose notée de nouveau, marquée oubliée : seule la ligne touchée change', () => {
    const stopped = setting('a1', '2026-03-30', DAY, ['20:00'], { stoppedOn: '2026-04-02' })
    const resumed = setting('a2', '2026-04-02', DAY, ['20:00'])
    const before = line('a1', 'given', '2026-04-02', '20:00')
    const again = line('a2', 'given', '2026-04-02', '20:00')
    const input = { settings: [stopped, resumed], lines: [before, again], today: '2026-04-04' }
    const result = accepted(noteDose(input, mark('2026-04-02', 'missed', 'a2', '20:00')))
    expect(
      result.changes.map((change) => [change.action, 'id' in change ? change.id : null]),
    ).toEqual([['rewrite', again.id]])
  })
})
