// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { moveDose, treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { edited, moved, on, recorded } from './dose-calendar.reglage-corrige.aides'
import { DAY, H, keys, setting } from './dose-calendar.v2.aides'

// #1283 : Milo, tous les jours à 8 h et 20 h dès le 11 avril ; le 9, la dose de 8 h du 11 reportée
// au 15 avec la case ; le 11, « Modifier » : « Prochaine dose » le 13. Le 13 porte la dose reportée.
function milo(): TreatmentViewInput {
  const start: TreatmentViewInput = {
    settings: [setting('p1', '2026-04-11', DAY, H)],
    lines: [],
    today: '2026-04-09',
  }
  const reported = on(moved(start, '2026-04-11', '08:00', '2026-04-15'), '2026-04-11')
  return edited(reported, { frequency: DAY, times: H, endsOn: null, firstDueOn: '2026-04-13' })
}

function advancedTo11(dueTime: string, shiftsFollowing: boolean): TreatmentViewInput {
  const input = milo()
  const settingId = treatmentView(input).currentSetting!.id
  const due = { settingId, dueOn: '2026-04-13', dueTime }
  const result = moveDose(input, { due, to: '2026-04-11', shiftsFollowing })
  if ('refusal' in result) throw new Error(JSON.stringify(result))
  return recorded(input, result.changes)
}

const calendars = (input: TreatmentViewInput) => ({
  moteur: keys(
    treatmentView(input)
      .slots('2026-04-09', '2026-04-14')
      .map(({ due }) => due),
  ),
  reference: referenceReading({ ...input, until: '2026-04-14' })
    .upcoming.filter((key) => key >= '2026-04-09')
    .slice(0, 8),
})

describe('La première dose d’une date choisie avancée au jour d’origine de son report (G13, Q50, #1283)', () => {
  it('avant le geste : rien avant le 13', () => {
    expect(calendars(milo()).moteur).toEqual([
      '2026-04-13 08:00',
      '2026-04-13 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ])
  })

  it('8 h du 13 avancée au 11 sans la case : le 11 à 8 h et 20 h, le 13 ne garde rien', () => {
    const expected = [
      '2026-04-11 08:00',
      '2026-04-11 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('08:00', false))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })

  it('20 h du 13 avancée au 11 sans la case : le 11 à 20 h, le 13 garde 8 h', () => {
    const expected = [
      '2026-04-11 20:00',
      '2026-04-13 08:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('20:00', false))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })

  // Trou connu : avec la case, le report et son décalage sont supprimés et rien n'arrive le 11 (G13).
  it.fails('8 h du 13 avancée au 11 avec la case : la série repart du 11', () => {
    const expected = [
      '2026-04-11 08:00',
      '2026-04-11 20:00',
      '2026-04-12 08:00',
      '2026-04-12 20:00',
      '2026-04-13 08:00',
      '2026-04-13 20:00',
      '2026-04-14 08:00',
      '2026-04-14 20:00',
    ]

    expect(calendars(advancedTo11('08:00', true))).toEqual({
      moteur: expected,
      reference: expected,
    })
  })
})
