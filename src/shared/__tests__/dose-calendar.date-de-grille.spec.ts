import { describe, expect, it } from 'vitest'

import { settingsApplied, type Setting, type TreatmentViewInput } from '../domain/dose-calendar'

// Décision 1 du 19 octobre 2026 : la grille d'un réglage n'est datée que par ce qui fait ses
// échéances (première échéance, date choisie, fréquence, origine, fin), jamais par ses heures.

const CREE = '2026-03-01T08:00:00.000Z'
const ECRIT = '2026-03-02T08:00:00.000Z'

const milo: Setting = {
  id: 's1',
  startsOn: '2026-03-02',
  firstDueOn: '2026-03-02',
  gridOriginOn: '2026-03-02',
  firstDueChosen: true,
  fallenDosesAnswer: 'unasked',
  endsOn: null,
  stoppedOn: null,
  frequency: { value: 1, unit: 'week' },
  times: ['08:00', '20:00'],
  createdAt: CREE,
  updatedAt: ECRIT,
  gridWrittenAt: ECRIT,
}

const input: TreatmentViewInput = { settings: [milo], lines: [], today: '2026-03-05' }

function rewritten(change: Partial<Setting>): Setting {
  const { id, stoppedOn: _stoppedOn, createdAt: _createdAt, ...setting } = milo
  const plan = { action: 'rewrite' as const, id, setting: { ...setting, ...change }, lines: [] }
  return settingsApplied(input, plan).settings[0]!
}

describe('date d’écriture de la grille dans le carnet que le moteur rejoue', () => {
  it.each<[string, Partial<Setting>]>([
    ['la première échéance', { firstDueOn: '2026-03-09' }],
    ['la date choisie', { firstDueChosen: false }],
    ['la fréquence', { frequency: { value: 2, unit: 'week' } }],
    ['l’origine de la grille', { gridOriginOn: null }],
    ['la fin', { endsOn: '2026-06-30' }],
  ])('avance quand %s change', (_, change) => {
    expect(rewritten(change).gridWrittenAt).not.toBe(ECRIT)
  })

  it.each<[string, Partial<Setting>]>([
    ['les heures', { times: ['07:00', '21:00'] }],
    ['la réponse à la question des doses tombées', { fallenDosesAnswer: 'not-due' }],
    ['rien', {}],
  ])('reste quand seule %s change', (_, change) => {
    expect(rewritten(change).gridWrittenAt).toBe(ECRIT)
  })

  it('les heures seules datent les réglages, pas la grille', () => {
    const after = rewritten({ times: ['07:00', '21:00'] })

    expect([after.updatedAt === ECRIT, after.gridWrittenAt === ECRIT]).toEqual([false, true])
  })
})
