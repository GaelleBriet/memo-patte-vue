import { describe, expect, it } from 'vitest'

import {
  keepsGrid,
  settingsApplied,
  type GridFacts,
  type Setting,
  type TreatmentViewInput,
} from '../domain/dose-calendar'

// Décision du 19 octobre 2026 : une période qui reprend la grille de la précédente sans la changer
// garde sa date de grille. Milo, tous les 3 jours à 20 h depuis le 26 mars (26, 29, 1er, 4…).

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
