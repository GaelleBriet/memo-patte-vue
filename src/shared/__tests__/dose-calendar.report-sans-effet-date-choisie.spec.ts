// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { edited, given, moved, on, readings, removed } from './dose-calendar.reglage-corrige.aides'
import { DAY, setting } from './dose-calendar.v2.aides'

const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }

const effetDuReport = (input: TreatmentViewInput) => {
  const report = input.lines.find(({ status }) => status === 'postponed')!
  return treatmentView(input).history.find(({ line }) => line.id === report.id)?.effect.kind
}

// Milo, chaque jour depuis le 6 mars ; le 9, la dose du 10 reportée au 21 avec la case ; le 12, elle est
// redéplacée (à `to`) avec la case, puis « Modifier » : toutes les 2 semaines, « Prochaine dose » le 21.
function milo(times: string[], dueTime: string | null, to: string): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-06', DAY, times)],
    lines: [],
    today: '2026-03-09',
  }
  input = moved(input, '2026-03-10', dueTime, '2026-03-21')
  input = moved(on(input, '2026-03-12'), '2026-03-21', dueTime, to)
  return edited(input, { frequency: TWO_WEEKS, times, endsOn: null, firstDueOn: '2026-03-21' })
}

describe('Report redéplacé depuis une date choisie, plus ancien que le « Modifier » (#1231, Q39, Q41)', () => {
  it('ramené au 17 : le report et son décalage sont sans effet, les 10 et 11 mars reviennent à renseigner', () => {
    const input = milo([], null, '2026-03-17')
    const { moteur, reference } = readings(input)

    expect(effetDuReport(input)).toBe('idle')
    expect(moteur.aRenseigner).toEqual(expect.arrayContaining(['2026-03-10', '2026-03-11']))
    expect(reference).toEqual(moteur)
  })

  it('jamais redéplacé : le report du 10 au 17 reste en vigueur, la fiche montre le 17', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-06', DAY)],
      lines: [],
      today: '2026-03-09',
    }
    input = moved(input, '2026-03-10', null, '2026-03-17')
    input = edited(on(input, '2026-03-12'), {
      frequency: TWO_WEEKS,
      times: [],
      endsOn: null,
      firstDueOn: '2026-03-21',
    })
    const { moteur, reference } = readings(input)

    expect(effetDuReport(input)).toBe('moves')
    expect(moteur.moment).toEqual(['2026-03-17'])
    expect(reference).toEqual(moteur)
  })

  it('redéplacé au 4 avril : donné après le « Modifier », le 4 avril ne remet pas le report en vigueur ; le 10 mars reste à renseigner', () => {
    const before = milo([], null, '2026-04-04')
    const after = given(on(before, '2026-04-04'), '2026-04-04', null)
    const back = removed(after, '2026-04-04', null)

    for (const input of [before, after, back]) {
      expect(effetDuReport(input)).toBe('idle')
      expect(readings(input).moteur.aRenseigner).toContain('2026-03-10')
      expect(readings(input).reference).toEqual(readings(input).moteur)
    }
  })

  it('à 8 h et 20 h, la dose de 20 h redéplacée au 4 avril : donnée après le « Modifier », le 10 mars à 20 h reste à renseigner', () => {
    const before = milo(['08:00', '20:00'], '20:00', '2026-04-04')
    const after = given(on(before, '2026-04-04'), '2026-04-04', '20:00')
    const back = removed(after, '2026-04-04', '20:00')

    for (const input of [before, after, back]) {
      expect(effetDuReport(input)).toBe('idle')
      expect(readings(input).moteur.aRenseigner).toContain('2026-03-10 20:00')
      expect(readings(input).reference).toEqual(readings(input).moteur)
    }
  })
})
