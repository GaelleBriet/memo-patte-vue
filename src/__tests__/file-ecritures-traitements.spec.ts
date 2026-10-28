import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const WRITERS = [
  'features/treatments/service/treatment-stop.service.ts',
  'features/treatments/service/treatment-plan.service.ts',
  'features/treatments/service/treatment-doses.service.ts',
  'features/animals/service/animal-follow.service.ts',
  'features/animals/service/animal-deletion.service.ts',
  'features/treatments/store/treatments.store.ts',
]

describe('file des écritures de traitements en production', () => {
  it.each(WRITERS)('%s reçoit l’instance partagée', (path) => {
    const source = readFileSync(resolve(__dirname, '..', path), 'utf8')

    expect(source).toMatch(/\n +(queue: )?treatmentWriteQueue,\n *[)}]/)
  })
})
