// @vitest-environment node
import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'

import { createIdTokenNonce } from '../logic/id-token-nonce'

describe('createIdTokenNonce', () => {
  it('rend un nonce aléatoire et son empreinte SHA-256 en hexadécimal', async () => {
    const { raw, hashed } = await createIdTokenNonce()

    expect(raw).toMatch(/^[0-9a-f]{64}$/)
    expect(hashed).toBe(createHash('sha256').update(raw).digest('hex'))
  })

  it('ne rend jamais deux fois le même nonce', async () => {
    const first = await createIdTokenNonce()
    const second = await createIdTokenNonce()

    expect(second.raw).not.toBe(first.raw)
  })
})
