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
// 1er avril donnée d'avance ; le 1er avril, 8 h, 14 h et 20 h, puis la dose de 14 h reportée au 16
// sans décaler (carnet écrit quand la prise de 20 h couvrait 8 h, R4).
function milo(): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-04-01', MONTH, H, { startsOn: '2026-03-28' })],
    lines: [],
    today: '2026-03-30',
  }
  input = on(given(input, '2026-04-01', '20:00'), '2026-04-01')
  input = sameHoursAgain(input, THREE)
  const daily = treatmentView(input).currentSetting!.id
  return {
    ...input,
    lines: [...input.lines, line(daily, 'postponed', '2026-04-01', '14:00', '2026-04-16')],
  }
}

const MILO_AFTER = both({
  phase: 'today',
  moment: ['2026-04-01 08:00'],
  aRenseigner: [],
  ensuite: ['2026-04-01 08:00', '2026-04-16 14:00', '2026-05-01 08:00'],
})

describe('Décision du 16 octobre 2026 : la prise de 20 h couvre 20 h, le report n’emporte que 14 h', () => {
  it('Milo : le 1er lit 8 h, 14 h et 20 h, 8 h reste à donner, le 16 reçoit 14 h seule', () => {
    expect(readings(milo())).toEqual(MILO_AFTER)
    expect(reportEffects(milo())).toEqual(['moves'])
  })

  it('Milo : « Modifier » sur la posologie seule, même lecture', () => {
    const after = sameHoursAgain(milo(), THREE)
    expect(readings(after)).toEqual(MILO_AFTER)
    expect(reportEffects(after)).toEqual(['moves'])
  })

  it('Milo : heures passées à 8 h 01, 14 h 01, 20 h 01, la prise de 20 h couvre 20 h 01, 8 h 01 reste à donner, le 16 reçoit 14 h telle qu’écrite', () => {
    const after = sameHoursAgain(milo(), ['08:01', '14:01', '20:01'])
    expect(states(after, '2026-04-01', '2026-04-16')).toEqual([
      '2026-04-01 08:01 pending',
      '2026-04-01 20:01 covered',
      '2026-04-16 14:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
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

describe('La date choisie qui emmène un report reçoit la journée entière de son réglage (#796, décision du 16 octobre 2026)', () => {
  // Hebdomadaire à 8 h et 20 h, journée du 6 avril donnée ; le 9, la dose du 13 reportée au 15.
  function reportedTo15(): TreatmentViewInput {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-06', WEEK, H)],
      lines: [],
      today: '2026-04-06',
    }
    input = given(given(input, '2026-04-06', '08:00'), '2026-04-06', '20:00')
    return moved(on(input, '2026-04-09'), '2026-04-13', '08:00', '2026-04-15', false)
  }

  it.each([
    [['09:00'], ['2026-04-17 09:00', '2026-04-24 09:00', '2026-05-01 09:00']],
    [
      ['09:00', '21:00'],
      ['2026-04-17 09:00', '2026-04-17 21:00', '2026-04-24 09:00'],
    ],
    [THREE, ['2026-04-17 08:00', '2026-04-17 14:00', '2026-04-17 20:00']],
  ])(
    'le 9, heures %j, « Prochaine dose » le 17 : le 17 porte toutes les heures du nouveau réglage',
    (times, ensuite) => {
      const after = edited(reportedTo15(), {
        frequency: WEEK,
        times,
        endsOn: null,
        firstDueOn: '2026-04-17',
      })
      expect(readings(after)).toEqual(
        both({ phase: 'upcoming', moment: [ensuite[0]!], aRenseigner: [], ensuite }),
      )
    },
  )
})

describe('Un jour de grille qui reçoit un report garde ses doses et y ajoute les siennes (décision du 16 octobre 2026)', () => {
  it('hebdomadaire à 20 h, la dose du 13 avril reportée au 15, puis tous les 3 jours à 8 h et 20 h dès le 12 : le 15 montre 8 h et 20 h', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-06', WEEK, ['20:00'])],
      lines: [],
      today: '2026-04-06',
    }
    input = given(input, '2026-04-06', '20:00')
    input = moved(on(input, '2026-04-09'), '2026-04-13', '20:00', '2026-04-15', false)
    const after = edited(input, {
      frequency: { value: 3, unit: 'day' },
      times: H,
      endsOn: null,
      firstDueOn: '2026-04-12',
    })
    expect(states(after, '2026-04-12', '2026-04-15')).toEqual([
      '2026-04-12 08:00 pending',
      '2026-04-12 20:00 pending',
      '2026-04-15 08:00 pending',
      '2026-04-15 20:00 pending',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
    expect(reportEffects(after)).toEqual(['moves'])
  })
})

describe('Le jour choisi garde ensuite les heures du réglage qui l’a choisi', () => {
  function chosenOn17(): TreatmentViewInput {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-06', WEEK, H)],
      lines: [],
      today: '2026-04-06',
    }
    input = given(given(input, '2026-04-06', '08:00'), '2026-04-06', '20:00')
    input = moved(on(input, '2026-04-09'), '2026-04-13', '08:00', '2026-04-15', false)
    return edited(input, {
      frequency: WEEK,
      times: ['09:00'],
      endsOn: null,
      firstDueOn: '2026-04-17',
    })
  }

  it('le même jour, 9 h 01 (R10, un seul « Modifier ») : le 17 à 9 h 01, puis le 24', () => {
    const after = sameHoursAgain(chosenOn17(), ['09:01'])
    expect(readings(after).moteur.ensuite).toEqual([
      '2026-04-17 09:01',
      '2026-04-24 09:01',
      '2026-05-01 09:01',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })

  it('le 10, 10 h : le 17, jour choisi qui a emmené le report, garde 9 h ; le 24 à 10 h', () => {
    const after = sameHoursAgain(on(chosenOn17(), '2026-04-10'), ['10:00'])
    expect(readings(after).moteur.ensuite).toEqual([
      '2026-04-17 09:00',
      '2026-04-24 10:00',
      '2026-05-01 10:00',
    ])
    expect(readings(after).moteur).toEqual(readings(after).reference)
  })
})

describe('Le jour où les heures changent, un report ne se juge sur ses heures que si la journée est relue', () => {
  // Graine 6100002653 : chaque semaine à 20 h dès le 10 avril, la dose du 10 reportée au 15 et donnée ;
  // le même jour, 8 h et 20 h, la dose de 8 h du 10 marquée oubliée.
  function missedOnTheTenth(): TreatmentViewInput {
    return {
      settings: [
        setting('s1', '2026-04-10', WEEK, ['20:00']),
        setting('s2', '2026-04-10', WEEK, H, { gridOriginOn: null, firstDueChosen: false }),
      ],
      lines: [
        line('s1', 'postponed', '2026-04-10', '20:00', '2026-04-15'),
        line('s1', 'shift', '2026-04-10', '20:00', '2026-04-15'),
        line('s1', 'given', '2026-04-15', '20:00'),
        line('s1', 'shift', '2026-04-15', '20:00', '2026-04-10'),
        line('s2', 'missed', '2026-04-10', '08:00'),
      ],
      today: '2026-04-10',
    }
  }

  it('graine 6100002653 : l’oubli de 8 h, à une heure de la journée, ne bat pas le report de 20 h écrit avant ; le 15 garde sa dose', () => {
    expect(states(missedOnTheTenth(), '2026-04-11', '2026-04-15')).toEqual([
      '2026-04-15 20:00 given',
    ])
    expect(reportEffects(missedOnTheTenth())).toEqual(['moves'])
  })

  it('graine 6100002653 : le 10, 20 h seule : l’oubli de 8 h, écrit après le report, ne se pose pas sur son heure ; le 15 garde sa dose (#863)', () => {
    const after = sameHoursAgain(missedOnTheTenth(), ['20:00'])
    expect(states(after, '2026-04-11', '2026-04-15')).toEqual(['2026-04-15 20:00 given'])
    expect(reportEffects(after)).toEqual(['moves'])
  })

  it('graine 6100001162 : le jour d’arrivée d’un report garde ses heures ; le report de 18 h écrit ensuite, aux mêmes heures, n’emporte que 18 h', () => {
    const weekly = { endsOn: '2026-04-22' }
    const FOUR = ['06:00', '12:00', '18:00', '23:00']
    const input: TreatmentViewInput = {
      settings: [
        setting('s1', '2026-03-04', WEEK, FOUR, weekly),
        setting('s2', '2026-03-04', WEEK, FOUR, {
          ...weekly,
          startsOn: '2026-03-05',
          gridOriginOn: null,
          firstDueChosen: false,
        }),
      ],
      lines: [
        line('s1', 'given', '2026-03-04', '23:00'),
        line('s1', 'postponed', '2026-03-04', '06:00', '2026-03-05'),
        line('s1', 'shift', '2026-03-04', '06:00', '2026-03-05'),
        line('s1', 'given', '2026-03-04', '12:00'),
        line('s2', 'given', '2026-03-05', '06:00'),
        line('s2', 'postponed', '2026-03-05', '18:00', '2026-04-09'),
        line('s2', 'shift', '2026-03-05', '18:00', '2026-04-09'),
      ],
      today: '2026-03-05',
    }
    expect(states(input, '2026-04-09', '2026-04-09')).toEqual(['2026-04-09 18:00 pending'])
    const after = sameHoursAgain(input, ['06:01', '12:01', '18:01', '23:01'])
    expect(states(after, '2026-04-09', '2026-04-09')).toEqual(['2026-04-09 18:00 pending'])
    expect(readings(after).moteur).toEqual(readings(after).reference)
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

  // Fiche de #860 (16 octobre 2026) : les prises se posent d'abord, le report n'emporte que les heures
  // restées sans prise.
  it('graines 7600001452 et 7600002410 : A reporte 8 h du 5 au 6, B passe à 8 h 01, 14 h 01, 20 h 01 sans voir le report : 14 h 01 et 20 h 01 couvertes, le 6 ne réclame qu’une dose', () => {
    const phoneA = moved(base(), '2026-03-05', '08:00', '2026-03-06', false)
    const phoneB = sameHoursAgain(base(), ['08:01', '14:01', '20:01'])
    expect(phoneB.settings).toHaveLength(2)
    const synced = { ...phoneB, lines: phoneA.lines }
    const givenEffects = treatmentView(synced)
      .history.filter(({ line }) => line.status === 'given')
      .map(({ effect }) => effect.kind)
    expect(givenEffects).toEqual(['covers', 'covers'])
    expect(states(synced, '2026-03-05', '2026-06-05')).toEqual([
      '2026-03-05 14:01 covered',
      '2026-03-05 20:01 covered',
      '2026-03-06 08:01 pending',
      '2026-06-05 08:01 pending',
      '2026-06-05 14:01 pending',
      '2026-06-05 20:01 pending',
    ])
    expect(readings(synced).moteur).toEqual(readings(synced).reference)
  })

  // Graine 7700002507 : le 9, une prise de 8 h ; A donne d'avance la dose de 14 h du 9 ; B retire 8 h
  // le même jour (réglage réécrit à 14 h et 20 h).
  it('graine 7700002507 : après la synchro, le 9 lit 14 h et 20 h, la prise de 14 h couvre 14 h, celle de 8 h couvre 20 h, rien à donner, rien de « sans effet »', () => {
    let input: TreatmentViewInput = {
      settings: [setting('s1', '2026-04-07', TWO_DAYS, THREE)],
      lines: [],
      today: '2026-04-07',
    }
    input = on(given(input, '2026-04-09', '08:00'), '2026-04-08')
    input = sameHoursAgain(input, THREE)
    const phoneA = given(input, '2026-04-09', '14:00')
    const phoneB = sameHoursAgain(input, ['14:00', '20:00'])
    const synced = { ...phoneB, lines: phoneA.lines }
    expect(states(synced, '2026-04-09', '2026-04-09')).toEqual([
      '2026-04-09 14:00 given',
      '2026-04-09 20:00 covered',
    ])
    expect(treatmentView(synced).history.map(({ effect }) => effect.kind)).not.toContain('idle')
    expect(readings(synced).moteur).toEqual(readings(synced).reference)
  })
})
