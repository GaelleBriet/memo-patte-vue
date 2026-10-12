// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const READERS = [
  'src/shared/domain/treatment-reading.ts',
  'src/shared/domain/treatment-outlook.ts',
  'src/features/settings/logic/pdf-content.ts',
  'src/features/settings/logic/export-format.ts',
]

const OLD_ENGINE = /from '[^']*(treatment-schedule|treatment-end)[^']*'/g

describe('PDF, CSV et rappels du JSON branchés sur la lecture unique (R12)', () => {
  it.each(READERS)('%s ne lit plus l’ancien moteur', (path) => {
    const source = readFileSync(path, 'utf8')
    expect([...source.matchAll(OLD_ENGINE)].map(([match]) => match)).toEqual([])
  })
})
