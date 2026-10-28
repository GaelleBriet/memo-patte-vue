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

  it('garde les ressources de Google Play Billing que shrinkResources retirerait', () => {
    const keep = readFileSync(
      resolve(__dirname, '../../android/app/src/main/res/raw/keep.xml'),
      'utf8',
    )
    const kept = keep.match(/tools:keep="([^"]*)"/)?.[1]?.split(',') ?? []

    expect(kept).toEqual([
      '@raw/com_android_billingclient_heterodyne_info',
      '@raw/com_android_billingclient_registration_info',
      '@xml/com_android_billingclient_phenotype',
    ])
  })
})
