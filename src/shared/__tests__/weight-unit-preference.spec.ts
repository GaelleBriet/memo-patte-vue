import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { computed } from 'vue'

import {
  applyWeightUnit,
  chooseWeightUnit,
  currentWeightUnit,
  restoreWeightUnit,
  WEIGHT_UNIT_STORAGE_KEY,
} from '../domain/weight-unit-preference'

function memoryStorage(): Pick<Storage, 'getItem' | 'setItem'> {
  const items = new Map<string, string>()
  return {
    getItem: (key) => items.get(key) ?? null,
    setItem: (key, value) => void items.set(key, value),
  }
}

beforeEach(() => {
  vi.stubGlobal('localStorage', memoryStorage())
})

afterEach(() => {
  applyWeightUnit('kg')
  vi.unstubAllGlobals()
})

describe('unité de poids de l’appareil', () => {
  it('part de la région du téléphone tant que rien n’a été choisi', () => {
    restoreWeightUnit(['en-US'])
    expect(currentWeightUnit()).toBe('lb')

    restoreWeightUnit(['en-GB'])
    expect(currentWeightUnit()).toBe('kg')
  })

  it('retient le choix fait dans Paramètres, quelle que soit la région', () => {
    chooseWeightUnit('lb')
    applyWeightUnit('kg')

    restoreWeightUnit(['fr-FR'])

    expect(localStorage.getItem(WEIGHT_UNIT_STORAGE_KEY)).toBe('lb')
    expect(currentWeightUnit()).toBe('lb')
  })

  it('ignore une valeur enregistrée inconnue', () => {
    localStorage.setItem(WEIGHT_UNIT_STORAGE_KEY, 'stone')

    restoreWeightUnit(['en-US'])

    expect(currentWeightUnit()).toBe('lb')
  })

  it('change l’unité pour la session même quand le stockage refuse d’écrire', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota')
      },
    })
    vi.spyOn(console, 'warn').mockImplementation(() => {})

    chooseWeightUnit('lb')

    expect(currentWeightUnit()).toBe('lb')
  })

  it('garde les kilos quand le stockage est illisible', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => {
        throw new Error('bloqué')
      },
    })

    restoreWeightUnit(['fr-FR'])

    expect(currentWeightUnit()).toBe('kg')
  })

  it('prévient les écrans ouverts du changement', () => {
    const shown = computed(() => currentWeightUnit())
    expect(shown.value).toBe('kg')

    chooseWeightUnit('lb')

    expect(shown.value).toBe('lb')
  })
})
