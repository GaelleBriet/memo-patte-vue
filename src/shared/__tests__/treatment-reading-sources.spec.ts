// @vitest-environment node
import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

const READERS = ['src/features/home/logic/todo-items.ts']

const OLD_ENGINE = /from '[^']*treatment-schedule[^']*'/g

describe('écrans de lecture branchés sur la lecture unique (R12)', () => {
  it.each(READERS)('%s ne lit plus l’ancien moteur', (path) => {
    const source = readFileSync(path, 'utf8')
    expect([...source.matchAll(OLD_ENGINE)].map(([match]) => match)).toEqual([])
  })
})
