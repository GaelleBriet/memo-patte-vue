import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const gradle = readFileSync(resolve(__dirname, '../../android/app/build.gradle'), 'utf8')

describe('R8 de la version publiée', () => {
  it('réduit et obscurcit la variante release seulement', () => {
    const release = gradle.match(/buildTypes \{[\s\S]*/)?.[0] ?? ''

    expect(release).toMatch(/minifyEnabled true/)
    expect(release).toMatch(/shrinkResources true/)
    expect(gradle.match(/minifyEnabled/g)).toHaveLength(1)
  })
})
