import { afterEach, describe, expect, it } from 'vitest'

import {
  shownWeightDelta,
  weightDeltaSinceText,
  weightDeltaText,
  weightTrend,
  type WeightChange,
} from '../domain/weight-delta'
import { weightNumber } from '../domain/weight-display'
import { toKg, type WeightUnit } from '../domain/weight-unit'
import { applyWeightUnit } from '../domain/weight-unit-preference'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

afterEach(() => {
  applyWeightUnit('kg')
  applyLocale('fr')
})

function change(
  previousKg: number,
  latestKg: number,
  previousMeasuredOn = '2026-08-25',
): WeightChange {
  return { previousKg, latestKg, previousMeasuredOn }
}

function enLivres(previousLb: number, latestLb: number): WeightChange {
  return change(toKg(previousLb, 'lb'), toKg(latestLb, 'lb'))
}

describe('shownWeightDelta', () => {
  it('soustrait les deux poids tels qu’ils s’affichent, au dixième', () => {
    expect(shownWeightDelta(change(24.2, 24.5))).toBe(0.3)
    expect(shownWeightDelta(change(24.54, 24.5))).toBe(0)
  })

  it('en livres, soustrait les poids arrondis plutôt que l’écart converti', () => {
    applyWeightUnit('lb')

    expect(shownWeightDelta(change(24.1, 24.3))).toBe(0.5)
    expect(shownWeightDelta(enLivres(53.4, 54))).toBe(0.6)
  })

  it('ne laisse aucun écart entre la variation lue et les deux poids lus, en kg comme en lb', () => {
    const lu = (texte: string) =>
      Number(
        texte
          .replace('−', '-')
          .replace(/[^\d,.-]/g, '')
          .replace(',', '.'),
      )

    for (const unit of ['kg', 'lb'] as WeightUnit[]) {
      applyWeightUnit(unit)
      const ecarts: string[] = []
      for (let index = 0; index < 3000; index += 1) {
        const previousKg = 0.5 + ((index * 0.37) % 60)
        const latestKg = previousKg + ((index * 0.013) % 3) - 1.5
        if (latestKg <= 0) continue
        const attendu = lu(weightNumber(latestKg)) - lu(weightNumber(previousKg))
        const affiche = lu(weightDeltaText(t, change(previousKg, latestKg)))
        if (Math.abs(affiche - attendu) > 1e-9) ecarts.push(`${unit} ${previousKg} → ${latestKg}`)
      }

      expect(ecarts).toEqual([])
    }
  })
})

describe('weightDeltaText', () => {
  it('écrit la variation seule, signée, avec son unité', () => {
    expect(weightDeltaText(t, change(24.2, 24.5))).toBe('+0,3 kg')
    expect(weightDeltaText(t, change(24.5, 24.2))).toBe('−0,3 kg')
    expect(weightDeltaText(t, change(24.5, 24.5))).toBe('±0,0 kg')
  })

  it('écrit en livres l’écart des deux poids affichés', () => {
    applyWeightUnit('lb')

    expect(weightDeltaText(t, change(24.1, 24.3))).toBe('+0,5 lb')
    expect(weightDeltaText(t, enLivres(53.4, 54))).toBe('+0,6 lb')
    expect(weightDeltaText(t, enLivres(54.02, 54))).toBe('±0,0 lb')
  })
})

describe('weightTrend', () => {
  it('suit le signe de la variation telle qu’elle s’affiche', () => {
    expect(weightTrend(change(24.2, 24.5))).toBe('up')
    expect(weightTrend(change(24.5, 24.2))).toBe('down')
    expect(weightTrend(change(24.5, 24.54))).toBe('flat')
  })

  it('juge une petite variation sur les poids affichés dans l’unité choisie', () => {
    applyWeightUnit('lb')

    expect(weightTrend(change(24.5, 24.54))).toBe('up')
    expect(weightTrend(enLivres(54.02, 54))).toBe('flat')
  })
})

describe('weightDeltaSinceText', () => {
  it('date la variation du jour de la pesée de référence, dans l’année en cours', () => {
    expect(weightDeltaSinceText(t, change(24.2, 24.5, '2026-08-25'), '2026-09-25')).toBe(
      '+0,3 kg depuis le 25 août',
    )
    expect(weightDeltaSinceText(t, change(23.7, 24.5, '2026-01-20'), '2026-09-25')).toBe(
      '+0,8 kg depuis le 20 janv.',
    )
  })

  it('ajoute l’année quand la pesée de référence n’est pas de l’année en cours', () => {
    expect(weightDeltaSinceText(t, change(24.5, 24.2, '2025-12-20'), '2026-01-12')).toBe(
      '−0,3 kg depuis le 20 déc. 2025',
    )
  })

  it('date aussi une variation nulle', () => {
    expect(weightDeltaSinceText(t, change(24.5, 24.5, '2026-08-25'), '2026-09-25')).toBe(
      '±0,0 kg depuis le 25 août',
    )
  })

  it('écrit la variation en livres quand l’unité choisie est la livre', () => {
    applyWeightUnit('lb')

    expect(weightDeltaSinceText(t, enLivres(53.3, 54), '2026-09-25')).toBe(
      '+0,7 lb depuis le 25 août',
    )
  })

  it('ne laisse jamais « le » ou « since » seul en fin de ligne', () => {
    const dernierBloc = (texte: string) => texte.split(' ').at(-1)
    const decembre = change(24.2, 24.5, '2025-12-20')

    expect(dernierBloc(weightDeltaSinceText(t, decembre, '2026-01-12'))).toBe('le 20 déc. 2025')
    applyLocale('en')
    expect(dernierBloc(weightDeltaSinceText(t, decembre, '2026-01-12'))).toBe('since Dec 20, 2025')
  })

  it('écrit « since » et la date à l’anglaise en anglais', () => {
    applyLocale('en')

    expect(weightDeltaSinceText(t, change(24.2, 24.5, '2026-08-25'), '2026-09-25')).toBe(
      '+0.3 kg since Aug 25',
    )
    expect(weightDeltaSinceText(t, change(24.5, 24.5, '2025-12-20'), '2026-01-12')).toBe(
      '±0.0 kg since Dec 20, 2025',
    )
    expect(weightDeltaText(t, change(24.5, 24.2))).toBe('−0.3 kg')
  })
})
