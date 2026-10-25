import { describe, expect, it } from 'vitest'

import {
  judgedGrid,
  newSettings,
  rewrittenSetting,
  settingsApplied,
  treatmentView,
  type Frequency,
  type Line,
  type Setting,
  type SettingFields,
  type SettingsPlan,
  type SettingsRequest,
  type TreatmentViewInput,
} from '../domain/dose-calendar'
import seeds from './fixtures/dose-calendar-grille-heritee-graines.json'

// Une période qui reprend la grille de la précédente sans la changer garde sa date de grille : la
// grille se lit comme le moteur la lit, décalages compris, à partir de la nouvelle première échéance.

const EVERY_3_DAYS: Frequency = { value: 3, unit: 'day' }
const MONTHLY: Frequency = { value: 1, unit: 'month' }
const WRITTEN = '2026-03-26T07:00:00.000Z'

function setting(id: string, fields: Partial<Setting>): Setting {
  const firstDueOn = fields.firstDueOn ?? fields.startsOn ?? '2026-03-26'
  return {
    id,
    startsOn: firstDueOn,
    firstDueOn,
    gridOriginOn: firstDueOn,
    firstDueChosen: true,
    fallenDosesAnswer: 'unasked',
    endsOn: null,
    stoppedOn: null,
    frequency: EVERY_3_DAYS,
    times: ['20:00'],
    createdAt: WRITTEN,
    ...fields,
  }
}

// Milo, tous les 3 jours à 20 h depuis le 26 mars (26, 29, 1er, 4…).
const milo = setting('s1', { startsOn: '2026-03-26' })

// « Modifier » à 6 h le 1er avril, heures seules : ce que l'app écrit.
const hoursOnly: SettingFields = {
  startsOn: '2026-04-01',
  firstDueOn: '2026-04-01',
  gridOriginOn: null,
  firstDueChosen: false,
  fallenDosesAnswer: 'unasked',
  endsOn: null,
  frequency: EVERY_3_DAYS,
  times: ['06:00'],
}

function inherits(
  settings: Setting[],
  change: Partial<SettingFields>,
  lines: Line[] = [],
): boolean {
  const opening = { ...hoursOnly, ...change }
  const input = { settings, lines, today: opening.startsOn }
  return judgedGrid(input, { action: 'create', setting: opening }).writtenAt !== undefined
}

const shift = (settingId: string, dueOn: string, targetOn: string): Line => ({
  id: `shift-${dueOn}`,
  settingId,
  dueOn,
  dueTime: '20:00',
  status: 'shift',
  givenOn: null,
  targetOn,
  decidedAt: '2026-03-13T08:00:00.000Z',
})

describe('une période ouverte garde la grille de celle qu’elle remplace', () => {
  it.each<[string, Partial<SettingFields>]>([
    ['« Modifier » aux heures seules (Milo)', {}],
    [
      'une première échéance choisie sur un jour de l’ancienne grille',
      { firstDueChosen: true, firstDueOn: '2026-04-04' },
    ],
    [
      'une origine égale à l’ancienne',
      { gridOriginOn: '2026-03-26', firstDueChosen: true, firstDueOn: '2026-04-04' },
    ],
    [
      '« Elles restent à renseigner » : origine posée sur un jour de l’ancienne grille',
      { gridOriginOn: '2026-04-04', firstDueChosen: true, firstDueOn: '2026-04-04' },
    ],
  ])('hérite : %s', (_, change) => {
    expect(inherits([milo], change)).toBe(true)
  })

  it.each<[string, Setting[], Partial<SettingFields>]>([
    [
      '« Prochaine dose » sur une autre date',
      [milo],
      { firstDueChosen: true, firstDueOn: '2026-04-02', gridOriginOn: '2026-04-02' },
    ],
    ['une origine hors de l’ancienne grille', [milo], { gridOriginOn: '2026-03-30' }],
    ['une autre fréquence', [milo], { frequency: { value: 2, unit: 'day' } }],
    ['une autre fin', [milo], { endsOn: '2026-06-30' }],
    ['« Reprendre » après un arrêt', [{ ...milo, stoppedOn: '2026-03-30' }], {}],
    ['« Reprendre » après la fin', [{ ...milo, endsOn: '2026-03-30' }], { endsOn: '2026-03-30' }],
    ['une première période', [], {}],
  ])('datée de sa création : %s', (_, settings, change) => {
    expect(inherits(settings, change)).toBe(false)
  })

  it('le 31 mars, « Prochaine dose » le 1er avril : le 1er était déjà une échéance (1er, 4, 7…), hérite', () => {
    const opening = {
      startsOn: '2026-03-31',
      firstDueChosen: true,
      firstDueOn: '2026-04-01',
      gridOriginOn: '2026-04-01',
      times: ['07:00'],
    }

    expect(inherits([milo], opening)).toBe(true)
  })

  it('une première échéance choisie avant celle que lisait une grille pas encore commencée : datée', () => {
    const future = setting('s1', {
      startsOn: '2026-03-26',
      firstDueOn: '2026-04-10',
      gridOriginOn: '2026-04-10',
    })

    const chosen = (day: string) => ({ firstDueChosen: true, firstDueOn: day, gridOriginOn: day })

    expect(inherits([future], chosen('2026-04-07'))).toBe(false)
    expect(inherits([future], chosen('2026-04-13'))).toBe(true)
  })
})

describe('une grille tournée par un décalage se lit comme le moteur la lit', () => {
  // Milo, tous les 2 jours à 20 h depuis le 10 mars ; la dose du 12 donnée le 13 en décalant la suite.
  const everyOther = setting('s1', { startsOn: '2026-03-10', frequency: { value: 2, unit: 'day' } })
  const turned = [shift('s1', '2026-03-12', '2026-03-13')]
  const on13 = { startsOn: '2026-03-13', frequency: { value: 2, unit: 'day' } as Frequency }

  it('le moteur lit 15, 17, 19', () => {
    const days = treatmentView({ settings: [everyOther], lines: turned, today: '2026-03-13' })
      .slots('2026-03-14', '2026-03-19')
      .map(({ due }) => due.dueOn)

    expect(days).toEqual(['2026-03-15', '2026-03-17', '2026-03-19'])
  })

  it('« Prochaine dose » le 18 change la grille : datée', () => {
    const chosen = {
      ...on13,
      firstDueChosen: true,
      firstDueOn: '2026-03-18',
      gridOriginOn: '2026-03-18',
      times: ['21:00'],
    }

    expect(inherits([everyOther], chosen, turned)).toBe(false)
  })

  it('les heures seules sous le décalage gardent la grille : hérite', () => {
    expect(
      inherits([everyOther], { ...on13, firstDueOn: '2026-03-15', times: ['21:00'] }, turned),
    ).toBe(true)
  })

  it('1 semaine devenue 7 jours sous un décalage : hérite si les jours sont les mêmes, sinon datée', () => {
    const weekly = setting('s1', { startsOn: '2026-03-02', frequency: { value: 1, unit: 'week' } })
    const lines = [shift('s1', '2026-03-09', '2026-03-10')]
    const days7 = { startsOn: '2026-03-12', frequency: { value: 7, unit: 'day' } as Frequency }

    expect(
      inherits([weekly], { ...days7, firstDueOn: '2026-03-17', gridOriginOn: '2026-03-17' }, lines),
    ).toBe(true)
    expect(
      inherits([weekly], { ...days7, firstDueOn: '2026-03-16', gridOriginOn: '2026-03-16' }, lines),
    ).toBe(false)
  })

  // Propriété : hériter, c'est que le moteur lise les mêmes jours, décalage compris, avant et après.
  it.each(
    [
      { value: 2, unit: 'day' },
      { value: 1, unit: 'week' },
      { value: 1, unit: 'month' },
    ].flatMap((frequency) =>
      [1, 2, 3].flatMap((late) =>
        [0, 1, 2, 3, 4, 5].map((offset) => [frequency as Frequency, late, offset] as const),
      ),
    ),
  )(
    '%o, une dose décalée de %i jours, première échéance choisie %i jours après la reprise',
    (frequency, late, offset) => {
      const first = setting('s1', { startsOn: '2026-01-31', frequency })
      const view = treatmentView({ settings: [first], lines: [], today: '2026-01-31' })
      const [departure] = view.slots('2026-02-15', '2026-12-31').map(({ due }) => due.dueOn)
      const arrival = new Date(Date.parse(`${departure}T00:00:00Z`) + late * 86_400_000)
        .toISOString()
        .slice(0, 10)
      const lines = [shift('s1', departure!, arrival)]
      const startsOn = arrival
      const day = new Date(Date.parse(`${startsOn}T00:00:00Z`) + offset * 86_400_000)
        .toISOString()
        .slice(0, 10)
      const opening = {
        ...hoursOnly,
        startsOn,
        firstDueOn: day,
        gridOriginOn: day,
        firstDueChosen: true,
        frequency,
      }
      const read = (settings: readonly Setting[]) =>
        treatmentView({ settings, lines, today: startsOn })
          .slots(day, '2027-12-31')
          .map(({ due }) => due.dueOn)
          .slice(0, 6)
      const after = settingsApplied(
        { settings: [first], lines, today: startsOn },
        { action: 'create', setting: opening },
      )

      expect(inherits([first], opening, lines)).toBe(
        JSON.stringify(read(after.settings)) === JSON.stringify(read([first])),
      )
    },
  )
})

describe('en mois, l’ancienne grille est celle que le moteur continue (jours 29 à 31)', () => {
  // Luna, chaque mois depuis le 31 janvier ; le 2 avril, « Prochaine dose » le 30 avril.
  const luna = [
    setting('s1', { startsOn: '2026-01-31', frequency: MONTHLY }),
    setting('s2', { startsOn: '2026-04-02', firstDueOn: '2026-04-30', frequency: MONTHLY }),
  ]
  const chosen = (day: string): Partial<SettingFields> => ({
    startsOn: '2026-05-05',
    firstDueOn: day,
    gridOriginOn: day,
    firstDueChosen: true,
    frequency: MONTHLY,
  })

  it('le 30 avril continue la grille du 31 janvier', () => {
    expect(inherits(luna.slice(0, 1), { ...chosen('2026-04-30'), startsOn: '2026-04-02' })).toBe(
      true,
    )
  })

  it('le 5 mai, « Prochaine dose » le 30 mai change la grille (31 mai, 30 juin, 31 juillet…)', () => {
    expect(inherits(luna, chosen('2026-05-30'))).toBe(false)
  })

  it('le 5 mai, « Prochaine dose » le 31 juillet garde la grille du 31 janvier', () => {
    expect(inherits(luna, chosen('2026-07-31'))).toBe(true)
  })

  it('29 février tous les 12 mois : le 28 février 2032 n’est pas sur la grille du 29 février 2028', () => {
    const yearly: Frequency = { value: 12, unit: 'month' }
    const leap = [
      setting('s1', { startsOn: '2028-02-29', frequency: yearly }),
      setting('s2', { startsOn: '2029-02-01', firstDueOn: '2029-02-28', frequency: yearly }),
    ]
    const opening = { ...chosen('2032-02-28'), startsOn: '2031-03-01', frequency: yearly }

    expect(inherits(leap, opening)).toBe(false)
    expect(
      inherits(leap, { ...opening, firstDueOn: '2032-02-29', gridOriginOn: '2032-02-29' }),
    ).toBe(true)
  })

  it('ne lit pas l’ancienne grille à travers un arrêt', () => {
    const resumed = [
      { ...luna[0]!, stoppedOn: '2026-03-10' },
      setting('s2', { startsOn: '2026-04-15', frequency: MONTHLY }),
    ]

    expect(inherits(resumed, chosen('2026-05-15'))).toBe(true)
    expect(inherits(resumed, chosen('2026-05-31'))).toBe(false)
  })
})

describe('fréquences lues sur la suite de jours', () => {
  it.each<[string, Frequency, Frequency, boolean]>([
    ['2 semaines et 14 jours', { value: 2, unit: 'week' }, { value: 14, unit: 'day' }, true],
    ['1 semaine et 7 jours', { value: 1, unit: 'week' }, { value: 7, unit: 'day' }, true],
    ['14 jours et 2 semaines', { value: 14, unit: 'day' }, { value: 2, unit: 'week' }, true],
    ['1 mois et 30 jours', { value: 1, unit: 'month' }, { value: 30, unit: 'day' }, false],
    ['4 semaines et 1 mois', { value: 4, unit: 'week' }, { value: 1, unit: 'month' }, false],
  ])('%s', (_, before, after, kept) => {
    const previous = setting('s1', { startsOn: '2026-03-02', frequency: before })
    const opening = {
      startsOn: '2026-03-20',
      firstDueOn: '2026-03-30',
      gridOriginOn: '2026-03-30',
      frequency: after,
    }

    expect(inherits([previous], opening)).toBe(kept)
  })

  it('à fréquence équivalente, une première échéance hors de l’ancienne grille : datée', () => {
    const previous = setting('s1', {
      startsOn: '2026-03-02',
      frequency: { value: 2, unit: 'week' },
    })
    const opening = {
      startsOn: '2026-03-20',
      firstDueOn: '2026-04-01',
      gridOriginOn: '2026-04-01',
      frequency: { value: 14, unit: 'day' } as Frequency,
    }

    expect(inherits([previous], opening)).toBe(false)
  })
})

describe('à l’écriture : la simulation date la grille comme une écriture neuve', () => {
  it('la simulation ne juge pas l’héritage, l’écriture si', () => {
    const input = { settings: [milo], lines: [], today: '2026-04-01' }
    const plan = { action: 'create', setting: hoursOnly } as const

    expect(settingsApplied(input, plan).settings.at(-1)!.gridWrittenAt).toBeUndefined()
    expect(judgedGrid(input, plan).writtenAt).toBe(WRITTEN)
  })

  it('l’ouverture garde la grille d’avant et sa date', () => {
    const input = { settings: [milo], lines: [], today: '2026-04-01' }

    expect(judgedGrid(input, { action: 'create', setting: hoursOnly }).before).toEqual({
      frequency: EVERY_3_DAYS,
      endsOn: null,
      writtenAt: WRITTEN,
      runs: [['2026-04-01', null]],
    })
  })

  describe('un réglage ouvert aujourd’hui et réécrit sur place se juge comme une ouverture', () => {
    const s2 = setting('s2', {
      startsOn: '2026-04-01',
      gridOriginOn: null,
      firstDueChosen: false,
      frequency: { value: 2, unit: 'day' },
      times: ['06:00'],
      createdAt: '2026-04-01T06:00:00.000Z',
      gridWrittenAt: '2026-04-01T06:00:00.000Z',
      gridBefore: judgedGrid(
        { settings: [milo], lines: [], today: '2026-04-01' },
        { action: 'create', setting: hoursOnly },
      ).before,
    })
    const rewritten = (today: string) =>
      rewrittenSetting(s2, hoursOnly, () => '2026-04-01T06:05:00.000Z', {
        input: { settings: [milo, s2], lines: [], today },
        lines: [],
      })

    it('remis à tous les 3 jours le jour même : la date de grille du 26 mars', () => {
      expect(rewritten('2026-04-01').gridWrittenAt).toBe(WRITTEN)
    })

    it('un autre jour, la réécriture date la grille', () => {
      expect(rewritten('2026-04-02').gridWrittenAt).toBe('2026-04-01T06:05:00.000Z')
    })

    // Trou connu #1259 (Q47) : la grille n'est pas datée par ce second geste, l'héritage de #977 prime.
    it.fails(
      'réécrit le jour même avec « Prochaine dose » le 4 avril, sur l’ancienne grille : la grille datée du geste',
      () => {
        const chosen = {
          ...hoursOnly,
          firstDueOn: '2026-04-04',
          gridOriginOn: '2026-04-04',
          firstDueChosen: true,
        }
        const next = rewrittenSetting(s2, chosen, () => '2026-04-01T06:05:00.000Z', {
          input: { settings: [milo, s2], lines: [], today: '2026-04-01' },
          lines: [],
        })
        expect(next.gridWrittenAt).toBe('2026-04-01T06:05:00.000Z')
      },
    )
  })

  describe('deux téléphones le même jour : la réécriture reprend la date gardée à l’ouverture', () => {
    // Milo, tous les 3 jours à 20 h depuis le 1er mars, prises du 1er, du 4 et du 7 ; le 10 mars.
    const p1 = setting('p1', {
      startsOn: '2026-03-01',
      createdAt: '2026-03-01T07:00:00.000Z',
      gridWrittenAt: '2026-03-01T07:00:00.000Z',
    })
    const given = ['2026-03-01', '2026-03-04', '2026-03-07'].map((day): Line => ({
      id: `prise-${day}`,
      settingId: 'p1',
      dueOn: day,
      dueTime: '20:00',
      status: 'given',
      givenOn: day,
      targetOn: null,
      decidedAt: `${day}T20:00:00.000Z`,
    }))
    const base: TreatmentViewInput = { settings: [p1], lines: given, today: '2026-03-10' }
    const opened = (request: SettingsRequest, id: string, at: string): Setting => {
      const result = newSettings(base, request)
      if (!('plan' in result) || result.plan.action !== 'create')
        throw new Error('pas une ouverture')
      const grid = judgedGrid(base, result.plan)
      const { setting: fields } = result.plan
      return {
        ...fields,
        id,
        stoppedOn: null,
        createdAt: at,
        gridWrittenAt: grid.writtenAt ?? at,
        gridBefore: grid.before,
      }
    }
    const atNine: SettingsRequest = { frequency: EVERY_3_DAYS, times: ['21:00'], endsOn: null }
    const atTen: SettingsRequest = { frequency: EVERY_3_DAYS, times: ['22:00'], endsOn: null }

    it('A passe à tous les 2 jours à 8 h, B à 21 h à 9 h, puis B à 22 h à 10 h : le 1er mars 7 h', () => {
      const onA = opened(
        { frequency: { value: 2, unit: 'day' }, times: ['20:00'], endsOn: null },
        'p2A',
        '2026-03-10T08:00:00.000Z',
      )
      const onB = opened(atNine, 'p3B', '2026-03-10T09:00:00.000Z')
      const synced = { ...base, settings: [p1, onA, onB] }
      const second = newSettings(synced, atTen)
      if (!('plan' in second) || second.plan.action !== 'rewrite')
        throw new Error('pas une réécriture')
      const rewrittenOnB = rewrittenSetting(
        onB,
        second.plan.setting,
        () => '2026-03-10T10:00:00.000Z',
        {
          input: synced,
          lines: second.plan.lines ?? [],
        },
      )

      expect(onA.gridWrittenAt).toBe('2026-03-10T08:00:00.000Z')
      expect(onB.gridWrittenAt).toBe('2026-03-01T07:00:00.000Z')
      expect(rewrittenOnB.gridWrittenAt).toBe('2026-03-01T07:00:00.000Z')
    })

    it('le même geste en un seul « Modifier » sur B : la même date', () => {
      expect(opened(atTen, 'p3B', '2026-03-10T09:00:00.000Z').gridWrittenAt).toBe(
        '2026-03-01T07:00:00.000Z',
      )
    })
  })
})

// Graines des propriétés de relecture (#977), verdict de la lecture de référence (grille d'avant l'ouverture).
describe('graines relevées contre la lecture du moteur', () => {
  it.each(seeds.map((seed) => [seed.seed, seed.step, seed.probe, seed.expected, seed] as const))(
    'graine %i, pas %i, essai %i : %s',
    (_, __, ___, expected, seed) => {
      const input = {
        settings: seed.settings,
        lines: seed.lines,
        today: seed.today,
      } as TreatmentViewInput
      const plan = seed.plan as SettingsPlan
      const opened =
        plan.action === 'rewrite' ? input.settings.find(({ id }) => id === plan.id) : undefined
      const date = judgedGrid(input, plan).writtenAt
      const verdict = date === undefined || date === opened?.createdAt ? 'datée' : 'hérite'

      expect(verdict).toBe(expected)
    },
  )
})
