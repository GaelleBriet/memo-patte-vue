// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { treatmentView, type Frequency, type TreatmentViewInput } from '../domain/dose-calendar'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { H, MONTH, TWO_DAYS, WEEK, keys, line, setting } from './dose-calendar.v2.aides'

const THREE = ['08:00', '14:00', '20:00']

function sameHoursAgain(input: TreatmentViewInput, times: string[]) {
  const { frequency, endsOn } = treatmentView(input).currentSetting!
  return edited(input, { frequency, times, endsOn })
}

const states = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

const reportEffects = (input: TreatmentViewInput) =>
  treatmentView(input)
    .history.filter(({ line }) => line.status === 'postponed')
    .map(({ effect }) => effect.kind)

// Milo, tous les mois à 8 h et 20 h, première dose le 1er avril ; le 30 mars, la dose de 20 h du
// 1er avril donnée d'avance ; le 1er avril, 8 h, 14 h et 20 h (la prise de 20 h couvre 8 h, R4), puis
// la dose de 14 h reportée au 16 sans décaler : 14 h et 20 h partent au 16.
function milo(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-04-01', MONTH, H, { startsOn: '2026-03-28' })],
    lines: [],
    today: '2026-03-30',
  }
  input = on(given(input, '2026-04-01', '20:00'), '2026-04-01')
  input = sameHoursAgain(input, THREE)
  return moved(input, '2026-04-01', '14:00', '2026-04-16', false)
}

const MILO_AFTER = both({
  phase: 'upcoming',
  moment: ['2026-04-16 14:00'],
  aRenseigner: [],
  ensuite: ['2026-04-16 14:00', '2026-04-16 20:00', '2026-05-01 08:00'],
})

describe('Un report écrit sous les heures du jour garde ses doses quand le réglage change encore', () => {
  it('Milo : le report du 1er avril porte 14 h et 20 h au 16', () => {
    expect(readings(milo())).toEqual(MILO_AFTER)
  })

  it('Milo : « Modifier » sur la posologie seule, le 16 garde 14 h et 20 h et le report reste effectif', () => {
    const after = sameHoursAgain(milo(), THREE)
    expect(readings(after)).toEqual(MILO_AFTER)
    expect(reportEffects(after)).toEqual(['moves'])
  })

  it('Milo : heures passées à 8 h 01, 14 h 01, 20 h 01, le 16 garde 14 h et 20 h, le 1er avril ne redemande rien', () => {
    const after = sameHoursAgain(milo(), ['08:01', '14:01', '20:01'])
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-16 14:00'],
        aRenseigner: [],
        ensuite: ['2026-04-16 14:00', '2026-04-16 20:00', '2026-05-01 08:01'],
      }),
    )
    expect(states(after, '2026-04-01', '2026-04-16')).toEqual([
      '2026-04-01 08:01 covered',
      '2026-04-16 14:00 pending',
      '2026-04-16 20:00 pending',
    ])
    expect(reportEffects(after)).toEqual(['moves'])
  })
})

// Graine 6000001927 : tous les 2 jours sans heure dès le 15 mars (réglage remplacé le jour même), la
// dose du 17 reportée au 26 ; le 15, tous les jours à 8 h, 14 h, 20 h ; le 17, toutes les 6 semaines.
function sixWeeks(): TreatmentViewInput {
  const DAILY: Frequency = { value: 1, unit: 'day' }
  const SIX_WEEKS: Frequency = { value: 6, unit: 'week' }
  const daily = { startsOn: '2026-03-15', firstDueChosen: false }
  const given = (settingId: string, dueOn: string, time: string, givenOn: string) => ({
    ...line(settingId, 'given', dueOn, time),
    givenOn,
  })
  return {
    settings: [
      setting('s1', '2026-03-15', TWO_DAYS, []),
      setting('s2', '2026-03-16', DAILY, THREE, daily),
      setting('s3', '2026-03-18', SIX_WEEKS, THREE, {
        startsOn: '2026-03-17',
        firstDueChosen: false,
      }),
    ],
    lines: [
      line('s1', 'postponed', '2026-03-17', null, '2026-03-26'),
      given('s2', '2026-03-16', '20:00', '2026-03-17'),
      given('s2', '2026-03-18', '08:00', '2026-03-17'),
      line('s2', 'postponed', '2026-03-18', '14:00', '2026-03-28'),
      line('s2', 'shift', '2026-03-18', '14:00', '2026-03-28'),
      given('s2', '2026-03-16', '08:00', '2026-03-12'),
    ],
    today: '2026-03-17',
  }
}

describe('Un report parti de l’ancien rythme garde sa seule dose quand les heures changent', () => {
  it('graine 6000001927 : le 17, une minute de plus aux heures, le 26 garde une seule dose, sans heure', () => {
    const input = sixWeeks()
    expect(states(input, '2026-03-26', '2026-03-26')).toEqual(['2026-03-26 pending'])
    const after = sameHoursAgain(input, ['08:01', '14:01', '20:01'])
    expect(states(after, '2026-03-26', '2026-03-26')).toEqual(['2026-03-26 pending'])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

// Tous les 2 jours à 8 h et 20 h dès le 8 avril ; le 10 au matin, toute la journée reportée au 11.
function wholeDayMoved(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-04-08', TWO_DAYS, H)],
    lines: [],
    today: '2026-04-08',
  }
  input = given(given(input, '2026-04-08', '08:00'), '2026-04-08', '20:00')
  return moved(on(input, '2026-04-10'), '2026-04-10', '08:00', '2026-04-11', false)
}

describe('Le jour du changement, le jour de départ perd autant de doses que le report en emporte', () => {
  it('passage à 6 h seule : rien aujourd’hui, 8 h et 20 h le 11, puis le 12 à 6 h', () => {
    const after = sameHoursAgain(wholeDayMoved(), ['06:00'])
    expect(states(after, '2026-04-10', '2026-04-12')).toEqual([
      '2026-04-11 08:00 pending',
      '2026-04-11 20:00 pending',
      '2026-04-12 06:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(reportEffects(after)).toEqual(['moves'])
  })

  it('passage à « sans heure » : rien aujourd’hui non plus, 8 h et 20 h le 11, puis le 12', () => {
    const after = sameHoursAgain(wholeDayMoved(), [])
    expect(states(after, '2026-04-10', '2026-04-12')).toEqual([
      '2026-04-11 08:00 pending',
      '2026-04-11 20:00 pending',
      '2026-04-12 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

describe('La date choisie qui réécrit un report ne fixe pas les heures du jour choisi (#796)', () => {
  it('hebdomadaire à 8 h et 20 h, la dose du 13 reportée au 15 ; le 9, 9 h, « Prochaine dose » le 17 : le 17 à 9 h, puis le 24', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-06', WEEK, H)],
      lines: [],
      today: '2026-04-06',
    }
    input = given(given(input, '2026-04-06', '08:00'), '2026-04-06', '20:00')
    input = moved(on(input, '2026-04-09'), '2026-04-13', '08:00', '2026-04-15', false)
    const after = edited(input, {
      frequency: WEEK,
      times: ['09:00'],
      endsOn: null,
      firstDueOn: '2026-04-17',
    })
    expect(readings(after)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-17 09:00'],
        aRenseigner: [],
        ensuite: ['2026-04-17 09:00', '2026-04-24 09:00', '2026-05-01 09:00'],
      }),
    )
  })
})

describe('Deux téléphones, un réglage du jour réécrit (R10)', () => {
  // Graine 7600001452 : tous les 3 mois à 8, 14 et 20 h, première dose le 5 mars, 14 h et 20 h données
  // d'avance ; le 3, posologie seule (réglage ouvert le jour même).
  function base(): TreatmentViewInput {
    const QUARTER: Frequency = { value: 3, unit: 'month' }
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-03-05', QUARTER, THREE, { startsOn: '2026-03-03' })],
      lines: [],
      today: '2026-03-03',
    }
    input = given(given(input, '2026-03-05', '20:00'), '2026-03-05', '14:00')
    return sameHoursAgain(input, THREE)
  }

  it.fails(
    'A reporte 8 h du 5 au 6, B passe à 8 h 01, 14 h 01, 20 h 01 sans voir le report : les prises du 5 comptent, le 6 ne réclame qu’une dose (#860, pas encore tenu)',
    () => {
      const phoneA = moved(base(), '2026-03-05', '08:00', '2026-03-06', false)
      const phoneB = sameHoursAgain(base(), ['08:01', '14:01', '20:01'])
      expect(phoneB.settings).toHaveLength(2)
      const synced = { ...phoneB, lines: phoneA.lines }
      const givenEffects = treatmentView(synced)
        .history.filter(({ line }) => line.status === 'given')
        .map(({ effect }) => effect.kind)
      expect(givenEffects).toEqual(['covers', 'covers'])
      expect(states(synced, '2026-03-06', '2026-03-06')).toHaveLength(1)
    },
  )
})
