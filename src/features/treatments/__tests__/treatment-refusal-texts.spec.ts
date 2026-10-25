import { afterEach, describe, expect, it } from 'vitest'

import { refusalText, removeMoveRefusalText } from '../logic/treatment-refusal-texts'
import i18n, { applyLocale } from '@/core/i18n'
import { plain } from '@/shared/__tests__/plain'

const t = i18n.global.t

describe('refus « arrival-shared » : le report à supprimer d’abord (Q51, Q52)', () => {
  const refusal = { reason: 'arrival-shared', on: '2026-03-04' } as const

  afterEach(() => applyLocale('fr'))

  it('« Prochaine dose » et « Supprimer ce report » : « Supprime d’abord le report du 4 mars. »', () => {
    expect(plain(refusalText(t, refusal, '2026-03-06'))).toBe(
      'Supprime d’abord le report du 4 mars.',
    )
    expect(plain(removeMoveRefusalText(t, refusal, '2026-03-06'))).toBe(
      'Supprime d’abord le report du 4 mars.',
    )
  })

  it('en anglais : « Delete the postponement of the Mar 4 dose first. »', () => {
    applyLocale('en')

    expect(plain(refusalText(t, refusal, '2026-03-06'))).toBe(
      'Delete the postponement of the Mar 4 dose first.',
    )
  })
})
