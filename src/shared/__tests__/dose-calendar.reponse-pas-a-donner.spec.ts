// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  newSettings,
  settingsApplied,
  treatmentView,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { edited, given, moved, on, readings, removed } from './dose-calendar.reglage-corrige.aides'
import { H, MONTH, keys } from './dose-calendar.v2.aides'

const TWO_DAYS = { value: 2, unit: 'day' } as const
const THREE_DAYS = { value: 3, unit: 'day' } as const
const WEEK = { value: 1, unit: 'week' } as const
const QUARTER = { value: 3, unit: 'month' } as const
const stampOf = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`

const L = (
  id: string,
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string,
  n: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  settingId,
  status,
  dueOn,
  dueTime,
  givenOn: status === 'given' ? dueOn : null,
  targetOn: null,
  updatedAt: stampOf(n),
  ...extra,
})

const S = (id: string, n: number, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-03-06',
  firstDueOn: '2026-03-06',
  gridOriginOn: '2026-03-06',
  firstDueChosen: false,
  fallenDosesAnswer: 'unasked',
  endsOn: null,
  stoppedOn: null,
  frequency: MONTH,
  times: [],
  createdAt: stampOf(n),
  ...fields,
})

const slotsOf = (input: TreatmentViewInput, from: string, to: string) =>
  treatmentView(input)
    .slots(from, to)
    .map(({ due, state }) => `${keys([due])[0]} ${state}`)

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

const reportOf = (input: TreatmentViewInput, dueOn: string) =>
  treatmentView(input).history.find(
    ({ line }) => line.status === 'postponed' && line.dueOn === dueOn,
  )!.effect

// Graine 8000000726 : tous les 3 jours à 8 h et 20 h, réglages du 13 mars ; la dose de 14 h du 13
// reportée au 18 (arrivée qui ouvre le rythme), la dose de 8 h du 16 reportée au 23 ; le 23, « Modifier »
// tous les mois, sans heure, fin le 20 avril.
function graine726(): TreatmentViewInput {
  const until = { endsOn: '2026-03-20' }
  return {
    today: '2026-03-23',
    settings: [
      S('s1', 0, {
        ...until,
        startsOn: '2026-03-10',
        firstDueOn: '2026-03-10',
        gridOriginOn: '2026-03-10',
        frequency: TWO_DAYS,
        times: ['08:00', '14:00', '20:00'],
      }),
      S('s2', 5, {
        ...until,
        startsOn: '2026-03-13',
        firstDueOn: '2026-03-16',
        gridOriginOn: '2026-03-16',
        frequency: THREE_DAYS,
        times: H,
      }),
      S('s3', 21, {
        startsOn: '2026-03-13',
        firstDueOn: '2026-03-18',
        gridOriginOn: '2026-03-18',
        endsOn: '2026-04-20',
        times: ['20:00'],
      }),
    ],
    lines: [
      L('l1', 's1', 'given', '2026-03-10', '14:00', 7, { givenOn: '2026-03-09' }),
      L('l2', 's1', 'postponed', '2026-03-12', '08:00', 2, { targetOn: '2026-03-13' }),
      L('l3', 's1', 'shift', '2026-03-12', '08:00', 3, { targetOn: '2026-03-13' }),
      L('l4', 's2', 'given', '2026-03-23', '20:00', 25),
      L('l8', 's1', 'given', '2026-03-13', '08:00', 24, { givenOn: '2026-03-17' }),
      L('l10', 's1', 'postponed', '2026-03-13', '14:00', 12, { targetOn: '2026-03-18' }),
      L('l11', 's2', 'shift', '2026-03-13', '14:00', 13, { targetOn: '2026-03-18' }),
      L('l17', 's2', 'postponed', '2026-03-16', '08:00', 22, { targetOn: '2026-03-23' }),
      L('l18', 's3', 'shift', '2026-03-16', '08:00', 23, { targetOn: '2026-03-23' }),
    ],
  }
}

const SANS_HEURE = { frequency: MONTH, times: [], endsOn: '2026-04-20' }

describe('#873 : « Elles n’étaient pas à donner » retire les doses listées, et elles seules (décision de Gaelle du 18 octobre 2026)', () => {
  it('la question liste 14 h et 20 h du 18 mars ; la réponse les retire, le report du 13 devient sans effet, le 23 reste', () => {
    const input = graine726()
    const asked = newSettings(input, SANS_HEURE)
    expect('question' in asked && keys(asked.question.fallen)).toEqual([
      '2026-03-18 14:00',
      '2026-03-18 20:00',
    ])
    const after = edited(input, SANS_HEURE, 'correct')
    expect(after.settings.find(({ id }) => id === 's3')).toMatchObject({
      fallenDosesAnswer: 'not-due',
      answeredOn: '2026-03-23',
    })
    expect(slotsOf(after, '2026-03-13', '2026-05-31')).toEqual([
      '2026-03-13 08:00 given',
      '2026-03-23 08:00 pending',
      '2026-03-23 20:00 given',
      '2026-04-18 pending',
    ])
    expect(effectOf(after, 'l10')).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(effectOf(after, 'l17')).toMatchObject({ kind: 'moves', arrival: '2026-03-23' })
    const { moteur, reference } = readings(after)
    expect(moteur.aRenseigner).toEqual(['2026-03-10 08:00', '2026-03-10 20:00'])
    expect(moteur).toEqual(reference)
  })

  it('« Elles restent à renseigner » : rien n’est retiré, la réponse est écrite sur le réglage qui répond', () => {
    const after = edited(graine726(), SANS_HEURE, 'keep')
    expect(after.settings.at(-1)!.fallenDosesAnswer).toBe('stay-unlogged')
    expect(readings(after).moteur.aRenseigner).toContain('2026-03-18 14:00')
    expect(effectOf(after, 'l10')).toMatchObject({ kind: 'moves', arrival: '2026-03-18' })
  })

  it('aucune question posée : la même réécriture ne retire rien', () => {
    const after = edited(graine726(), SANS_HEURE, 'correct')
    const unasked = {
      ...after,
      settings: after.settings.map((each) =>
        each.id === 's3' ? { ...each, fallenDosesAnswer: 'unasked' as const } : each,
      ),
    }
    expect(effectOf(unasked, 'l10')).toMatchObject({ kind: 'moves', arrival: '2026-03-18' })
    expect(readings(unasked).moteur.aRenseigner).toContain('2026-03-18 14:00')
  })

  it('deux téléphones : un report plus récent que la réponse tient, son arrivée reste', () => {
    const after = edited(graine726(), SANS_HEURE, 'correct')
    const answeredAt = '2026-03-23T09:00:00.000Z'
    const settings = after.settings.map((each) =>
      each.id === 's3' ? { ...each, answeredAt, updatedAt: '2026-03-24T09:00:00.000Z' } : each,
    )
    const fresh = after.lines.map((line) =>
      line.id === 'l10' ? { ...line, updatedAt: '2026-03-23T18:00:00.000Z' } : line,
    )
    expect(effectOf({ ...after, settings }, 'l10')).toEqual({
      kind: 'idle',
      reason: 'nothing-to-move',
    })
    const merged = { ...after, settings, lines: fresh }
    expect(effectOf(merged, 'l10')).toMatchObject({ kind: 'moves', arrival: '2026-03-18' })
    expect(readings(merged).moteur.aRenseigner).toContain('2026-03-18 14:00')
  })

  // Relecture de #914 : Milo, chaque semaine à 8 h depuis le 2 mars ; le 8, la dose du 9 reportée au 11 ;
  // le 11, « C'est fait » sur la dose du 11, puis tous les 2 jours dès le 11, première dose le 13 ;
  // le 12, « Prochaine dose » le 18, sans question ; le 13, la prise du 11 supprimée.
  function milo(): TreatmentViewInput {
    let c: TreatmentViewInput = {
      settings: [
        S('w1', 0, {
          startsOn: '2026-03-02',
          firstDueOn: '2026-03-02',
          gridOriginOn: '2026-03-02',
          firstDueChosen: true,
          frequency: WEEK,
          times: ['08:00'],
        }),
      ],
      lines: [],
      today: '2026-03-02',
    }
    c = given(c, '2026-03-02', '08:00')
    c = moved(on(c, '2026-03-08'), '2026-03-09', '08:00', '2026-03-11', false)
    c = given(on(c, '2026-03-11'), '2026-03-11', '08:00')
    const everyTwoDays = { frequency: TWO_DAYS, times: ['08:00'], endsOn: null }
    c = edited(c, { ...everyTwoDays, firstDueOn: '2026-03-13' })
    const asked = newSettings(on(c, '2026-03-12'), { ...everyTwoDays, firstDueOn: '2026-03-18' })
    expect('plan' in asked).toBe(true)
    c = edited(on(c, '2026-03-12'), { ...everyTwoDays, firstDueOn: '2026-03-18' })
    return removed(on(c, '2026-03-13'), '2026-03-11', '08:00')
  }

  it('Milo (relecture de #914) : « Prochaine dose » sans question ne vaut pas réponse ; la prise du 11 supprimée, la dose du 11 revient (en retard, comme sur main) et le report du 9 reste', () => {
    const c = milo()
    expect(c.settings.every(({ fallenDosesAnswer }) => fallenDosesAnswer === 'unasked')).toBe(true)
    const { moteur, reference } = readings(c)
    expect(moteur).toEqual({
      phase: 'overdue',
      moment: ['2026-03-11 08:00'],
      aRenseigner: [],
      ensuite: ['2026-03-18 08:00', '2026-03-20 08:00', '2026-03-22 08:00'],
    })
    expect(reportOf(c, '2026-03-09')).toMatchObject({ kind: 'moves', arrival: '2026-03-11' })
    expect(moteur).toEqual(reference)
  })

  it('une réécriture sans question garde la réponse et sa date ; seule une réponse à la question la date', () => {
    const c = milo()
    const current = treatmentView(c).currentSetting!
    expect(current.fallenDosesAnswer).toBe('unasked')
    expect(current.answeredOn).toBeUndefined()
    const answered = settingsApplied(c, {
      action: 'rewrite',
      id: current.id,
      setting: { ...current, fallenDosesAnswer: 'not-due' },
      answered: true,
    })
    expect(answered.settings.find(({ id }) => id === current.id)).toMatchObject({
      fallenDosesAnswer: 'not-due',
      answeredOn: '2026-03-13',
    })
    const later = on(answered, '2026-03-15')
    const rewritten = settingsApplied(later, {
      action: 'rewrite',
      id: current.id,
      setting: { ...treatmentView(later).currentSetting!, times: ['09:00'] },
    })
    expect(rewritten.settings.find(({ id }) => id === current.id)).toMatchObject({
      fallenDosesAnswer: 'not-due',
      answeredOn: '2026-03-13',
    })
  })
})

describe('#873 : la date de la réponse est une donnée à part, que la date d’écriture du réglage ne déplace pas (décision du 18 octobre 2026)', () => {
  // Milo, chaque semaine depuis le 2 mars, 7 h 30 puis 8 h dès le 3 (dose du 2 donnée) ; le 20, 9 h et
  // « Elles n'étaient pas à donner » pour le 9 et le 16 ; le 22, 10 h sans question ; le 23, « C'est
  // fait » ; le 25, la prise du 23 supprimée.
  function miloAnswered(): { day20: TreatmentViewInput; day22: TreatmentViewInput } {
    let c: TreatmentViewInput = {
      settings: [
        S('m1', 0, {
          startsOn: '2026-03-02',
          firstDueOn: '2026-03-02',
          gridOriginOn: '2026-03-02',
          firstDueChosen: true,
          frequency: WEEK,
          times: ['07:30'],
        }),
      ],
      lines: [],
      today: '2026-03-02',
    }
    c = given(c, '2026-03-02', '07:30')
    c = edited(on(c, '2026-03-03'), { frequency: WEEK, times: ['08:00'], endsOn: null })
    const asked = newSettings(on(c, '2026-03-20'), {
      frequency: WEEK,
      times: ['09:00'],
      endsOn: null,
    })
    expect('question' in asked && keys(asked.question.fallen)).toEqual([
      '2026-03-09 08:00',
      '2026-03-16 08:00',
    ])
    const day20 = edited(
      on(c, '2026-03-20'),
      { frequency: WEEK, times: ['09:00'], endsOn: null },
      'correct',
    )
    const asked22 = newSettings(on(day20, '2026-03-22'), {
      frequency: WEEK,
      times: ['10:00'],
      endsOn: null,
    })
    expect('plan' in asked22).toBe(true)
    const day22 = edited(on(day20, '2026-03-22'), {
      frequency: WEEK,
      times: ['10:00'],
      endsOn: null,
    })
    return { day20, day22 }
  }

  it('Milo : le 22, 10 h sans question ouvre un réglage sans réponse ; la réponse reste datée du 20 ; le 9 et le 16 restent retirés', () => {
    const { day20, day22 } = miloAnswered()
    const answeredId = treatmentView(day20).currentSetting!.id
    expect(day22.settings.find(({ id }) => id === answeredId)).toMatchObject({
      fallenDosesAnswer: 'not-due',
      answeredOn: '2026-03-20',
    })
    expect(treatmentView(day22).currentSetting).toMatchObject({
      fallenDosesAnswer: 'unasked',
      times: ['10:00'],
    })
    const { moteur, reference } = readings(day22)
    expect(moteur).toMatchObject({
      phase: 'upcoming',
      moment: ['2026-03-23 10:00'],
      aRenseigner: [],
    })
    expect(moteur).toEqual(reference)
  })

  it('Milo : le 25, la prise du 23 supprimée, la dose du 23, jamais listée, revient ; le 9 et le 16 restent retirés', () => {
    const { day22 } = miloAnswered()
    let c = given(on(day22, '2026-03-23'), '2026-03-23', '10:00')
    c = removed(on(c, '2026-03-25'), '2026-03-23', '10:00')
    const { moteur, reference } = readings(c)
    expect([...moteur.moment, ...moteur.aRenseigner]).toEqual(['2026-03-23 10:00'])
    expect(moteur).toEqual(reference)
  })

  it('une dose tombée après le jour de la réponse reste, même quand le réglage a été réécrit plus tard', () => {
    const answered: TreatmentViewInput = {
      today: '2026-03-25',
      settings: [
        S('a1', 0, {
          startsOn: '2026-03-02',
          firstDueOn: '2026-03-23',
          gridOriginOn: '2026-03-02',
          frequency: WEEK,
          times: ['10:00'],
          fallenDosesAnswer: 'not-due',
          answeredAt: '2026-03-20T09:00:00.000Z',
          answeredOn: '2026-03-20',
          updatedAt: '2026-03-24T09:00:00.000Z',
        }),
      ],
      lines: [],
    }
    const { moteur, reference } = readings(answered)
    expect([...moteur.moment, ...moteur.aRenseigner]).toEqual(['2026-03-23 10:00'])
    expect(moteur).toEqual(reference)
  })
})

describe('#872 : « Elles n’étaient pas à donner » qui vide la période est refusée (décision de Gaelle du 18 octobre 2026)', () => {
  const request = { frequency: QUARTER, times: ['12:00', '18:00', '23:00'], endsOn: '2026-05-06' }

  it('doses du 4 et du 11 données, tous les 3 mois à 20 h, fin le 6 mai, dose du 18 mars reportée au 22 où elle ouvre le rythme ; le 23, 12, 18 et 23 h : refusée (#806), « Elles restent à renseigner » non', () => {
    let c: TreatmentViewInput = {
      settings: [
        S('w1', 0, {
          startsOn: '2026-03-04',
          firstDueOn: '2026-03-04',
          gridOriginOn: '2026-03-04',
          frequency: WEEK,
          times: ['20:00'],
        }),
      ],
      lines: [],
      today: '2026-03-17',
    }
    c = given(on(c, '2026-03-04'), '2026-03-04', '20:00')
    c = given(on(c, '2026-03-11'), '2026-03-11', '20:00')
    c = moved(on(c, '2026-03-17'), '2026-03-18', '20:00', '2026-03-22', false)
    c = edited(on(c, '2026-03-20'), { frequency: QUARTER, times: ['20:00'], endsOn: '2026-05-06' })
    expect(treatmentView(on(c, '2026-03-20')).currentSetting?.firstDueOn).toBe('2026-03-22')
    const asked = newSettings(on(c, '2026-03-23'), request)
    expect(asked).toMatchObject({
      question: { correct: { refusal: { reason: 'no-dose-before-end' } } },
    })
    expect('question' in asked && 'refusal' in asked.question.keep).toBe(false)
  })

  it('carnet sans aucune prise (Q39) : chaque semaine à 20 h, dose du 18 mars reportée au 22, puis tous les 3 mois à 20 h, fin le 6 mai (le 22 ouvre le rythme) ; le 23, 12, 18 et 23 h : « Elles n’étaient pas à donner » refusée, rien ne repart d’aujourd’hui', () => {
    let c: TreatmentViewInput = {
      settings: [
        S('w1', 0, {
          startsOn: '2026-03-04',
          firstDueOn: '2026-03-18',
          gridOriginOn: '2026-03-18',
          frequency: WEEK,
          times: ['20:00'],
        }),
      ],
      lines: [],
      today: '2026-03-17',
    }
    c = moved(c, '2026-03-18', '20:00', '2026-03-22', false)
    c = edited(on(c, '2026-03-20'), { frequency: QUARTER, times: ['20:00'], endsOn: '2026-05-06' })
    expect(c.lines.some(({ status }) => status === 'given' || status === 'missed')).toBe(false)
    const asked = newSettings(on(c, '2026-03-23'), request)
    expect('question' in asked && keys(asked.question.fallen)).toEqual(['2026-03-22 20:00'])
    expect(asked).toMatchObject({
      question: { correct: { refusal: { reason: 'no-dose-before-end' } } },
    })
    expect('question' in asked && 'refusal' in asked.question.keep).toBe(false)
  })
})
