import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8')

function mainActivityLaunchMode(): string | undefined {
  const activity = manifest
    .match(/<activity\b[^>]*>/g)
    ?.find((tag) => tag.includes('android:name=".MainActivity"'))
  return activity?.match(/android:launchMode="([^"]+)"/)?.[1]
}

describe('AndroidManifest.xml', () => {
  it('lance MainActivity en singleTop : un achat survit au passage de l’app en arrière-plan', () => {
    expect(mainActivityLaunchMode()).toBe('singleTop')
  })
})
