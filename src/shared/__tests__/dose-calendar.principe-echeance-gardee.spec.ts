// @vitest-environment node
import { describe, expect, it } from 'vitest'

import {
  newSettings,
  treatmentView,
  type Frequency,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import type { Line, Setting } from '../domain/dose-calendar/types'
import { both, edited, given, moved, on, readings } from './dose-calendar.reglage-corrige.aides'
import { MONTH, proposedSetting, setting, TWO_DAYS, WEEK as WEEKLY } from './dose-calendar.v2.aides'

const THREE_DAYS = { value: 3, unit: 'day' } as const
const TWO_WEEKS = { value: 2, unit: 'week' } as const
const MATIN = '2026-04-07T09:00:00.000Z'
const SOIR = '2026-04-07T18:00:00.000Z'

const stampOf = (n: number) => `2026-01-01T00:00:${String(n).padStart(2, '0')}.000Z`

const L = (
  id: string,
  settingId: string,
  status: Line['status'],
  dueOn: string,
  dueTime: string | null,
  n: number,
  extra: Partial<Line> = {},
): Line => ({
  id,
  settingId,
  status,
  dueOn,
  dueTime,
  givenOn: status === 'given' || status === 'extra' ? dueOn : null,
  targetOn: null,
  updatedAt: stampOf(n),
  ...extra,
})

const S = (id: string, n: number, fields: Partial<Setting>): Setting => ({
  id,
  startsOn: '2026-03-17',
  firstDueOn: '2026-03-17',
  gridOriginOn: '2026-03-17',
  firstDueChosen: false,
  pastDosesStayUnlogged: false,
  endsOn: null,
  stoppedOn: null,
  frequency: THREE_DAYS,
  times: [],
  createdAt: stampOf(n),
  ...fields,
})

const effectOf = (input: TreatmentViewInput, id: string) =>
  treatmentView(input).history.find(({ line }) => line.id === id)!.effect

describe('R4, #847 : les journées laissées avant une première échéance posée plus loin se lisent sur la grille décalée (principe du 17 octobre 2026)', () => {
  // Graine 7830000046 : tous les 3 jours depuis le 17 mars ; le 31, la dose du 1er avril donnée
  // d'avance avec « Décaler aussi les doses suivantes » (la suite : 3, 6, 9 avril) ; le même jour,
  // « Prochaine dose » le 9 avril. Un autre téléphone avait noté la dose du 3 avril, donnée le 31.
  function luna(extra: Line[]): TreatmentViewInput {
    return {
      today: '2026-04-01',
      settings: [
        S('s1', 0, { firstDueChosen: true }),
        S('s2', 3, { startsOn: '2026-03-24', firstDueOn: '2026-03-23', gridOriginOn: null }),
        S('s3', 21, {
          startsOn: '2026-03-31',
          firstDueOn: '2026-04-09',
          gridOriginOn: '2026-04-09',
          firstDueChosen: true,
          endsOn: '2026-04-28',
        }),
      ],
      lines: [
        L('l19', 's2', 'given', '2026-04-01', null, 19, { givenOn: '2026-03-31' }),
        L('l20', 's2', 'shift', '2026-04-01', null, 20, { targetOn: '2026-03-31' }),
        ...extra,
      ],
    }
  }

  it('la prise du 1er avril garde son échéance, comme avant', () => {
    expect(effectOf(luna([]), 'l19')).toEqual({ kind: 'covers', key: '2026-04-01' })
  })

  it('la prise du 3 avril, journée de la grille décalée, garde son échéance au lieu d’être sans effet', () => {
    const third = L('l30', 's2', 'given', '2026-04-03', null, 30, { givenOn: '2026-03-31' })
    expect(effectOf(luna([third]), 'l30')).toEqual({ kind: 'covers', key: '2026-04-03' })
    expect(treatmentView(luna([third])).currentDoses.map(({ dueOn }) => dueOn)).toEqual([
      '2026-04-09',
    ])
  })
})

// Milo, tous les 3 jours (ou tous les 2 jours) à 20 h depuis le 26 mars, doses données ; le 3 avril,
// toutes les 2 semaines, première dose le 3 ; le 7, la dose du 3 est en retard (#867).
type Rythme = { frequency: Frequency; donnees: string[] }

const RYTHMES: [string, Rythme][] = [
  [
    'tous les 3 jours',
    { frequency: THREE_DAYS, donnees: ['2026-03-26', '2026-03-29', '2026-04-01'] },
  ],
  [
    'tous les 2 jours',
    { frequency: TWO_DAYS, donnees: ['2026-03-26', '2026-03-28', '2026-03-30', '2026-04-01'] },
  ],
]

function milo({ frequency, donnees }: Rythme): TreatmentViewInput {
  let input: TreatmentViewInput = {
    settings: [setting('s1', '2026-03-26', frequency, ['20:00'])],
    lines: [],
    today: '2026-03-26',
  }
  for (const day of donnees) input = given(on(input, day), day, '20:00')
  const s2 = proposedSetting('s2', '2026-04-03', TWO_WEEKS, ['20:00'], {
    createdAt: '2026-04-03T08:00:00.000Z',
  })
  return { ...input, settings: [...input.settings, s2], today: '2026-04-07' }
}

// La synchro : le réglage réécrit par B, les lignes écrites par A, chacun à son heure.
function synchronises(
  base: TreatmentViewInput,
  parA: TreatmentViewInput,
  parB: TreatmentViewInput,
  { linesAt, correctedAt }: { linesAt: string; correctedAt: string },
): TreatmentViewInput {
  const added = parA.lines.filter(({ id }) => !base.lines.some((line) => line.id === id))
  const corrected = { ...parB.settings.find(({ id }) => id === 's2')!, updatedAt: correctedAt }
  return {
    ...base,
    settings: base.settings.map((each) => (each.id === 's2' ? corrected : each)),
    lines: [...base.lines, ...added.map((line) => ({ ...line, updatedAt: linesAt }))],
  }
}

const passeA6h = (base: TreatmentViewInput) =>
  edited(base, { frequency: TWO_WEEKS, times: ['06:00'], endsOn: null }, 'correct')

const noteOf = (input: TreatmentViewInput, dueOn: string) =>
  input.lines.find((line) => line.dueOn === dueOn && line.status === 'given')!

describe.each(RYTHMES)(
  '#892 : la prise de A tient face à « Elles n’étaient pas à donner » de B et garde son échéance (décision du 17 octobre 2026), ancien rythme %s',
  (_, rythme) => {
    it.each([
      ['plus ancienne', MATIN, SOIR],
      ['plus récente', SOIR, MATIN],
    ])(
      'le 7, A note donnée la dose du 3 à 20 h, B passe à 6 h et répond « Elles n’étaient pas à donner » ; prise %s : « donnée le 7, en retard » sur le 3, puis le 17 à 6 h',
      (_, linesAt, correctedAt) => {
        const base = milo(rythme)
        const parA = given(base, '2026-04-03', '20:00')
        const merged = synchronises(base, parA, passeA6h(base), { linesAt, correctedAt })
        const note = noteOf(merged, '2026-04-03')
        expect(note.givenOn).toBe('2026-04-07')
        expect(effectOf(merged, note.id)).toEqual({ kind: 'covers', key: '2026-04-03 20:00' })
        expect(readings(merged)).toEqual(
          both({
            phase: 'upcoming',
            moment: ['2026-04-17 06:00'],
            aRenseigner: [],
            ensuite: ['2026-04-17 06:00', '2026-05-01 06:00', '2026-05-15 06:00'],
          }),
        )
      },
    )
  },
)

describe('#885 : le décalage d’un report ne part de sa journée que si la réécriture l’a ôtée du calendrier', () => {
  // Graine 8840000633, pas 26 (un téléphone) : toutes les 2 semaines à 6, 12, 18 et 23 h, puis toutes
  // les 6 semaines, « Prochaine dose » le 4 avril ; le 1er avril, arrivée d'un report parti du 27 mars,
  // la dose de 18 h reportée au 17 mai avec « Décaler aussi les doses suivantes ».
  const H4 = ['06:00', '12:00', '18:00', '23:00']
  const TWO_WEEKS_4 = { value: 2, unit: 'week' } as const
  const end = { endsOn: '2026-05-23' }
  const s1 = S('s1', 0, {
    startsOn: '2026-03-27',
    firstDueOn: '2026-03-27',
    gridOriginOn: '2026-03-27',
    frequency: TWO_WEEKS_4,
    times: H4,
    ...end,
    updatedAt: stampOf(1),
  })
  const s2 = S('s2', 4, {
    startsOn: '2026-03-26',
    firstDueOn: '2026-03-27',
    gridOriginOn: null,
    frequency: TWO_WEEKS_4,
    times: H4,
    ...end,
  })
  const s3 = S('s3', 7, {
    startsOn: '2026-03-26',
    firstDueOn: '2026-04-04',
    gridOriginOn: '2026-04-04',
    firstDueChosen: true,
    frequency: { value: 6, unit: 'week' },
    times: H4,
    ...end,
  })
  const lines = [
    L('l2', 's1', 'given', '2026-03-27', '06:00', 17, { givenOn: '2026-03-24' }),
    L('l5', 's2', 'postponed', '2026-03-27', '12:00', 12, { targetOn: '2026-04-01' }),
    L('l18', 's1', 'missed', '2026-04-01', '12:00', 18),
    L('l20', 's3', 'postponed', '2026-04-01', '18:00', 20, { targetOn: '2026-05-17' }),
    L('l21', 's3', 'shift', '2026-04-01', '18:00', 21, { targetOn: '2026-05-17' }),
  ]
  const carnet = (third: Setting): TreatmentViewInput => ({
    today: '2026-04-01',
    settings: [s1, s2, third],
    lines,
  })

  it('réglage réécrit ou créé, même lecture : le décalage est sans effet, le 4 avril reste', () => {
    const rewritten = carnet({ ...s3, updatedAt: stampOf(19) })
    const created = carnet({ ...s3, createdAt: stampOf(19) })
    expect(effectOf(rewritten, 'l21')).toEqual({ kind: 'idle', reason: 'overtaken' })
    expect(readings(rewritten)).toEqual(readings(created))
    expect(readings(rewritten).moteur.ensuite[0]).toBe('2026-04-04 06:00')
  })
})

describe.each(RYTHMES)(
  '#885 : un report plus récent fait avec « Décaler aussi les doses suivantes » tient avec son décalage (décision du 17 octobre 2026), ancien rythme %s',
  (_, rythme) => {
    const shiftOf = (input: TreatmentViewInput) =>
      input.lines.find((line) => line.status === 'shift')!

    it.each([
      ['date proposée (le 17)', undefined],
      ['« Prochaine dose » choisie le 17', '2026-04-17'],
    ])(
      'le 7, A reporte la dose du 3 au 10 avec la case, B passe à 6 h et répond « Elles n’étaient pas à donner », %s ; A plus récent : le 10 à 20 h, puis le 24 et le 8 mai à 6 h',
      (_, firstDueOn) => {
        const base = milo(rythme)
        const parA = moved(base, '2026-04-03', '20:00', '2026-04-10', true)
        const request = { frequency: TWO_WEEKS, times: ['06:00'], endsOn: null, firstDueOn }
        const parB = edited(base, request, 'correct')
        const merged = synchronises(base, parA, parB, { linesAt: SOIR, correctedAt: MATIN })
        expect(effectOf(merged, shiftOf(merged).id)).toEqual({ kind: 'shifts', from: '2026-04-03' })
        expect(readings(merged)).toEqual(
          both({
            phase: 'upcoming',
            moment: ['2026-04-10 20:00'],
            aRenseigner: [],
            ensuite: ['2026-04-10 20:00', '2026-04-24 06:00', '2026-05-08 06:00'],
          }),
        )
      },
    )

    it('B plus récent : le report et son décalage sont sans effet, rien le 10, puis le 17 à 6 h', () => {
      const base = milo(rythme)
      const parA = moved(base, '2026-04-03', '20:00', '2026-04-10', true)
      const merged = synchronises(base, parA, passeA6h(base), { linesAt: MATIN, correctedAt: SOIR })
      expect(effectOf(merged, shiftOf(merged).id)).toEqual({ kind: 'idle', reason: 'overtaken' })
      expect(readings(merged)).toEqual(
        both({
          phase: 'upcoming',
          moment: ['2026-04-17 06:00'],
          aRenseigner: [],
          ensuite: ['2026-04-17 06:00', '2026-05-01 06:00', '2026-05-15 06:00'],
        }),
      )
    })
  },
)

describe('Règle unique : une prise garde la journée et l’heure de sa ligne, quelle que soit la cause (décision du 17 octobre 2026)', () => {
  // Milo, chaque lundi à 8 h et 20 h ; le 9 mars, la dose de 20 h du 16 donnée d'avance ; le 11,
  // 9 h et « Prochaine dose » le 23.
  function lundis(): TreatmentViewInput {
    let c: TreatmentViewInput = {
      settings: [setting('m1', '2026-03-02', WEEKLY, ['08:00', '20:00'])],
      lines: [],
      today: '2026-03-02',
    }
    for (const day of ['2026-03-02', '2026-03-09']) {
      for (const hour of ['08:00', '20:00']) c = given(on(c, day), day, hour)
    }
    c = given(on(c, '2026-03-09'), '2026-03-16', '20:00')
    const request = { frequency: WEEKLY, times: ['09:00'], endsOn: null, firstDueOn: '2026-03-23' }
    return edited(on(c, '2026-03-11'), request)
  }

  it('le 14, la dose du 23 avancée au 17 avec la case : le 16 garde sa prise, le 17 à 9 h est à donner, puis 24 et 31 ; en retard le 18', () => {
    const c = moved(on(lundis(), '2026-03-14'), '2026-03-23', '09:00', '2026-03-17', true)
    expect(effectOf(c, noteOf(c, '2026-03-16').id)).toEqual({
      kind: 'covers',
      key: '2026-03-16 20:00',
    })
    expect(readings(on(c, '2026-03-14'))).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-03-17 09:00'],
        aRenseigner: [],
        ensuite: ['2026-03-17 09:00', '2026-03-24 09:00', '2026-03-31 09:00'],
      }),
    )
    expect(readings(on(c, '2026-03-18')).moteur.phase).toBe('overdue')
  })

  it('le 18, tous les 3 jours à 9 h : la première échéance, le 19 à 9 h, est à donner (« Prochaine dose » ne dit pas 22)', () => {
    const request = { frequency: THREE_DAYS, times: ['09:00'], endsOn: null }
    const result = newSettings(on(lundis(), '2026-03-18'), request)
    expect(result).toMatchObject({ plan: { setting: { firstDueOn: '2026-03-19' } } })
    expect(result).not.toHaveProperty('shownOn')
    const after = edited(on(lundis(), '2026-03-18'), request)
    expect(readings(after).moteur.ensuite).toEqual([
      '2026-03-19 09:00',
      '2026-03-22 09:00',
      '2026-03-25 09:00',
    ])
  })

  it('graine 8810000692, pas 14 : toutes les 6 semaines, la dose du 27 avril donnée d’avance, puis une fin le 25 avril : la prise reste « donnée », jamais grisée, rien n’est à donner', () => {
    const SIX_WEEKS = { value: 6, unit: 'week' } as const
    let c: TreatmentViewInput = {
      settings: [setting('f1', '2026-03-16', SIX_WEEKS, ['08:00', '20:00'])],
      lines: [],
      today: '2026-03-24',
    }
    c = given(c, '2026-04-27', '08:00')
    c = edited(c, { frequency: SIX_WEEKS, times: ['08:00', '20:00'], endsOn: '2026-04-25' })
    expect(effectOf(c, noteOf(c, '2026-04-27').id)).toEqual({
      kind: 'covers',
      key: '2026-04-27 08:00',
    })
    expect(readings(c).moteur.ensuite).toEqual([])
  })

  it('mensuel à 8 h et 20 h, la dose de 8 h du 2 avril donnée d’avance, « Prochaine dose » le 2 juin ; le 3 avril, chaque semaine : date proposée le 9 avril', () => {
    let c: TreatmentViewInput = {
      settings: [setting('n1', '2026-03-02', MONTH, ['08:00', '20:00'])],
      lines: [],
      today: '2026-03-02',
    }
    for (const hour of ['08:00', '20:00']) c = given(c, '2026-03-02', hour)
    c = given(on(c, '2026-03-30'), '2026-04-02', '08:00')
    c = edited(on(c, '2026-03-31'), {
      frequency: MONTH,
      times: ['08:00', '20:00'],
      endsOn: null,
      firstDueOn: '2026-06-02',
    })
    const result = newSettings(on(c, '2026-04-03'), {
      frequency: WEEKLY,
      times: ['08:00', '20:00'],
      endsOn: null,
    })
    expect(result).toMatchObject({ plan: { setting: { firstDueOn: '2026-04-09' } } })
  })
})

describe('#893 : une prise d’une journée retirée par une réécriture ne couvre pas l’arrivée d’un report plus récent (décision du 17 octobre 2026)', () => {
  // Graine 8810000692 : Milo, toutes les 6 semaines à 8 h et 20 h depuis le 16 mars ; la dose du 27
  // avril avancée au 23 mars (suite décalée au 17 mars), les deux doses du 23 mars données d'avance
  // (8 h le 13 mars, 20 h le 17 mars) ; le 24 mars, réglage aux mêmes heures, première dose le 28 avril.
  // Le téléphone A avance la dose du 28 avril au 23 avril ; le téléphone B choisit « Prochaine dose »
  // le 9 juin. A est le plus récent.
  const SIX_WEEKS = { value: 6, unit: 'week' } as const
  const H = ['08:00', '20:00']
  const s1 = S('s1', 0, {
    startsOn: '2026-03-16',
    firstDueOn: '2026-03-16',
    gridOriginOn: '2026-03-16',
    firstDueChosen: true,
    frequency: SIX_WEEKS,
    times: H,
  })
  const s2 = S('s2', 8, {
    startsOn: '2026-03-24',
    firstDueOn: '2026-04-28',
    gridOriginOn: null,
    frequency: SIX_WEEKS,
    times: H,
  })
  const parB = {
    ...s2,
    firstDueOn: '2026-06-09',
    gridOriginOn: '2026-06-09',
    firstDueChosen: true,
    updatedAt: '2026-06-01T00:00:01.000Z',
  }
  const base = [
    L('l1', 's1', 'missed', '2026-03-16', '08:00', 1),
    L('l2', 's1', 'postponed', '2026-04-27', '08:00', 2, { targetOn: '2026-03-23' }),
    L('l3', 's1', 'shift', '2026-04-27', '08:00', 7, { targetOn: '2026-03-17' }),
    L('l4', 's1', 'given', '2026-03-23', '08:00', 4, { givenOn: '2026-03-13' }),
    L('l5', 's1', 'given', '2026-03-16', '20:00', 5, { givenOn: '2026-03-12' }),
    L('l6', 's1', 'given', '2026-03-23', '20:00', 6, { givenOn: '2026-03-17' }),
  ]
  const avance: Line = {
    ...L('A2', 's2', 'postponed', '2026-04-28', '08:00', 0, { targetOn: '2026-04-23' }),
    updatedAt: '2026-06-01T00:00:02.000Z',
  }
  const carnet = (lines: Line[]): TreatmentViewInput => ({
    today: '2026-03-24',
    settings: [s1, parB],
    lines: [...base, ...lines],
  })

  it('après la synchro : la prise du 13 mars garde le 23 mars à 8 h, le 23 avril à 8 h reste à donner', () => {
    const merged = carnet([avance])
    expect(effectOf(merged, 'l4')).toEqual({ kind: 'covers', key: '2026-03-23 08:00' })
    expect(effectOf(merged, 'l6')).toEqual({ kind: 'covers', key: '2026-03-23 20:00' })
    expect(effectOf(merged, 'l2')).toEqual({ kind: 'idle', reason: 'nothing-to-move' })
    expect(effectOf(merged, 'A2')).toMatchObject({ kind: 'moves', arrival: '2026-04-23' })
    expect(readings(merged)).toEqual(
      both({
        phase: 'upcoming',
        moment: ['2026-04-23 08:00'],
        aRenseigner: [],
        ensuite: ['2026-04-23 08:00', '2026-06-09 08:00', '2026-06-09 20:00'],
      }),
    )
  })

  it('sur le téléphone B seul : les deux prises du 23 mars gardent leur échéance au lieu d’être sans effet', () => {
    const alone = carnet([])
    expect(effectOf(alone, 'l4')).toEqual({ kind: 'covers', key: '2026-03-23 08:00' })
    expect(effectOf(alone, 'l6')).toEqual({ kind: 'covers', key: '2026-03-23 20:00' })
    expect(readings(alone).moteur.ensuite).toEqual([
      '2026-06-09 08:00',
      '2026-06-09 20:00',
      '2026-07-21 08:00',
    ])
  })
})
