// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { Frequency, TreatmentViewInput } from '../domain/dose-calendar'
import {
  both,
  edited,
  given,
  moved,
  on,
  readings,
  removed,
} from './dose-calendar.reglage-corrige.aides'
import { H, line, setting, WEEK } from './dose-calendar.v2.aides'

const TWO_WEEKS: Frequency = { value: 2, unit: 'week' }
const THREE_DAYS: Frequency = { value: 3, unit: 'day' }

describe('R3, R9 : heures seules corrigées, la « Prochaine dose » choisie reste l’origine du réglage', () => {
  // Milo, toutes les 2 semaines à 8 h et 20 h dès le 30 mars ; la dose du 30 à 20 h reportée au
  // 11 avril avec décalage ; le 1er avril, « Prochaine dose » le 25 ; le 2, retour à 2 semaines,
  // l'arrivée du report déplacée au 18 avec décalage, et la prise du 30 à 8 h supprimée.
  function milo() {
    const every = (times: string[]) => ({ frequency: TWO_WEEKS, times, endsOn: '2026-05-02' })
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-30', TWO_WEEKS, H)],
      lines: [],
      today: '2026-03-30',
    }
    input = given(input, '2026-03-30', '08:00')
    input = moved(on(input, '2026-03-31'), '2026-03-30', '20:00', '2026-04-11')
    input = edited(on(input, '2026-04-01'), {
      frequency: THREE_DAYS,
      times: ['20:00'],
      endsOn: '2026-05-11',
      firstDueOn: '2026-04-25',
    })
    input = edited(on(input, '2026-04-02'), { ...every(H), firstDueOn: '2026-04-25' })
    input = moved(input, '2026-04-11', '20:00', '2026-04-18')
    return { input: removed(input, '2026-03-30', '08:00'), every }
  }

  it('avant le changement : le report du 18 avril, puis la journée du 25, rien en retard', () => {
    expect(readings(milo().input)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-18 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-18 20:00', '2026-04-25 08:00', '2026-04-25 20:00'],
      }),
    )
  })

  it('le 2 avril, 8 h 01 et 20 h 01 : rien en retard, le 18, déplacé, garde 20 h, puis la journée du 25 aux nouvelles heures (décision du 15 octobre 2026)', () => {
    const { input, every } = milo()
    expect(readings(edited(input, every(['08:01', '20:01'])))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-18 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-18 20:00', '2026-04-25 08:01', '2026-04-25 20:01'],
      }),
    )
  })
})

describe('R3, TR-28, Q38 : heures seules corrigées, « Elles n’étaient pas à donner » garde la date choisie', () => {
  // Luna, toutes les semaines à 8 h et 20 h, première dose le 6 avril : 8 h donnée le 3, 20 h
  // reportée au 12 ; le 5, 8, 14 et 20 h jusqu'au 13, 14 h donnée ; le 8, « Prochaine dose » le 10
  // et la prise de 14 h supprimée. Carnet tel que ces gestes l'ont écrit avant la décision du
  // 15 octobre 2026, qui ne laisse plus de 14 h le 6.
  function luna() {
    const weekly = (times: string[]) => ({ frequency: WEEK, times, endsOn: '2026-04-13' })
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-04-06', WEEK, H, { startsOn: '2026-04-03' }),
        setting('s2', '2026-04-06', WEEK, ['08:00', '14:00', '20:00'], {
          startsOn: '2026-04-05',
          gridOriginOn: null,
          firstDueChosen: false,
          endsOn: '2026-04-13',
        }),
        setting('s3', '2026-04-10', WEEK, H, { startsOn: '2026-04-08', endsOn: '2026-04-13' }),
      ],
      lines: [
        { ...line('s1', 'given', '2026-04-06', '08:00'), givenOn: '2026-04-03' },
        line('s1', 'postponed', '2026-04-06', '20:00', '2026-04-10'),
      ],
      today: '2026-04-12',
    }
    return { input, weekly }
  }

  it('avant le changement : la dose du 10 à 20 h en retard, rien à renseigner le 6', () => {
    expect(readings(luna().input)).toEqual(
      both({ phase: 'overdue', moment: ['2026-04-10 20:00'], aRenseigner: [], ensuite: [] }),
    )
  })

  it('le 12, 6, 12, 18 et 23 h : rien à renseigner le 6 avril, seule la dose du 10, déplacée, reste à renseigner à 20 h (décision du 15 octobre 2026)', () => {
    const { input, weekly } = luna()
    const after = edited(input, weekly(['06:00', '12:00', '18:00', '23:00']), 'correct')
    expect(readings(after)).toEqual(
      both({
        phase: 'today',
        moment: ['2026-04-12 06:00', '2026-04-12 12:00', '2026-04-12 18:00', '2026-04-12 23:00'],
        aRenseigner: ['2026-04-10 20:00'],
        ensuite: ['2026-04-12 06:00', '2026-04-12 12:00', '2026-04-12 18:00'],
      }),
    )
  })
})
