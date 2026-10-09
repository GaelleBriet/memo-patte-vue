import { describe, expect, it } from 'vitest'

import { formFailure, submitLabelKey } from '../form/form-screen'

describe('formFailure', () => {
  it('rien sans échec', () => {
    expect(formFailure({ notFound: false, loadFailed: false, saveFailed: false })).toBeNull()
  })

  it('l’élément introuvable passe avant l’échec de chargement, qui passe avant l’enregistrement', () => {
    expect(formFailure({ notFound: true, loadFailed: true, saveFailed: true })).toBe('notFound')
    expect(formFailure({ notFound: false, loadFailed: true, saveFailed: true })).toBe('load')
    expect(formFailure({ notFound: false, saveFailed: true })).toBe('save')
  })
})

describe('submitLabelKey', () => {
  it('« créer » ou « enregistrer », en cours ou non', () => {
    expect(submitLabelKey(false, false)).toBe('submit')
    expect(submitLabelKey(false, true)).toBe('submitting')
    expect(submitLabelKey(true, false)).toBe('save')
    expect(submitLabelKey(true, true)).toBe('saving')
  })
})
