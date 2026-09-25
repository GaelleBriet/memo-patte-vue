import { afterEach, describe, expect, it } from 'vitest'

import { weightDeltaSinceText, weightDeltaText } from '../domain/weight-delta'
import i18n, { applyLocale } from '@/core/i18n'

const t = i18n.global.t

describe('weightDeltaText', () => {
  it('écrit la variation seule, signée, avec son unité', () => {
    expect(weightDeltaText(t, 0.3)).toBe('+0,3 kg')
    expect(weightDeltaText(t, -0.3)).toBe('−0,3 kg')
    expect(weightDeltaText(t, 0)).toBe('±0,0 kg')
  })
})

describe('weightDeltaSinceText', () => {
  afterEach(() => applyLocale('fr'))

  it('date la variation du jour de la pesée de référence, dans l’année en cours', () => {
    expect(weightDeltaSinceText(t, 0.3, '2026-08-25', '2026-09-25')).toBe(
      '+0,3 kg depuis le 25\u00a0août',
    )
    expect(weightDeltaSinceText(t, 0.8, '2026-01-20', '2026-09-25')).toBe(
      '+0,8 kg depuis le 20\u00a0janv.',
    )
  })

  it('ajoute l’année quand la pesée de référence n’est pas de l’année en cours', () => {
    expect(weightDeltaSinceText(t, -0.3, '2025-12-20', '2026-01-12')).toBe(
      '−0,3 kg depuis le 20\u00a0déc.\u00a02025',
    )
  })

  it('date aussi une variation nulle', () => {
    expect(weightDeltaSinceText(t, 0, '2026-08-25', '2026-09-25')).toBe(
      '±0,0 kg depuis le 25\u00a0août',
    )
  })

  it('écrit « since » et la date à l’anglaise en anglais', () => {
    applyLocale('en')

    expect(weightDeltaSinceText(t, 0.3, '2026-08-25', '2026-09-25')).toBe(
      '+0.3 kg since Aug\u00a025',
    )
    expect(weightDeltaSinceText(t, 0, '2025-12-20', '2026-01-12')).toBe(
      '±0.0 kg since Dec\u00a020,\u00a02025',
    )
    expect(weightDeltaText(t, -0.3)).toBe('−0.3 kg')
  })
})
