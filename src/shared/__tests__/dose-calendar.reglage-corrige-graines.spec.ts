// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type TreatmentViewInput } from '../domain/dose-calendar'
import { referenceReading } from '../domain/dose-calendar/reference-model'
import { both, edited, readings } from './dose-calendar.reglage-corrige.aides'
import { keys, line, MONTH, setting } from './dose-calendar.v2.aides'

describe('R6, R9 : heures seules corrigées, une origine écrite par l’app ne fait pas sortir un report d’avant elle', () => {
  const givenAt = (dueOn: string, givenOn: string) => ({ givenOn, dueOn })
  const minuteLater = (input: TreatmentViewInput) => {
    const { frequency, times, endsOn } = treatmentView(input).currentSetting!
    return edited(input, { frequency, times: times.map((t) => t.replace(/0$/, '1')), endsOn })
  }

  it('graine 7300001299 : chaque mois ; « Elles restent à renseigner » avec la dose du 6 avr. 20 h avancée au 2 avr. et donnée ; le 25 mars, une minute plus tard : rien ne revient, la journée du 6 avr. reste avancée (décision du 15 octobre 2026)', () => {
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-06', MONTH, ['08:00', '20:00']),
        setting('s2', '2026-04-06', MONTH, ['20:00'], {
          startsOn: '2026-03-07',
          firstDueChosen: false,
          pastDosesStayUnlogged: true,
        }),
        setting('s3', '2026-04-02', MONTH, ['08:00', '14:00', '20:00'], {
          startsOn: '2026-03-21',
          gridOriginOn: null,
        }),
      ],
      lines: [
        line('s1', 'missed', '2026-03-06', '08:00'),
        line('s1', 'shift', '2026-03-06', '20:00', '2026-03-14'),
        line('s2', 'postponed', '2026-04-06', '20:00', '2026-04-02'),
        { ...line('s1', 'given', '2026-03-06', '20:00'), ...givenAt('2026-03-06', '2026-03-18') },
        { ...line('s2', 'given', '2026-04-02', '20:00'), ...givenAt('2026-04-02', '2026-03-21') },
        line('s2', 'shift', '2026-04-06', '20:00', '2026-03-21'),
      ],
      today: '2026-03-25',
    }
    expect(readings(input).moteur.ensuite[0]).toBe('2026-04-21 08:00')
    expect(readings(minuteLater(input))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-21 08:01'],
        aRenseigner: [],
        ensuite: ['2026-04-21 08:01', '2026-04-21 14:01', '2026-04-21 20:01'],
      }),
    )
  })

  it('graine 7300000230 : chaque mois dès le 5 avr., dose du 5 mai reportée au 26 ; le 5, toutes les 2 semaines, puis 20 h ; le 12, une minute plus tard : la dose du 26 mai reste', () => {
    const quarter = { value: 3, unit: 'month' as const }
    const fortnight = { value: 2, unit: 'week' as const }
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-29', quarter, ['08:00', '20:00']),
        setting('s2', '2026-04-01', quarter, ['08:00', '20:00'], {
          startsOn: '2026-03-30',
          gridOriginOn: null,
          stoppedOn: '2026-03-31',
        }),
        setting('s3', '2026-04-05', MONTH, ['08:00', '14:00', '20:00'], { startsOn: '2026-04-04' }),
        setting('s4', '2026-04-05', fortnight, ['08:00', '14:00', '20:00'], {
          firstDueChosen: false,
        }),
        setting('s5', '2026-04-05', fortnight, ['20:00'], {
          startsOn: '2026-04-08',
          gridOriginOn: null,
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-03-29', '20:00', '2026-04-01'),
        line('s1', 'shift', '2026-03-29', '20:00', '2026-04-01'),
        line('s2', 'postponed', '2026-07-01', '20:00', '2026-07-14'),
        line('s2', 'shift', '2026-07-01', '20:00', '2026-07-14'),
        line('s3', 'postponed', '2026-05-05', '08:00', '2026-05-26'),
        line('s2', 'given', '2026-04-01', '20:00'),
        { ...line('s2', 'given', '2026-07-01', '08:00'), ...givenAt('2026-07-01', '2026-03-31') },
        line('s3', 'given', '2026-04-05', '14:00'),
        line('s4', 'given', '2026-04-05', '20:00'),
        { ...line('s4', 'given', '2026-04-05', '08:00'), ...givenAt('2026-04-05', '2026-04-08') },
        line('s4', 'shift', '2026-04-05', '08:00', '2026-04-08'),
      ],
      today: '2026-04-12',
    }
    const after = minuteLater(input)
    const reference = referenceReading({ ...after, until: '2026-06-30' })
    const days = (dues: string[]) => dues.slice(0, 5).map((due) => due.slice(0, 10))
    const engine = keys(treatmentView(after).upcoming({ limit: 5 }))
    // Décision du 15 octobre 2026 : le report du 5 mai emporte ses trois heures au 26.
    const expected = ['2026-04-22', '2026-05-06', '2026-05-20', '2026-05-26', '2026-05-26']
    expect({ moteur: days(engine), reference: days(reference.upcoming) }).toEqual({
      moteur: expected,
      reference: expected,
    })
  })

  it('graine 7300001976 : chaque mois à 8 h et 20 h, « Prochaine dose » le 4 avr., 8 h donnée d’avance, 20 h reportée au 7 ; le 29 mars, toutes les 2 semaines ; une minute plus tard : rien en retard le 4, la dose du 7, déplacée, reste à 20 h (décision du 15 octobre 2026)', () => {
    const fortnight = { value: 2, unit: 'week' as const }
    const H = ['08:00', '20:00']
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-20', fortnight),
        setting('s2', '2026-04-02', fortnight, [], {
          startsOn: '2026-03-25',
          gridOriginOn: null,
          endsOn: '2026-04-17',
          stoppedOn: '2026-03-28',
        }),
        setting('s3', '2026-04-04', MONTH, H, { startsOn: '2026-03-28', endsOn: '2026-04-08' }),
        setting('s4', '2026-04-04', fortnight, H, {
          startsOn: '2026-03-29',
          firstDueChosen: false,
          endsOn: '2026-04-08',
        }),
        setting('s5', '2026-04-04', fortnight, H, {
          startsOn: '2026-03-29',
          gridOriginOn: null,
          endsOn: '2026-04-08',
        }),
      ],
      lines: [
        line('s1', 'postponed', '2026-03-20', null, '2026-04-02'),
        { ...line('s3', 'given', '2026-04-04', '08:00'), ...givenAt('2026-04-04', '2026-03-25') },
        line('s3', 'postponed', '2026-04-04', '20:00', '2026-04-07'),
      ],
      today: '2026-03-29',
    }
    expect(readings(minuteLater(input))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-07 20:00'],
        aRenseigner: [],
        ensuite: ['2026-04-07 20:00'],
      }),
    )
  })
})
