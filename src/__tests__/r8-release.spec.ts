import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const gradle = readFileSync(resolve(__dirname, '../../android/app/build.gradle'), 'utf8').replace(
  /\/\/.*$/gm,
  '',
)

describe('R8 de la version publiée', () => {
  it('réduit et obscurcit la variante release seulement', () => {
    const release = gradle.match(/^ {8}release \{\n([\s\S]*?)^ {8}\}/m)?.[1] ?? ''

    expect(release).toMatch(/^\s*minifyEnabled true$/m)
    expect(release).toMatch(/^\s*shrinkResources true$/m)
    expect(gradle.match(/minifyEnabled|shrinkResources/g)).toHaveLength(2)
  })
})
