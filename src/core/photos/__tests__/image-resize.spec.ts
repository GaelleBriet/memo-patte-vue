// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { centeredSquare } from '../image-resize'

describe('centeredSquare', () => {
  it('garde le centre d’une photo en paysage', () => {
    expect(centeredSquare(4000, 3000)).toEqual({ x: 500, y: 0, side: 3000 })
  })

  it('garde le centre d’une photo en portrait', () => {
    expect(centeredSquare(3000, 4000)).toEqual({ x: 0, y: 500, side: 3000 })
  })

  it('prend toute une photo déjà carrée', () => {
    expect(centeredSquare(512, 512)).toEqual({ x: 0, y: 0, side: 512 })
  })
})
