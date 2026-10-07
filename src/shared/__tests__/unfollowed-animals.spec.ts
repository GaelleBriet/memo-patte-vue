// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { takesNewCare, unfollowedEntry } from '../domain/unfollowed-animals'

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

describe('takesNewCare', () => {
  it('AN-9 : un animal suivi reçoit de nouveaux soins', () => {
    expect(takesNewCare({ unfollowedOn: null })).toBe(true)
  })

  it('AN-9 : plus aucun soin pour un animal qu’on ne suit plus', () => {
    expect(takesNewCare({ unfollowedOn: '2026-10-01' })).toBe(false)
  })

  it('rien tant que l’animal n’est pas connu', () => {
    expect(takesNewCare(null)).toBe(false)
  })
})
