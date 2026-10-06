// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { carnetSubtitle, nextFollowedAnimalId, unfollowedEntry } from '../logic/carnet-animal'

describe('nextFollowedAnimalId', () => {
  it('donne le premier animal suivi autre que celui qui part', () => {
    expect(nextFollowedAnimalId([{ id: 'milo' }, { id: 'luna' }], 'milo')).toBe('luna')
    expect(nextFollowedAnimalId([{ id: 'milo' }, { id: 'luna' }], 'luna')).toBe('milo')
  })

  it('rend null quand il ne reste aucun animal suivi', () => {
    expect(nextFollowedAnimalId([{ id: 'milo' }], 'milo')).toBeNull()
    expect(nextFollowedAnimalId([], 'milo')).toBeNull()
  })
})

const t = (key: string, named: Record<string, unknown> = {}, plural?: number) =>
  key === 'animals.carnet.subtitleSeparator'
    ? ' · '
    : `${key}${JSON.stringify(named)}${plural === undefined ? '' : `#${plural}`}`

const LUNA = {
  breed: 'Européenne',
  birthDate: '2020-03-01',
  birthDateApproximate: false,
  unfollowedOn: null,
  departureDate: null,
}

describe('carnetSubtitle', () => {
  it('AN-7 : race et âge pour un animal suivi', () => {
    expect(carnetSubtitle(t, LUNA, '2026-09-30')).toBe('Européenne · animals.age.year{"n":6}#6')
  })

  it('AN-10 : race et âge tant qu’aucune date du départ n’est saisie', () => {
    expect(carnetSubtitle(t, { ...LUNA, unfollowedOn: '2026-09-28' }, '2026-09-30')).toBe(
      'Européenne · animals.age.year{"n":6}#6',
    )
  })

  it('AN-10 : « jusqu’au » la date du départ, jamais le motif', () => {
    const luna = { ...LUNA, unfollowedOn: '2026-09-28', departureDate: '2026-09-28' }

    expect(carnetSubtitle(t, luna, '2026-09-30')).toBe(
      'animals.carnet.until{"date":"28 sept. 2026"}',
    )
  })

  it('rend null sans race, âge ni date', () => {
    expect(carnetSubtitle(t, { ...LUNA, breed: null, birthDate: null }, '2026-09-30')).toBeNull()
  })
})

describe('unfollowedEntry', () => {
  it('AN-10 : aucune ligne sans animal qu’on ne suit plus', () => {
    expect(unfollowedEntry([])).toBeNull()
  })

  it('AN-10 : ouvre le carnet du seul animal qu’on ne suit plus', () => {
    expect(unfollowedEntry([{ id: 'luna' }])).toEqual({
      count: 1,
      target: { kind: 'carnet', animalId: 'luna' },
    })
  })

  it('AN-10 : ouvre la liste dès deux animaux', () => {
    expect(unfollowedEntry([{ id: 'luna' }, { id: 'pixel' }])).toEqual({
      count: 2,
      target: { kind: 'list' },
    })
  })
})
