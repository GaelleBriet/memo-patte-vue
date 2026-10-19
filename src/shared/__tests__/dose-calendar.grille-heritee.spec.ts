import { describe, expect, it } from 'vitest'

import {
  keepsGrid,
  settingsApplied,
  treatmentView,
  type GridFacts,
  type Setting,
  type TreatmentViewInput,
} from '../domain/dose-calendar'

// Une période qui reprend la grille de la précédente sans la changer garde sa date de grille.
// Milo, tous les 3 jours à 20 h depuis le 26 mars (26, 29, 1er, 4…).

const EVERY_3_DAYS = { value: 3, unit: 'day' } as const

const milo: GridFacts = {
  firstDueOn: '2026-03-26',
  gridOriginOn: '2026-03-26',
  firstDueChosen: true,
  frequency: EVERY_3_DAYS,
  endsOn: null,
  stoppedOn: null,
}

type Opening = Omit<GridFacts, 'stoppedOn'> & { startsOn: string }

// « Modifier » à 6 h le 1er avril, heures seules : ce que l'app écrit.
const hoursOnly: Opening = {
  startsOn: '2026-04-01',
  firstDueOn: '2026-04-01',
  gridOriginOn: null,
  firstDueChosen: false,
  frequency: EVERY_3_DAYS,
  endsOn: null,
}

describe('une période ouverte garde la grille de celle qu’elle remplace', () => {
  it.each<[string, Partial<Opening>]>([
    ['« Modifier » aux heures seules (Milo)', {}],
    ['« Elles restent à renseigner » : mêmes jours', {}],
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
    expect(keepsGrid([milo], { ...hoursOnly, ...change })).toBe(true)
  })

  it.each<[string, readonly GridFacts[], Partial<Opening>]>([
    [
      '« Prochaine dose » sur une autre date',
      [milo],
      { firstDueChosen: true, firstDueOn: '2026-04-02', gridOriginOn: '2026-04-02' },
    ],
    [
      'une première échéance choisie hors de l’ancienne grille',
      [milo],
      { firstDueChosen: true, firstDueOn: '2026-04-02' },
    ],
    ['une origine hors de l’ancienne grille', [milo], { gridOriginOn: '2026-03-30' }],
    ['une autre fréquence', [milo], { frequency: { value: 2, unit: 'day' } }],
    ['une autre fin', [milo], { endsOn: '2026-06-30' }],
    ['« Reprendre » après un arrêt', [{ ...milo, stoppedOn: '2026-03-30' }], {}],
    ['« Reprendre » après la fin', [{ ...milo, endsOn: '2026-03-30' }], { endsOn: '2026-03-30' }],
    ['une première période', [], {}],
  ])('datée de sa création : %s', (_, periods, change) => {
    expect(keepsGrid(periods, { ...hoursOnly, ...change })).toBe(false)
  })

  it('lit l’ancienne grille à travers une période sans origine propre de même fréquence (R3)', () => {
    const second: GridFacts = {
      ...milo,
      firstDueOn: '2026-03-29',
      gridOriginOn: null,
      firstDueChosen: false,
    }
    const third = { ...hoursOnly, firstDueChosen: true, firstDueOn: '2026-04-07' }

    expect(keepsGrid([milo, second], third)).toBe(true)
    expect(keepsGrid([milo, second], { ...third, firstDueOn: '2026-04-08' })).toBe(false)
  })
})

describe('dans le carnet que le moteur rejoue', () => {
  const WRITTEN = '2026-03-26T07:00:00.000Z'
  const s1: Setting = {
    ...milo,
    id: 's1',
    startsOn: '2026-03-26',
    fallenDosesAnswer: 'unasked',
    times: ['20:00'],
    createdAt: WRITTEN,
  }
  const input: TreatmentViewInput = { settings: [s1], lines: [], today: '2026-04-01' }
  const opened = (change: Partial<Opening>) =>
    settingsApplied(input, {
      action: 'create',
      setting: { ...hoursOnly, ...change, times: ['06:00'], fallenDosesAnswer: 'unasked' },
    }).settings.at(-1)!

  it('la période qui hérite prend la date de grille de la précédente, sinon sa création', () => {
    expect(opened({}).gridWrittenAt).toBe(WRITTEN)
    expect(opened({ endsOn: '2026-06-30' }).gridWrittenAt).toBe(opened({}).createdAt)
  })
})

describe('en mois, l’ancienne grille est celle que le moteur continue (jours 29 à 31)', () => {
  const MONTHLY = { value: 1, unit: 'month' } as const
  // Luna, chaque mois depuis le 31 janvier ; le 2 avril, « Prochaine dose » le 30 avril.
  const luna: GridFacts[] = [
    { ...milo, firstDueOn: '2026-01-31', gridOriginOn: '2026-01-31', frequency: MONTHLY },
    { ...milo, firstDueOn: '2026-04-30', gridOriginOn: '2026-04-30', frequency: MONTHLY },
  ]
  const chosen = (day: string): Opening => ({
    startsOn: '2026-05-05',
    firstDueOn: day,
    gridOriginOn: day,
    firstDueChosen: true,
    frequency: MONTHLY,
    endsOn: null,
  })

  it('le 30 avril continue la grille du 31 janvier', () => {
    expect(keepsGrid(luna.slice(0, 1), { ...chosen('2026-04-30'), startsOn: '2026-04-02' })).toBe(
      true,
    )
  })

  it('le 5 mai, « Prochaine dose » le 30 mai change la grille (31 mai, 30 juin, 31 juillet…)', () => {
    expect(keepsGrid(luna, chosen('2026-05-30'))).toBe(false)
  })

  it('le 5 mai, « Prochaine dose » le 31 juillet garde la grille du 31 janvier', () => {
    expect(keepsGrid(luna, chosen('2026-07-31'))).toBe(true)
  })

  it('29 février tous les 12 mois : le 28 février 2032 n’est pas sur la grille du 29 février 2028', () => {
    const yearly = { value: 12, unit: 'month' } as const
    const leap: GridFacts[] = [
      { ...milo, firstDueOn: '2028-02-29', gridOriginOn: '2028-02-29', frequency: yearly },
      { ...milo, firstDueOn: '2029-02-28', gridOriginOn: '2029-02-28', frequency: yearly },
    ]
    const opening = { ...chosen('2032-02-28'), startsOn: '2031-03-01', frequency: yearly }

    expect(keepsGrid(leap, opening)).toBe(false)
    expect(
      keepsGrid(leap, { ...opening, firstDueOn: '2032-02-29', gridOriginOn: '2032-02-29' }),
    ).toBe(true)
  })

  it('ne lit pas l’ancienne grille à travers un arrêt', () => {
    const resumed: GridFacts[] = [
      { ...luna[0]!, stoppedOn: '2026-03-10' },
      { ...milo, firstDueOn: '2026-04-15', gridOriginOn: '2026-04-15', frequency: MONTHLY },
    ]

    expect(keepsGrid(resumed, chosen('2026-05-15'))).toBe(true)
    expect(keepsGrid(resumed, chosen('2026-05-31'))).toBe(false)
  })

  // Propriété : hériter, c'est que le moteur lise les mêmes jours avec et sans la nouvelle période.
  it.each(
    [1, 2, 3].flatMap((months) =>
      ['2026-01-29', '2026-01-30', '2026-01-31', '2026-03-31'].flatMap((origin) =>
        ['2026-05-28', '2026-05-29', '2026-05-30', '2026-05-31', '2026-06-30', '2026-07-31'].map(
          (day) => [months, origin, day] as const,
        ),
      ),
    ),
  )('tous les %i mois depuis le %s, première dose choisie le %s', (months, origin, day) => {
    const frequency = { value: months, unit: 'month' } as const
    const first: Setting = {
      id: 's1',
      startsOn: origin,
      firstDueOn: origin,
      gridOriginOn: origin,
      firstDueChosen: true,
      fallenDosesAnswer: 'unasked',
      endsOn: null,
      stoppedOn: null,
      frequency,
      times: [],
      createdAt: '2026-01-01T00:00:00.000Z',
    }
    const second: Setting = {
      ...first,
      id: 's2',
      startsOn: '2026-05-05',
      firstDueOn: day,
      gridOriginOn: day,
      createdAt: '2026-05-05T00:00:00.000Z',
    }
    const days = (settings: Setting[]) =>
      treatmentView({ settings, lines: [], today: '2026-05-05' })
        .slots(day, '2027-12-31')
        .map(({ due }) => due.dueOn)

    expect(keepsGrid([first], second)).toBe(
      JSON.stringify(days([first, second])) === JSON.stringify(days([first])),
    )
  })
})
