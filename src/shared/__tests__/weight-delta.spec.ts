import { afterEach, describe, expect, it } from 'vitest'

import { weightDeltaSinceText, weightDeltaText, weightTrend } from '../domain/weight-delta'
import { toKg } from '../domain/weight-unit'
import { applyWeightUnit } from '../domain/weight-unit-preference'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

afterEach(() => {
  applyWeightUnit('kg')
  applyLocale('fr')
})

describe('weightDeltaText', () => {
  it('écrit la variation seule, signée, avec son unité', () => {
    expect(weightDeltaText(t, 0.3)).toBe('+0,3 kg')
    expect(weightDeltaText(t, -0.3)).toBe('−0,3 kg')
    expect(weightDeltaText(t, 0)).toBe('±0,0 kg')
  })

  it('convertit l’écart brut avant de l’arrondir, en livres', () => {
    applyWeightUnit('lb')

    expect(weightDeltaText(t, toKg(54, 'lb') - toKg(53.4, 'lb'))).toBe('+0,6 lb')
    expect(weightDeltaText(t, 0.3)).toBe('+0,7 lb')
    expect(weightDeltaText(t, -0.02)).toBe('±0,0 lb')
  })
})

describe('weightTrend', () => {
  it('suit le signe de la variation telle qu’elle s’affiche', () => {
    expect(weightTrend(0.3)).toBe('up')
    expect(weightTrend(-0.3)).toBe('down')
    expect(weightTrend(0.04)).toBe('flat')
  })

  it('juge une petite variation à la décimale de l’unité choisie', () => {
    applyWeightUnit('lb')

    expect(weightTrend(0.04)).toBe('up')
    expect(weightTrend(-0.02)).toBe('flat')
  })
})

describe('weightDeltaSinceText', () => {
  it('date la variation du jour de la pesée de référence, dans l’année en cours', () => {
    expect(weightDeltaSinceText(t, 0.3, '2026-08-25', '2026-09-25')).toBe(
      '+0,3 kg depuis le 25 août',
    )
    expect(weightDeltaSinceText(t, 0.8, '2026-01-20', '2026-09-25')).toBe(
      '+0,8 kg depuis le 20 janv.',
    )
  })

  it('ajoute l’année quand la pesée de référence n’est pas de l’année en cours', () => {
    expect(weightDeltaSinceText(t, -0.3, '2025-12-20', '2026-01-12')).toBe(
      '−0,3 kg depuis le 20 déc. 2025',
    )
  })

  it('date aussi une variation nulle', () => {
    expect(weightDeltaSinceText(t, 0, '2026-08-25', '2026-09-25')).toBe('±0,0 kg depuis le 25 août')
  })

  it('écrit la variation en livres quand l’unité choisie est la livre', () => {
    applyWeightUnit('lb')

    expect(weightDeltaSinceText(t, toKg(0.7, 'lb'), '2026-08-25', '2026-09-25')).toBe(
      '+0,7 lb depuis le 25 août',
    )
  })

  it('ne laisse jamais « le » ou « since » seul en fin de ligne', () => {
    const dernierBloc = (texte: string) => texte.split(' ').at(-1)

    expect(dernierBloc(weightDeltaSinceText(t, 0.3, '2025-12-20', '2026-01-12'))).toBe(
      'le 20 déc. 2025',
    )
    applyLocale('en')
    expect(dernierBloc(weightDeltaSinceText(t, 0.3, '2025-12-20', '2026-01-12'))).toBe(
      'since Dec 20, 2025',
    )
  })

  it('écrit « since » et la date à l’anglaise en anglais', () => {
    applyLocale('en')

    expect(weightDeltaSinceText(t, 0.3, '2026-08-25', '2026-09-25')).toBe('+0.3 kg since Aug 25')
    expect(weightDeltaSinceText(t, 0, '2025-12-20', '2026-01-12')).toBe(
      '±0.0 kg since Dec 20, 2025',
    )
    expect(weightDeltaText(t, -0.3)).toBe('−0.3 kg')
  })
})
