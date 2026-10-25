import { describe, expect, it } from 'vitest'

import { refusalText, removeMoveRefusalText } from '../logic/treatment-refusal-texts'
import i18n from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t

describe('refus « arrival-shared » : deux reports arrivés le même jour (Q51)', () => {
  const refusal = { reason: 'arrival-shared', on: '2026-03-04' } as const

  it('« Prochaine dose » : « Change d’abord la date du report. »', () => {
    expect(refusalText(t, refusal, '2026-03-06')).toBe('Change d’abord la date du report.')
  })

  it('« Supprimer ce report » : « Supprime d’abord le report du 4 mars. »', () => {
    expect(plain(removeMoveRefusalText(t, refusal, '2026-03-06'))).toBe(
      'Supprime d’abord le report du 4 mars.',
    )
  })
})
