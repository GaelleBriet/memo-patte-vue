import { describe, expect, it } from 'vitest'

import { plusScreenAccess } from '../logic/plus-screen-access'

describe('plusScreenAccess', () => {
  it('ouvre l’écran quand l’appareil a un compte Plus', () => {
    expect(plusScreenAccess(true)).toBe(true)
  })

  it('renvoie vers l’écran Plus quand l’appareil n’a aucun compte', () => {
    expect(plusScreenAccess(false)).toEqual({ name: 'plus' })
  })
})
