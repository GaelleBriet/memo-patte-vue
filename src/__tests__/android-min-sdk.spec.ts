import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const MIN_SDK_ANDROID_10 = 29

describe('version minimale d’Android', () => {
  it('reste à Android 10 (API 29) ou plus', () => {
    const gradle = readFileSync(resolve(__dirname, '../../android/variables.gradle'), 'utf8')
    const minSdk = Number(/minSdkVersion\s*=\s*(\d+)/.exec(gradle)?.[1])

    expect(minSdk).toBeGreaterThanOrEqual(MIN_SDK_ANDROID_10)
  })
})
