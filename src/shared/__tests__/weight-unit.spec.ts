import { describe, expect, it } from 'vitest'

import { MAX_WEIGHT_KG } from '../domain/weight-bounds'
import {
  defaultWeightUnit,
  exceedsMaxWeight,
  fromKg,
  isWeightUnit,
  KG_PER_LB,
  maxWeightIn,
  toKg,
  recordedWeightIn,
  weightKgFromInput,
} from '../domain/weight-unit'

const tenth = (value: number) => Math.round(value * 10) / 10

function range(from: number, to: number, step: number): number[] {
  const count = Math.round((to - from) / step)
  return Array.from(
    { length: count + 1 },
    (_, index) => Math.round((from + index * step) * 100) / 100,
  )
}

describe('conversion', () => {
  it('compte une livre pour exactement 0,45359237 kg', () => {
    expect(KG_PER_LB).toBe(0.45359237)
    expect(toKg(1, 'lb')).toBe(0.45359237)
    expect(fromKg(0.45359237, 'lb')).toBe(1)
  })

  it('convertit un poids de chien dans les deux sens', () => {
    expect(fromKg(24.5, 'lb')).toBeCloseTo(54.013, 3)
    expect(toKg(54, 'lb')).toBeCloseTo(24.494, 3)
  })

  it('laisse les kilos tels quels', () => {
    expect(fromKg(24.55, 'kg')).toBe(24.55)
    expect(toKg(24.55, 'kg')).toBe(24.55)
  })
})

describe('isWeightUnit', () => {
  it('ne reconnaît que kg et lb', () => {
    expect(isWeightUnit('kg')).toBe(true)
    expect(isWeightUnit('lb')).toBe(true)
    expect(isWeightUnit('lbs')).toBe(false)
    expect(isWeightUnit(null)).toBe(false)
  })
})

describe('maxWeightIn', () => {
  it('donne la borne haute dans chaque unité, au dixième qui reste permis', () => {
    expect(maxWeightIn('kg')).toBe(MAX_WEIGHT_KG)
    expect(maxWeightIn('lb')).toBe(440.9)
    expect(toKg(maxWeightIn('lb'), 'lb')).toBeLessThanOrEqual(MAX_WEIGHT_KG)
    expect(toKg(maxWeightIn('lb') + 0.1, 'lb')).toBeGreaterThan(MAX_WEIGHT_KG)
  })
})

describe('exceedsMaxWeight', () => {
  it('refuse tout poids au-delà de la borne annoncée dans l’unité, pas en deçà', () => {
    expect(exceedsMaxWeight(440.9, 'lb', null)).toBe(false)
    expect(exceedsMaxWeight(440.92, 'lb', null)).toBe(true)
    expect(exceedsMaxWeight(200, 'kg', null)).toBe(false)
    expect(exceedsMaxWeight(200.01, 'kg', null)).toBe(true)
    expect(exceedsMaxWeight(null, 'lb', null)).toBe(false)
  })

  it('laisse passer le poids enregistré rendu tel quel, même au-delà du dixième annoncé', () => {
    expect(exceedsMaxWeight(440.92, 'lb', MAX_WEIGHT_KG)).toBe(false)
    expect(exceedsMaxWeight(440.93, 'lb', MAX_WEIGHT_KG)).toBe(true)
  })
})

describe('recordedWeightIn', () => {
  it('rend les kilos au centième, sans le bruit d’une saisie en livres', () => {
    expect(recordedWeightIn(24.55, 'kg')).toBe(24.55)
    expect(recordedWeightIn(toKg(54.1, 'lb'), 'kg')).toBe(24.54)
  })

  it('rend les livres au centième', () => {
    expect(recordedWeightIn(24.55, 'lb')).toBe(54.12)
    expect(recordedWeightIn(toKg(54.2, 'lb'), 'lb')).toBe(54.2)
  })
})

describe('weightKgFromInput', () => {
  it('convertit une saisie en livres', () => {
    expect(weightKgFromInput(54, 'lb', null)).toBe(54 * KG_PER_LB)
    expect(weightKgFromInput(24.7, 'kg', null)).toBe(24.7)
  })

  it('rend une valeur absente ou illisible telle quelle, pour que la validation la refuse', () => {
    expect(weightKgFromInput(null, 'lb', null)).toBeNull()
    expect(weightKgFromInput(Number.NaN, 'lb', null)).toBeNaN()
  })

  it('garde le poids enregistré quand la valeur proposée revient sans changement', () => {
    expect(weightKgFromInput(54.12, 'lb', 24.55)).toBe(24.55)
    expect(weightKgFromInput(24.55, 'kg', 24.55)).toBe(24.55)
    expect(weightKgFromInput(24.54, 'kg', toKg(54.1, 'lb'))).toBe(toKg(54.1, 'lb'))
  })

  it('convertit la valeur dès qu’elle change', () => {
    expect(weightKgFromInput(54.13, 'lb', 24.55)).toBe(54.13 * KG_PER_LB)
  })
})

describe('aller-retour', () => {
  it('relit au dixième près toute pesée saisie au dixième en livres', () => {
    const drifted = range(0.1, maxWeightIn('lb'), 0.1).filter(
      (typed) => tenth(fromKg(weightKgFromInput(typed, 'lb', null)!, 'lb')) !== typed,
    )

    expect(drifted).toEqual([])
  })

  it('repropose à l’identique toute pesée saisie au centième en livres', () => {
    const drifted = range(0.01, 100, 0.01).filter((typed) => {
      const kg = weightKgFromInput(typed, 'lb', null)!
      return recordedWeightIn(kg, 'lb') !== typed
    })

    expect(drifted).toEqual([])
  })

  it('ne bouge plus une pesée corrigée puis réenregistrée sans toucher au poids', () => {
    let kg = 24.55
    for (let pass = 0; pass < 5; pass += 1) {
      kg = weightKgFromInput(recordedWeightIn(kg, 'lb'), 'lb', kg)!
    }

    expect(kg).toBe(24.55)
  })
})

describe('defaultWeightUnit', () => {
  it('choisit les livres quand la région du téléphone est les États-Unis', () => {
    expect(defaultWeightUnit(['en-US'])).toBe('lb')
    expect(defaultWeightUnit(['es-US', 'en-US'])).toBe('lb')
    expect(defaultWeightUnit(['fr-US'])).toBe('lb')
    expect(defaultWeightUnit(['en_us'])).toBe('lb')
  })

  it('garde les kilos partout ailleurs, Royaume-Uni compris', () => {
    expect(defaultWeightUnit(['en-GB'])).toBe('kg')
    expect(defaultWeightUnit(['fr-FR'])).toBe('kg')
    expect(defaultWeightUnit(['en-CA'])).toBe('kg')
  })

  it('suit la région de la première langue seulement', () => {
    expect(defaultWeightUnit(['fr-FR', 'en-US'])).toBe('kg')
  })

  it('garde les kilos sans région connue', () => {
    expect(defaultWeightUnit(['en'])).toBe('kg')
    expect(defaultWeightUnit([])).toBe('kg')
    expect(defaultWeightUnit(['zh-Hant-TW'])).toBe('kg')
  })

  it('lit la région derrière une écriture', () => {
    expect(defaultWeightUnit(['zh-Hans-US'])).toBe('lb')
  })
})
