// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { carnetAnimalToSelect, carnetSubtitle, nextFollowedAnimalId } from '../logic/carnet-animal'

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

describe('carnetAnimalToSelect', () => {
  it('choisit le premier animal suivi quand aucun n’est sélectionné', () => {
    expect(carnetAnimalToSelect(null, [{ id: 'milo' }, { id: 'luna' }])).toBe('milo')
  })

  it('ne change rien quand un animal est déjà sélectionné, suivi ou non', () => {
    expect(carnetAnimalToSelect({ id: 'luna' }, [{ id: 'milo' }, { id: 'luna' }])).toBeNull()
    expect(carnetAnimalToSelect({ id: 'parti' }, [{ id: 'milo' }])).toBeNull()
  })

  it('rien à choisir sans animal suivi', () => {
    expect(carnetAnimalToSelect(null, [])).toBeNull()
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

    expect(carnetSubtitle(t, luna, '2026-09-30')?.replaceAll('\u00a0', ' ')).toBe(
      'animals.carnet.until{"date":"28 sept. 2026"}',
    )
  })

  it('rend null sans race, âge ni date', () => {
    expect(carnetSubtitle(t, { ...LUNA, breed: null, birthDate: null }, '2026-09-30')).toBeNull()
  })
})
